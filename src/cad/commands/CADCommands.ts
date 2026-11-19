import { isCADLayerLocked } from '../core/CADDocument';
import { CADHandleAllocator, createCadId } from '../core/CADRegistry';
import { applyAffine2D, buildInsertTransform2D, decomposeAffine2D } from '../core/CADTransform';
import type { CADDocument, CADEntity, CADLayer, Point2D } from '../core/CADTypes';
import {
  mirrorEntityAcrossLine,
  rotateEntityAround,
  scaleEntityAround,
  translateEntity
} from '../geometry/CADGeometry';
import type { CADCommand } from './CADCommand';

function cloneEntity(e: CADEntity): CADEntity {
  return structuredClone(e);
}

export class AddEntitiesCommand implements CADCommand {
  readonly id = createCadId('cmd');
  readonly labelVi: string;
  private added: CADEntity[];

  constructor(entities: CADEntity[], labelVi = 'Thêm đối tượng CAD') {
    this.added = entities.map(cloneEntity);
    this.labelVi = labelVi;
  }

  execute(doc: CADDocument): CADDocument {
    const allocator = new CADHandleAllocator(doc);
    const stamped = this.added.map(e => {
      const handle = e.handle || allocator.allocate();
      allocator.register(handle);
      return { ...cloneEntity(e), handle, dirty: true };
    });
    this.added = stamped.map(cloneEntity);
    return {
      ...doc,
      entities: [...doc.entities, ...stamped],
      nextHandleSeed: allocator.getNextSeed()
    };
  }

  undo(doc: CADDocument): CADDocument {
    const ids = new Set(this.added.map(e => e.id));
    return {
      ...doc,
      entities: doc.entities.filter(e => !ids.has(e.id))
    };
  }
}

export class DeleteEntitiesCommand implements CADCommand {
  readonly id = createCadId('cmd');
  readonly labelVi: string;
  private readonly targetIds: Set<string>;
  private snapshots: Array<{ index: number; entity: CADEntity }> = [];

  constructor(entityIds: string[], labelVi = 'Xóa đối tượng CAD') {
    this.targetIds = new Set(entityIds);
    this.labelVi = labelVi;
  }

  execute(doc: CADDocument): CADDocument {
    this.snapshots = [];
    const remaining: CADEntity[] = [];
    doc.entities.forEach((ent, index) => {
      if (this.targetIds.has(ent.id) && !isCADLayerLocked(doc, ent.layer)) {
        this.snapshots.push({ index, entity: cloneEntity(ent) });
      } else {
        remaining.push(ent);
      }
    });
    return { ...doc, entities: remaining };
  }

  undo(doc: CADDocument): CADDocument {
    if (this.snapshots.length === 0) return doc;
    const restored = [...doc.entities];
    for (const item of [...this.snapshots].sort((a, b) => a.index - b.index)) {
      const insertAt = Math.min(restored.length, item.index);
      restored.splice(insertAt, 0, cloneEntity(item.entity));
    }
    return { ...doc, entities: restored };
  }
}

export class TransformEntitiesCommand implements CADCommand {
  readonly id = createCadId('cmd');
  readonly labelVi: string;
  private readonly targetIds: Set<string>;
  private readonly transformer: (entity: CADEntity) => CADEntity;
  private beforeMap = new Map<string, CADEntity>();

  constructor(
    entityIds: string[],
    transformer: (entity: CADEntity) => CADEntity,
    labelVi: string
  ) {
    this.targetIds = new Set(entityIds);
    this.transformer = transformer;
    this.labelVi = labelVi;
  }

  execute(doc: CADDocument): CADDocument {
    this.beforeMap.clear();
    const entities = doc.entities.map(ent => {
      if (!this.targetIds.has(ent.id) || isCADLayerLocked(doc, ent.layer)) {
        return ent;
      }
      this.beforeMap.set(ent.id, cloneEntity(ent));
      return this.transformer(cloneEntity(ent));
    });
    return { ...doc, entities };
  }

  undo(doc: CADDocument): CADDocument {
    if (this.beforeMap.size === 0) return doc;
    return {
      ...doc,
      entities: doc.entities.map(ent => {
        const prev = this.beforeMap.get(ent.id);
        return prev ? cloneEntity(prev) : ent;
      })
    };
  }
}

export class MoveCommand extends TransformEntitiesCommand {
  constructor(entityIds: string[], dx: number, dy: number, dz = 0) {
    super(entityIds, e => translateEntity(e, dx, dy, dz), 'Di chuyển đối tượng');
  }
}

export class RotateCommand extends TransformEntitiesCommand {
  constructor(entityIds: string[], origin: Point2D, angleDeg: number) {
    super(entityIds, e => rotateEntityAround(e, origin, angleDeg), 'Xoay đối tượng');
  }
}

export class ScaleCommand extends TransformEntitiesCommand {
  constructor(entityIds: string[], origin: Point2D, factor: number) {
    super(entityIds, e => scaleEntityAround(e, origin, factor), 'Tỉ lệ đối tượng');
  }
}

export class MirrorCommand extends TransformEntitiesCommand {
  constructor(entityIds: string[], lineA: Point2D, lineB: Point2D) {
    super(entityIds, e => mirrorEntityAcrossLine(e, lineA, lineB), 'Đối xứng đối tượng');
  }
}

export class CopyEntitiesCommand extends AddEntitiesCommand {
  constructor(sourceEntities: CADEntity[], dx: number, dy: number, targetLayer?: string) {
    const copies = sourceEntities.map(src => {
      const shifted = translateEntity(cloneEntity(src), dx, dy, 0);
      return {
        ...shifted,
        id: createCadId('ent'),
        handle: '',
        rawDxf: undefined,
        dirty: true,
        layer: targetLayer || shifted.layer
      };
    });
    super(copies, `Sao chép ${copies.length} đối tượng`);
  }
}

export class ModifyEntityCommand implements CADCommand {
  readonly id = createCadId('cmd');
  readonly labelVi: string;
  private readonly entityId: string;
  private readonly patcher: (entity: CADEntity) => CADEntity;
  private beforeEntity: CADEntity | null = null;

  constructor(
    entityId: string,
    patcher: (entity: CADEntity) => CADEntity,
    labelVi = 'Cập nhật thuộc tính đối tượng'
  ) {
    this.entityId = entityId;
    this.patcher = patcher;
    this.labelVi = labelVi;
  }

  execute(doc: CADDocument): CADDocument {
    const entities = doc.entities.map(ent => {
      if (ent.id !== this.entityId) return ent;
      this.beforeEntity = cloneEntity(ent);
      const updated = this.patcher(cloneEntity(ent));
      return { ...updated, dirty: true, bounds: undefined };
    });
    return { ...doc, entities };
  }

  undo(doc: CADDocument): CADDocument {
    if (!this.beforeEntity) return doc;
    const restore = cloneEntity(this.beforeEntity);
    return {
      ...doc,
      entities: doc.entities.map(ent => (ent.id === this.entityId ? restore : ent))
    };
  }
}

export class ReplaceEntitiesCommand implements CADCommand {
  readonly id = createCadId('cmd');
  readonly labelVi: string;
  private readonly removedIds: Set<string>;
  private readonly replacements: CADEntity[];
  private removedSnapshots: Array<{ index: number; entity: CADEntity }> = [];
  private insertedIds: string[] = [];

  constructor(removedIds: string[], replacements: CADEntity[], labelVi = 'Cắt / Nối / Phá Block') {
    this.removedIds = new Set(removedIds);
    this.replacements = replacements.map(cloneEntity);
    this.labelVi = labelVi;
  }

  execute(doc: CADDocument): CADDocument {
    const allocator = new CADHandleAllocator(doc);
    this.removedSnapshots = [];
    const surviving: CADEntity[] = [];
    doc.entities.forEach((ent, index) => {
      if (this.removedIds.has(ent.id)) {
        this.removedSnapshots.push({ index, entity: cloneEntity(ent) });
      } else {
        surviving.push(ent);
      }
    });

    const added = this.replacements.map(r => {
      const h = r.handle || allocator.allocate();
      allocator.register(h);
      return { ...cloneEntity(r), handle: h, dirty: true, bounds: undefined };
    });
    this.insertedIds = added.map(a => a.id);

    return {
      ...doc,
      entities: [...surviving, ...added],
      nextHandleSeed: allocator.getNextSeed()
    };
  }

  undo(doc: CADDocument): CADDocument {
    const insSet = new Set(this.insertedIds);
    const base = doc.entities.filter(e => !insSet.has(e.id));
    for (const snap of [...this.removedSnapshots].sort((a, b) => a.index - b.index)) {
      base.splice(Math.min(base.length, snap.index), 0, cloneEntity(snap.entity));
    }
    return { ...doc, entities: base };
  }
}

export function buildExplodeInsertCommand(
  doc: CADDocument,
  insertEntityId: string
): ReplaceEntitiesCommand | null {
  const ent = doc.entities.find(e => e.id === insertEntityId);
  if (!ent || ent.type !== 'INSERT') return null;
  const blk = doc.blocks[ent.blockName];
  if (!blk) return null;

  const m = buildInsertTransform2D(ent.position, ent.scale, ent.rotation, blk.basePoint);
  const dec = decomposeAffine2D(m);
  const scaleAvg = (Math.abs(dec.scaleX) + Math.abs(dec.scaleY)) / 2;
  const expanded: CADEntity[] = [];

  for (const sub of blk.entities) {
    const baseCommon = {
      ...cloneEntity(sub),
      id: createCadId('ent'),
      handle: '',
      rawDxf: undefined,
      dirty: true,
      bounds: undefined,
      layer: sub.layer === '0' ? ent.layer : sub.layer
    };
    if (baseCommon.type === 'LINE') {
      const a = applyAffine2D(m, baseCommon.start);
      const b = applyAffine2D(m, baseCommon.end);
      expanded.push({
        ...baseCommon,
        start: { x: a.x, y: a.y, z: baseCommon.start.z },
        end: { x: b.x, y: b.y, z: baseCommon.end.z }
      });
    } else if (baseCommon.type === 'CIRCLE') {
      const c = applyAffine2D(m, baseCommon.center);
      expanded.push({
        ...baseCommon,
        center: { x: c.x, y: c.y, z: baseCommon.center.z },
        radius: baseCommon.radius * scaleAvg
      });
    } else if (baseCommon.type === 'ARC') {
      const c = applyAffine2D(m, baseCommon.center);
      expanded.push({
        ...baseCommon,
        center: { x: c.x, y: c.y, z: baseCommon.center.z },
        radius: baseCommon.radius * scaleAvg,
        startAngle: baseCommon.startAngle + dec.rotationDeg,
        endAngle: baseCommon.endAngle + dec.rotationDeg
      });
    } else if (baseCommon.type === 'LWPOLYLINE' || baseCommon.type === 'POLYLINE') {
      expanded.push({
        ...baseCommon,
        vertices: baseCommon.vertices.map(v => {
          const p = applyAffine2D(m, v);
          return { ...v, x: p.x, y: p.y };
        })
      });
    } else if (baseCommon.type === 'TEXT' || baseCommon.type === 'MTEXT') {
      const p = applyAffine2D(m, baseCommon.position);
      expanded.push({
        ...baseCommon,
        position: { x: p.x, y: p.y, z: baseCommon.position.z },
        height: baseCommon.height * scaleAvg,
        rotation: (baseCommon.rotation || 0) + dec.rotationDeg
      });
    }
  }

  return new ReplaceEntitiesCommand([ent.id], expanded, `Phá khối Block "${ent.blockName}"`);
}

export class UpsertLayerCommand implements CADCommand {
  readonly id = createCadId('cmd');
  readonly labelVi: string;
  private readonly layer: CADLayer;
  private prevLayer: CADLayer | undefined;

  constructor(layer: CADLayer, labelVi = `Cập nhật Layer "${layer.name}"`) {
    this.layer = structuredClone(layer);
    this.labelVi = labelVi;
  }

  execute(doc: CADDocument): CADDocument {
    this.prevLayer = doc.layers[this.layer.name] ? structuredClone(doc.layers[this.layer.name]) : undefined;
    return {
      ...doc,
      layers: {
        ...doc.layers,
        [this.layer.name]: structuredClone(this.layer)
      }
    };
  }

  undo(doc: CADDocument): CADDocument {
    const layers = { ...doc.layers };
    if (this.prevLayer) {
      layers[this.layer.name] = structuredClone(this.prevLayer);
    } else {
      delete layers[this.layer.name];
    }
    return { ...doc, layers };
  }
}

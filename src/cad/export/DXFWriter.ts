import type { ProjectState } from '../../types/infrastructure';
import { APP_BUILD_HASH, APP_VERSION } from '../../config/appInfo';
import { computeCablePath } from '../../utils/cableRouting';
import type { CADDocument, CADEntity, RawDxfGroupPair } from '../core/CADTypes';
import { CADHandleAllocator } from '../core/CADRegistry';
import { networkCanvasToCadPoint } from '../core/CADUnderlayTransform';
import {
  formatDxfPairs,
  serializeBlockToPairs,
  serializeDimStyleToPairs,
  serializeEntityToPairs,
  serializeHeaderToPairs,
  serializeLayerToPairs,
  serializeLineTypeToPairs,
  serializeTextStyleToPairs
} from './CADSerializer';

function buildTablePairs(
  tableName: string,
  records: RawDxfGroupPair[][],
  allocator: CADHandleAllocator,
  includeAcDb: boolean
): RawDxfGroupPair[] {
  const pairs: RawDxfGroupPair[] = [
    { code: 0, value: 'TABLE' },
    { code: 2, value: tableName },
    { code: 5, value: allocator.allocate() }
  ];
  if (includeAcDb) {
    pairs.push({ code: 100, value: 'AcDbSymbolTable' });
  }
  pairs.push({ code: 70, value: records.length });
  for (const rec of records) {
    pairs.push(...rec);
  }
  pairs.push({ code: 0, value: 'ENDTAB' });
  return pairs;
}

/**
 * Emits a clean, self-contained AutoCAD 2000+ (AC1015) ASCII DXF string from the current CADDocument.
 */
export function writeCleanDxf(doc: CADDocument): string {
  const allocator = new CADHandleAllocator(doc);
  const includeAcDb = true;
  const headerWithExtents = {
    ...doc.header,
    $ACADVER: doc.header.$ACADVER || 'AC1015',
    $EXTMIN: { x: doc.extents.minX, y: doc.extents.minY, z: 0 },
    $EXTMAX: { x: doc.extents.maxX, y: doc.extents.maxY, z: 0 }
  };

  const pairs: RawDxfGroupPair[] = [
    { code: 999, value: `Exported by HACHIHI AutoCAD Studio v${APP_VERSION} (${APP_BUILD_HASH})` },
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'HEADER' },
    ...serializeHeaderToPairs(headerWithExtents),
    { code: 0, value: 'ENDSEC' }
  ];

  // TABLES
  const ltypes = Object.values(doc.lineTypes).map(lt => serializeLineTypeToPairs(lt, allocator, includeAcDb));
  const layers = Object.values(doc.layers).map(l => serializeLayerToPairs(l, allocator, includeAcDb));
  const styles = Object.values(doc.textStyles).map(s => serializeTextStyleToPairs(s, allocator, includeAcDb));
  const dimstyles = Object.values(doc.dimStyles).map(d => serializeDimStyleToPairs(d, allocator, includeAcDb));

  pairs.push(
    { code: 0, value: 'SECTION' },
    { code: 2, value: 'TABLES' },
    ...buildTablePairs('LTYPE', ltypes, allocator, includeAcDb),
    ...buildTablePairs('LAYER', layers, allocator, includeAcDb),
    ...buildTablePairs('STYLE', styles, allocator, includeAcDb),
    ...buildTablePairs('DIMSTYLE', dimstyles, allocator, includeAcDb),
    { code: 0, value: 'ENDSEC' }
  );

  // BLOCKS
  pairs.push({ code: 0, value: 'SECTION' }, { code: 2, value: 'BLOCKS' });
  for (const block of Object.values(doc.blocks)) {
    pairs.push(...serializeBlockToPairs(block, allocator, { includeAcDb, preferRawIfUntouched: false }));
  }
  pairs.push({ code: 0, value: 'ENDSEC' });

  // ENTITIES
  pairs.push({ code: 0, value: 'SECTION' }, { code: 2, value: 'ENTITIES' });
  for (const entity of doc.entities) {
    pairs.push(...serializeEntityToPairs(entity, allocator, { includeAcDb, preferRawIfUntouched: false }));
  }
  pairs.push({ code: 0, value: 'ENDSEC' }, { code: 0, value: 'EOF' });

  return formatDxfPairs(pairs);
}

/**
 * Projects HACHIHI Network Topology (Rooms, Racks, Devices, Cables, Labels) into the exact CAD World
 * coordinate system defined by `cadDoc.underlay`, creating dedicated `HACHIHI_*` CAD layers alongside
 * all original CAD entities.
 */
export function writeCombinedCadAndNetworkDxf(
  cadDoc: CADDocument,
  project: ProjectState,
  options?: { floorScope?: string }
): string {
  const allocator = new CADHandleAllocator(cadDoc);
  const scale = cadDoc.underlay.scaleToCanvasPx || 0.05;
  const textHeight = Math.max(8 / scale, 12);

  const rawScope = options?.floorScope ?? project.activeFloorId ?? 'all';
  const targetFloorId =
    rawScope === 'all' || rawScope === '__ALL__'
      ? null
      : rawScope === 'active'
        ? project.activeFloorId
        : rawScope;

  const roomFloorMap = new Map((project.rooms || []).map(r => [r.id, r.floorId]));
  const getNodeFloorId = (n: (typeof project.nodes)[number]) => {
    const assetRoomId = n.assetId ? project.assets?.[n.assetId]?.roomId : undefined;
    return n.floorId || (assetRoomId ? roomFloorMap.get(assetRoomId) : undefined) || project.activeFloorId;
  };

  const rooms = targetFloorId ? project.rooms.filter(r => r.floorId === targetFloorId) : project.rooms;
  const nodes = (project.nodes || []).filter(n => !n.hidden && (!targetFloorId || getNodeFloorId(n) === targetFloorId));
  const nodeMap = new Map(nodes.map(n => [n.id, n]));
  const cables = (project.cables || []).filter(c => nodeMap.has(c.sourceNodeId) && nodeMap.has(c.targetNodeId));

  const networkLayers = {
    HACHIHI_ROOMS: { id: 'layer_HACHIHI_ROOMS', name: 'HACHIHI_ROOMS', colorIndex: 8, lineType: 'DASHED', lineWeight: 25, visible: true, frozen: false, locked: false, plottable: true },
    HACHIHI_RACKS: { id: 'layer_HACHIHI_RACKS', name: 'HACHIHI_RACKS', colorIndex: 4, lineType: 'CONTINUOUS', lineWeight: 35, visible: true, frozen: false, locked: false, plottable: true },
    HACHIHI_DEVICES: { id: 'layer_HACHIHI_DEVICES', name: 'HACHIHI_DEVICES', colorIndex: 5, lineType: 'CONTINUOUS', lineWeight: 30, visible: true, frozen: false, locked: false, plottable: true },
    HACHIHI_CABLES: { id: 'layer_HACHIHI_CABLES', name: 'HACHIHI_CABLES', colorIndex: 3, lineType: 'CONTINUOUS', lineWeight: 25, visible: true, frozen: false, locked: false, plottable: true },
    HACHIHI_LABELS: { id: 'layer_HACHIHI_LABELS', name: 'HACHIHI_LABELS', colorIndex: 2, lineType: 'CONTINUOUS', lineWeight: 18, visible: true, frozen: false, locked: false, plottable: true }
  };

  const mergedDoc: CADDocument = {
    ...cadDoc,
    layers: { ...cadDoc.layers, ...networkLayers },
    entities: [...cadDoc.entities]
  };

  const pushPolylineRect = (layer: string, x: number, y: number, w: number, h: number, colorIndex: number) => {
    const corners = [
      networkCanvasToCadPoint({ x, y }, cadDoc.underlay),
      networkCanvasToCadPoint({ x: x + w, y }, cadDoc.underlay),
      networkCanvasToCadPoint({ x: x + w, y: y + h }, cadDoc.underlay),
      networkCanvasToCadPoint({ x, y: y + h }, cadDoc.underlay)
    ];
    const ent: CADEntity = {
      id: `net_poly_${allocator.getNextSeed()}`,
      handle: allocator.allocate(),
      type: 'LWPOLYLINE',
      layer,
      colorIndex,
      vertices: corners.map(c => ({ x: c.x, y: c.y })),
      closed: true,
      elevation: 0,
      preservationTier: 'supported',
      dirty: true
    };
    mergedDoc.entities.push(ent);
  };

  const pushLabel = (x: number, y: number, text: string, colorIndex: number, sizeScale = 1) => {
    if (!text.trim()) return;
    const p = networkCanvasToCadPoint({ x, y }, cadDoc.underlay);
    mergedDoc.entities.push({
      id: `net_txt_${allocator.getNextSeed()}`,
      handle: allocator.allocate(),
      type: 'TEXT',
      layer: 'HACHIHI_LABELS',
      colorIndex,
      position: { x: p.x, y: p.y, z: 0 },
      height: textHeight * sizeScale,
      rotation: -(cadDoc.underlay.rotationDeg || 0),
      text: text.replace(/[\r\n]+/g, ' ').slice(0, 120),
      style: 'STANDARD',
      hAlign: 0,
      vAlign: 0,
      widthFactor: 1,
      obliqueAngle: 0,
      preservationTier: 'supported',
      dirty: true
    });
  };

  for (const room of rooms) {
    pushPolylineRect('HACHIHI_ROOMS', room.x, room.y, room.width, room.height, 8);
    pushLabel(room.x + 8, room.y + 18, room.name, 8, 1.1);
  }

  for (const node of nodes) {
    const layer = node.type === 'rack' ? 'HACHIHI_RACKS' : 'HACHIHI_DEVICES';
    const color = node.type === 'rack' ? 4 : 5;
    pushPolylineRect(layer, node.x, node.y, node.width, node.height, color);
    pushLabel(node.x, node.y + node.height + 14, node.label, 7, 0.9);
    const asset = node.assetId ? project.assets[node.assetId] : undefined;
    if (asset?.ipAddress) {
      pushLabel(node.x, node.y + node.height + 28, asset.ipAddress, 3, 0.75);
    }
  }

  for (const cable of cables) {
    const src = nodeMap.get(cable.sourceNodeId);
    const tgt = nodeMap.get(cable.targetNodeId);
    if (!src || !tgt) continue;
    const pathInfo = computeCablePath(cable, src, tgt);
    const pts = pathInfo.pts.map(p => networkCanvasToCadPoint(p, cadDoc.underlay));
    mergedDoc.entities.push({
      id: `net_cab_${allocator.getNextSeed()}`,
      handle: allocator.allocate(),
      type: 'LWPOLYLINE',
      layer: 'HACHIHI_CABLES',
      colorIndex: 3,
      vertices: pts.map(p => ({ x: p.x, y: p.y })),
      closed: false,
      elevation: 0,
      preservationTier: 'supported',
      dirty: true
    });
    const label = cable.label ? `${cable.cableCode} - ${cable.label}` : cable.cableCode;
    pushLabel(pathInfo.midPoint.x, pathInfo.midPoint.y - 6, label, 2, 0.72);
  }

  return writeCleanDxf(mergedDoc);
}

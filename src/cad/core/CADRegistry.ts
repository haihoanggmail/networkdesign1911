import type { CADBlock, CADDocument, CADEntity } from './CADTypes';

/**
 * Allocates deterministic, collision-free hex DXF handles (`100`, `101`, ...).
 */
export class CADHandleAllocator {
  private usedHandles: Set<string>;
  private seed: number;

  constructor(doc?: Pick<CADDocument, 'nextHandleSeed' | 'entities' | 'layers' | 'blocks'>) {
    this.usedHandles = new Set<string>();
    this.seed = Math.max(0x100, doc?.nextHandleSeed ?? 0x100);

    if (doc) {
      for (const e of doc.entities || []) {
        if (e.handle) this.register(e.handle);
      }
      for (const l of Object.values(doc.layers || {})) {
        if (l.handle) this.register(l.handle);
      }
      for (const b of Object.values(doc.blocks || {})) {
        if (b.handle) this.register(b.handle);
        for (const e of b.entities || []) {
          if (e.handle) this.register(e.handle);
        }
      }
    }
  }

  register(handle: string): void {
    const norm = handle.trim().toUpperCase();
    if (!norm) return;
    this.usedHandles.add(norm);
    const parsed = parseInt(norm, 16);
    if (Number.isFinite(parsed) && parsed >= this.seed) {
      this.seed = parsed + 1;
    }
  }

  allocate(): string {
    while (true) {
      const candidate = this.seed.toString(16).toUpperCase();
      this.seed += 1;
      if (!this.usedHandles.has(candidate)) {
        this.usedHandles.add(candidate);
        return candidate;
      }
    }
  }

  getNextSeed(): number {
    return this.seed;
  }
}

export function createCadId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Collects all nested Block names referenced transitively from a starting set of entities
 * with strict cycle detection.
 */
export function collectDependentBlockNames(
  entities: CADEntity[],
  blocks: Record<string, CADBlock>,
  maxDepth = 32
): Set<string> {
  const collected = new Set<string>();
  const visited = new Set<string>();

  const visitBlock = (blockName: string, depth: number) => {
    if (!blockName || depth > maxDepth || visited.has(blockName)) return;
    visited.add(blockName);
    collected.add(blockName);
    const blk = blocks[blockName];
    if (!blk) return;
    for (const sub of blk.entities) {
      if (sub.type === 'INSERT') {
        visitBlock(sub.blockName, depth + 1);
      }
    }
  };

  for (const ent of entities) {
    if (ent.type === 'INSERT') {
      visitBlock(ent.blockName, 0);
    }
  }
  return collected;
}

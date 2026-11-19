import type { CADDocument } from '../core/CADTypes';
import { cadRepository } from './CADRepository';

export class CADAutosaveController {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pendingDoc: CADDocument | null = null;
  private readonly delayMs: number;

  constructor(delayMs = 1000) {
    this.delayMs = delayMs;
  }

  schedule(doc: CADDocument, onSaved?: (docId: string) => void): void {
    this.pendingDoc = doc;
    if (this.timer !== null) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      const target = this.pendingDoc;
      this.timer = null;
      this.pendingDoc = null;
      if (!target) return;
      void cadRepository.saveDocument(target).then(() => {
        onSaved?.(target.id);
      });
    }, this.delayMs);
  }

  async flush(): Promise<void> {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.pendingDoc) {
      const target = this.pendingDoc;
      this.pendingDoc = null;
      await cadRepository.saveDocument(target);
    }
  }

  cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pendingDoc = null;
  }
}

export const cadAutosave = new CADAutosaveController(1000);

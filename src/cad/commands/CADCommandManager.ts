import type { CADDocument } from '../core/CADTypes';
import { recomputeDocumentExtents } from '../geometry/CADBounds';
import type { CADCommand } from './CADCommand';

export class CADCommandManager {
  private undoStack: CADCommand[] = [];
  private redoStack: CADCommand[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 100) {
    this.maxDepth = Math.max(10, maxDepth);
  }

  execute(doc: CADDocument, command: CADCommand): CADDocument {
    const next = command.execute(doc);
    next.extents = recomputeDocumentExtents(next);
    next.updatedAt = new Date().toISOString();

    this.undoStack.push(command);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    return next;
  }

  undo(doc: CADDocument): CADDocument | null {
    const cmd = this.undoStack.pop();
    if (!cmd) return null;
    const prev = cmd.undo(doc);
    prev.extents = recomputeDocumentExtents(prev);
    prev.updatedAt = new Date().toISOString();
    this.redoStack.push(cmd);
    return prev;
  }

  redo(doc: CADDocument): CADDocument | null {
    const cmd = this.redoStack.pop();
    if (!cmd) return null;
    const next = cmd.execute(doc);
    next.extents = recomputeDocumentExtents(next);
    next.updatedAt = new Date().toISOString();
    this.undoStack.push(cmd);
    return next;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  peekUndoLabel(): string | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1].labelVi : null;
  }

  peekRedoLabel(): string | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1].labelVi : null;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }
}

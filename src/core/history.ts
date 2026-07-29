// ─── Undo/Redo History ────────────────────────────────────────────────────────
import type { Project } from './types';
import { clone } from './utils';

export class History {
  private stack: Project[] = [];
  private cursor = -1;
  private maxSize = 50;

  push(project: Project) {
    // drop redo stack
    this.stack = this.stack.slice(0, this.cursor + 1);
    this.stack.push(clone(project));
    if (this.stack.length > this.maxSize) this.stack.shift();
    this.cursor = this.stack.length - 1;
  }

  undo(): Project | null {
    if (this.cursor <= 0) return null;
    this.cursor--;
    return clone(this.stack[this.cursor]);
  }

  redo(): Project | null {
    if (this.cursor >= this.stack.length - 1) return null;
    this.cursor++;
    return clone(this.stack[this.cursor]);
  }

  canUndo() { return this.cursor > 0; }
  canRedo() { return this.cursor < this.stack.length - 1; }

  clear() {
    this.stack = [];
    this.cursor = -1;
  }
}

export const history = new History();

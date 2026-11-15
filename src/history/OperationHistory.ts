import type { Operation } from '../model/types';

// CPU checkpoints are deliberately bounded; no GPU textures per history item.
// Absolute indices survive eviction, keeping the checkpoint cadence at eight operations.
export class OperationHistory {
  private entries: Operation[] = [];
  private first = 0;
  private cursor = 0;
  private checkpoints = new Map<number, Uint8Array>();

  constructor(private baseline: Uint8Array, readonly limit = 50, readonly checkpointLimit = 4) {}

  get canUndo() { return this.cursor > this.first; }
  get canRedo() { return this.cursor < this.first + this.entries.length; }
  get count() { return this.cursor; }
  get retained() { return this.entries.length; }
  get checkpointCount() { return this.checkpoints.size; }
  get memoryBytes() {
    return this.baseline.byteLength + [...this.checkpoints.values()].reduce((sum, data) => sum + data.byteLength, 0);
  }

  append(operation: Operation, capture: () => Uint8Array, advanceBaseline: (base: Uint8Array, op: Operation) => Uint8Array) {
    this.entries.splice(this.cursor - this.first);
    for (const index of this.checkpoints.keys()) if (index > this.cursor) this.checkpoints.delete(index);
    this.entries.push(structuredClone(operation));
    this.cursor++;
    if (this.entries.length > this.limit) {
      this.baseline = advanceBaseline(this.baseline, this.entries.shift()!);
      this.first++;
    }
    for (const index of this.checkpoints.keys()) if (index <= this.first) this.checkpoints.delete(index);
    if (this.cursor % 8 === 0) this.checkpoints.set(this.cursor, capture());
    while (this.checkpoints.size > this.checkpointLimit) this.checkpoints.delete(this.checkpoints.keys().next().value!);
  }

  undo() { if (this.canUndo) this.cursor--; }
  redo() { if (this.canRedo) this.cursor++; }

  replayPlan(): { pixels: Uint8Array; operations: Operation[] } {
    let start = this.first;
    let pixels = this.baseline;
    for (const [index, checkpoint] of this.checkpoints) {
      if (index <= this.cursor && index > start) { start = index; pixels = checkpoint; }
    }
    return { pixels, operations: this.entries.slice(start - this.first, this.cursor - this.first) };
  }
}

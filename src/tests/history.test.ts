import { describe, expect, it } from 'vitest';
import { OperationHistory } from '../history/OperationHistory';
import type { DropOperation } from '../model/types';

const drop = (radius: number): DropOperation => ({ type: 'drop', id: `${radius}`, center: { x: 10, y: 20 }, radius, color: '#6929E8', durationMs: 0 });

describe('bounded operation history', () => {
  it('reconstructs all 50 undo positions after eviction and limits checkpoint memory', () => {
    const h = new OperationHistory(new Uint8Array([0]), 50, 2);
    for (let i = 1; i <= 100; i++) {
      h.append(drop(i), () => new Uint8Array([i]), (_, op) => new Uint8Array([(op as DropOperation).radius]));
    }
    expect(h.retained).toBe(50);
    expect(h.checkpointCount).toBe(2);
    expect(h.memoryBytes).toBe(3);
    const replay = () => {
      const plan = h.replayPlan();
      return plan.operations.length ? (plan.operations.at(-1) as DropOperation).radius : plan.pixels[0];
    };
    for (let i = 100; i >= 50; i--) {
      expect(replay()).toBe(i);
      h.undo();
    }
    expect(h.canUndo).toBe(false);
    for (let i = 51; i <= 100; i++) { h.redo(); expect(replay()).toBe(i); }
    expect(h.canRedo).toBe(false);
  });

  it('branches after Undo without retaining future checkpoints or mutable input', () => {
    const h = new OperationHistory(new Uint8Array([0]));
    for (let i = 1; i <= 16; i++) h.append(drop(i), () => new Uint8Array([i]), (base) => base);
    for (let i = 0; i < 10; i++) h.undo();
    const op = drop(77);
    h.append(op, () => new Uint8Array([77]), (base) => base);
    op.center.x = 999;
    expect(h.canRedo).toBe(false);
    expect(h.checkpointCount).toBe(0);
    const latest = h.replayPlan().operations.at(-1) as DropOperation;
    expect(latest.radius).toBe(77);
    expect(latest.center.x).toBe(10);
  });
});

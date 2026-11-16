import { describe, expect, it } from 'vitest';
import { inverseDrop, spreadRadius } from '../core/DropTransform';

describe('Jaffer area-preserving drop', () => {
  it('inverts the 60/80/100 radius relation (AT-02)', () => {
    expect(inverseDrop({ x: 100, y: 0 }, { x: 0, y: 0 }, 80)).toEqual({ x: 60, y: 0 });
  });
  it('handles the new disk, boundary, and zero-radius singularity', () => {
    expect(inverseDrop({ x: 0, y: 0 }, { x: 0, y: 0 }, 80)).toBeNull();
    expect(inverseDrop({ x: 80, y: 0 }, { x: 0, y: 0 }, 80)).toEqual({ x: 0, y: 0 });
    expect(inverseDrop({ x: 0, y: 0 }, { x: 0, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
  });
  it('preserves annular area and is invertible away from the center', () => {
    for (const a of [4, 56, 180]) {
      for (const r of [1, 30, 130, 700]) {
        const outer = Math.sqrt(r * r + a * a);
        expect(outer * outer - a * a).toBeCloseTo(r * r, 7);
        const angle = 1.234;
        const p = inverseDrop({ x: 400 + outer * Math.cos(angle), y: 500 + outer * Math.sin(angle) }, { x: 400, y: 500 }, a)!;
        expect(p.x).toBeCloseTo(400 + r * Math.cos(angle), 7);
        expect(p.y).toBeCloseTo(500 + r * Math.sin(angle), 7);
      }
    }
  });
  it('starts at zero and ends at the exact configured radius', () => {
    expect(spreadRadius(130, 0)).toBe(0);
    expect(spreadRadius(130, 1)).toBe(130);
    expect(spreadRadius(130, 2)).toBe(130);
  });
});

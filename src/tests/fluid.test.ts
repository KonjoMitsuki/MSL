import { describe, expect, it } from 'vitest';
import { FluidSolver } from '../core/FluidSolver';

function divergence(s: FluidSolver) {
  const n = s.size, v = s.velocity;
  let sum = 0;
  for (let y = 1; y < n - 1; y++) for (let x = 1; x < n - 1; x++) {
    const i = (y * n + x) * 2;
    sum += (v[i + 2] - v[i - 2] + v[i + n * 2 + 1] - v[i - n * 2 + 1]) ** 2;
  }
  return sum;
}
const energy = (s: FluidSolver) => s.velocity.reduce((sum, value) => sum + value * value, 0);

describe('pressure-based fluid solver', () => {
  it('pressure projection reduces divergent motion and enforces wall normals', () => {
    const s = new FluidSolver(32);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const i = (y * 32 + x) * 2;
      s.velocity[i] = Math.sin(x * Math.PI / 31) * Math.sin(y * Math.PI / 31) * 200;
      s.velocity[i + 1] = Math.sin(x * Math.PI / 31) * Math.sin(y * Math.PI / 31) * 100;
    }
    const before = divergence(s);
    s.project();
    expect(divergence(s)).toBeLessThan(before * 0.8);
    for (let i = 0; i < 32; i++) {
      expect(s.velocity[i * 32 * 2]).toBe(0);
      expect(s.velocity[((31 * 32) + i) * 2 + 1]).toBe(0);
    }
  });

  it('inertia continues after forcing, dissipates, stays finite and replays exactly', () => {
    const a = new FluidSolver(), b = new FluidSolver();
    const force = [{ a: { x: 400, y: 512 }, b: { x: 460, y: 530 } }];
    a.step(force, 90, 1.2, 1);
    b.step(force, 90, 1.2, 1);
    const initial = energy(a);
    expect(initial).toBeGreaterThan(0);
    a.step([], 90, 1.2, 1);
    b.step([], 90, 1.2, 1);
    expect(energy(a)).toBeGreaterThan(0);
    for (let i = 0; i < 90; i++) { a.step([], 90, 1.2, 1); b.step([], 90, 1.2, 1); }
    expect(energy(a)).toBeLessThan(initial * 0.01);
    expect(a.velocity.every(Number.isFinite)).toBe(true);
    expect(a.velocity).toEqual(b.velocity);
  });
});

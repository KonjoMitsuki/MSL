import type { Point } from '../model/types';

export type FlowImpulse = { a: Point; b: Point };
export const FLOW_DT = 1 / 60;

// Original, small Eulerian solver. Velocities are in virtual pixels / second.
// Semi-Lagrangian velocity advection + pressure projection approximates a 2D
// incompressible fluid; pigment is transported separately on the GPU.
export class FluidSolver {
  readonly velocity: Float32Array;
  private scratch: Float32Array;
  private pressure: Float32Array;
  private nextPressure: Float32Array;
  private divergence: Float32Array;

  constructor(readonly size = 64) {
    this.velocity = new Float32Array(size * size * 2);
    this.scratch = new Float32Array(this.velocity.length);
    this.pressure = new Float32Array(size * size);
    this.nextPressure = new Float32Array(size * size);
    this.divergence = new Float32Array(size * size);
  }

  private sample(field: Float32Array, x: number, y: number, component: number) {
    const n = this.size;
    x = Math.max(0, Math.min(n - 1, x));
    y = Math.max(0, Math.min(n - 1, y));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    const at = (a: number, b: number) => field[(Math.min(n - 1, b) * n + Math.min(n - 1, a)) * 2 + component];
    return (at(ix, iy) * (1 - fx) + at(ix + 1, iy) * fx) * (1 - fy)
      + (at(ix, iy + 1) * (1 - fx) + at(ix + 1, iy + 1) * fx) * fy;
  }

  step(impulses: FlowImpulse[], radius: number, strength: number, persistence: number) {
    const n = this.size, h = 1024 / n, dt = FLOW_DT;
    const v = this.velocity, next = this.scratch;
    const damping = Math.exp(-dt * 3 / persistence);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 2;
      const px = x - v[i] * dt / h, py = y - v[i + 1] * dt / h;
      next[i] = this.sample(v, px, py, 0) * damping;
      next[i + 1] = this.sample(v, px, py, 1) * damping;
    }
    v.set(next);
    for (const { a, b } of impulses) {
      const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
      if (length < 1e-6) continue;
      const speed = Math.min(1000, length / dt * strength);
      const sigma = Math.max(h, radius * 0.65);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const px = (x + 0.5) * h - a.x, py = (y + 0.5) * h - a.y;
        const t = Math.max(0, Math.min(1, (px * dx + py * dy) / (length * length)));
        const distance2 = (px - t * dx) ** 2 + (py - t * dy) ** 2;
        if (distance2 > 9 * sigma * sigma) continue;
        const w = Math.exp(-0.5 * distance2 / (sigma * sigma)) * 0.8;
        const i = (y * n + x) * 2;
        v[i] += (dx / length * speed - v[i]) * w;
        v[i + 1] += (dy / length * speed - v[i + 1]) * w;
      }
    }
    this.project();
  }

  // No-through-flow walls. Neumann pressure boundary (edge value repeated).
  project() {
    const n = this.size, h = 1024 / n, v = this.velocity;
    const at = (x: number, y: number) => Math.max(0, Math.min(n - 1, y)) * n + Math.max(0, Math.min(n - 1, x));
    this.walls();
    this.pressure.fill(0);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      this.divergence[y * n + x] = (v[at(x + 1, y) * 2] - v[at(x - 1, y) * 2]
        + v[at(x, y + 1) * 2 + 1] - v[at(x, y - 1) * 2 + 1]) / (2 * h);
    }
    for (let iteration = 0; iteration < 40; iteration++) {
      const p = this.pressure, q = this.nextPressure;
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const i = y * n + x;
        q[i] = (p[at(x - 1, y)] + p[at(x + 1, y)] + p[at(x, y - 1)] + p[at(x, y + 1)]
          - this.divergence[i] * h * h) / 4;
      }
      this.pressure = q;
      this.nextPressure = p;
    }
    const p = this.pressure;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 2;
      v[i] -= (p[at(x + 1, y)] - p[at(x - 1, y)]) / (2 * h);
      v[i + 1] -= (p[at(x, y + 1)] - p[at(x, y - 1)]) / (2 * h);
    }
    this.walls();
  }

  private walls() {
    const n = this.size, v = this.velocity;
    for (let i = 0; i < n; i++) {
      v[(i * n) * 2] = v[(i * n + n - 1) * 2] = 0;
      v[i * 2 + 1] = v[((n - 1) * n + i) * 2 + 1] = 0;
    }
  }
}

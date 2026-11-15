import type { Point } from '../model/types';

// Bound both sample spacing and displacement to <= 2 simulation texels.
export function strokeSteps(a: Point, b: Point, radius: number, strength: number, resolution: number): Point[] {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  if (distance === 0) return [];
  const spacing = Math.min(radius / 3, (2 * 1024 / resolution) / strength);
  // Tolerate floating point round-off at exact step boundaries.
  const count = Math.max(1, Math.ceil(distance / spacing - 1e-9));
  return Array.from({ length: count }, (_, i) => ({
    x: a.x + (b.x - a.x) * (i + 1) / count,
    y: a.y + (b.y - a.y) * (i + 1) / count,
  }));
}

// Keep residual distance across PointerEvents so event frequency does not set step size.
export class StrokeSampler {
  private previous: Point;
  private residual = 0;
  constructor(start: Point, readonly spacing: number) { this.previous = { ...start }; }

  push(point: Point): Point[] {
    const a = this.previous;
    const length = Math.hypot(point.x - a.x, point.y - a.y);
    const result: Point[] = [];
    if (length > 0) {
      for (let d = this.spacing - this.residual; d <= length + 1e-8; d += this.spacing) {
        const t = Math.min(1, d / length);
        result.push({ x: a.x + (point.x - a.x) * t, y: a.y + (point.y - a.y) * t });
      }
      this.residual = (this.residual + length) % this.spacing;
      if (this.residual < 1e-8 || this.spacing - this.residual < 1e-8) this.residual = 0;
    }
    this.previous = { ...point };
    return result;
  }

  get endpoint() { return this.previous; }
}

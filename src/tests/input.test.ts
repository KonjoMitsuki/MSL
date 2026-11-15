import { expect, it } from 'vitest';
import { StrokeSampler, strokeSteps } from '../core/StrokeTransform';
import { toSurface } from '../input/pointerController';

it('maps CSS coordinates independently of DPR, zoom and pan', () => {
  const p = toSurface({ x: 350, y: 400 }, { left: 100, top: 200, width: 500, height: 500 }, { zoom: 2, pan: { x: 0.1, y: -0.2 } });
  expect(p.x).toBeCloseTo(460.8);
  expect(p.y).toBeCloseTo(563.2);
});

it('resamples a straight gesture independently of PointerEvent density', () => {
  const sparse = new StrokeSampler({ x: 0, y: 0 }, 10 / 3);
  const dense = new StrokeSampler({ x: 0, y: 0 }, 10 / 3);
  const expected = sparse.push({ x: 100, y: 0 });
  const result = Array.from({ length: 100 }, (_, i) => dense.push({ x: i + 1, y: 0 })).flat();
  expect(result).toHaveLength(expected.length);
  result.forEach((point, i) => expect(point.x).toBeCloseTo(expected[i].x, 8));
});

it('bounds segment spacing and displacement at both texture resolutions', () => {
  for (const resolution of [512, 1024]) for (const strength of [0.05, 0.6, 1]) {
    let previous = { x: 0, y: 0 };
    const points = strokeSteps(previous, { x: 200, y: 100 }, 32, strength, resolution);
    for (const point of points) {
      const length = Math.hypot(point.x - previous.x, point.y - previous.y);
      expect(length).toBeLessThanOrEqual(32 / 3 + 1e-8);
      expect(length * strength * resolution / 1024).toBeLessThanOrEqual(2 + 1e-8);
      previous = point;
    }
  }
});

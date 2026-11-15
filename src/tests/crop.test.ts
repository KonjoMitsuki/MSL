import { describe, expect, it } from 'vitest';
import { clampCrop, cropOutputHeight, moveCrop, resizeCrop, withAspect } from '../export/crop';

describe('crop geometry', () => {
  it('clamps a rectangle to the 1024 square and enforces a usable minimum', () => {
    expect(clampCrop({ x: -40, y: 900, width: 500, height: 500 })).toEqual({ x: 0, y: 524, width: 500, height: 500 });
    expect(clampCrop({ x: 500, y: 500, width: 5, height: 2000 })).toEqual({ x: 500, y: 0, width: 32, height: 1024 });
  });

  it('fits a requested ratio around the current centre', () => {
    const wide = withAspect({ x: 128, y: 128, width: 768, height: 768 }, 16 / 9);
    expect(wide.width / wide.height).toBeCloseTo(16 / 9, 8);
    expect(wide).toMatchObject({ x: 128, y: 296, width: 768 });
    const tall = withAspect({ x: 128, y: 128, width: 768, height: 768 }, 9 / 16);
    expect(tall).toMatchObject({ x: 296, y: 128, width: 432, height: 768 });
    expect(withAspect(wide, null)).toEqual(wide);
  });

  it('moves without leaving the surface and resizes from the opposite corner', () => {
    const base = { x: 100, y: 100, width: 400, height: 400 };
    expect(moveCrop(base, -500, 900)).toEqual({ x: 0, y: 624, width: 400, height: 400 });
    expect(moveCrop(base, 50, -20)).toEqual({ x: 150, y: 80, width: 400, height: 400 });
    expect(resizeCrop(base, 'se', 600, 500, 1)).toEqual({ x: 100, y: 100, width: 500, height: 500 });
    expect(resizeCrop(base, 'nw', 300, 200, 1)).toEqual({ x: 200, y: 200, width: 300, height: 300 });
    expect(resizeCrop(base, 'se', 700, 600, null)).toEqual({ x: 100, y: 100, width: 600, height: 500 });
    expect(resizeCrop({ x: 800, y: 800, width: 200, height: 200 }, 'se', 1100, 1100, 1))
      .toEqual({ x: 800, y: 800, width: 224, height: 224 });
  });

  it('derives output height from the crop ratio or the locked aspect', () => {
    const crop = { x: 0, y: 0, width: 100, height: 400 };
    expect(cropOutputHeight(crop, 200, null)).toBe(800);
    expect(cropOutputHeight(crop, 320, 16 / 9)).toBe(180);
    expect(cropOutputHeight(crop, 320, 9 / 16)).toBe(569);
  });
});

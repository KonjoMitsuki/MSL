import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INK, effectiveDropRadius, effectiveSpreadDuration, inkGrowthRate, normalizeInk,
} from '../core/InkModel';

describe('per-colour ink material model', () => {
  it('normalizes missing and out-of-range material values', () => {
    expect(normalizeInk()).toEqual(DEFAULT_INK);
    expect(normalizeInk({ viscosity: -5, surfaceTension: 99 })).toEqual({ viscosity: 0.2, surfaceTension: 1.5 });
    expect(normalizeInk({ viscosity: 0.8, surfaceTension: Number.NaN })).toEqual({ viscosity: 0.8, surfaceTension: 1 });
  });

  it('reduces equilibrium radius as surface tension rises', () => {
    expect(effectiveDropRadius(100, { surfaceTension: 1 })).toBe(100);
    expect(effectiveDropRadius(100, { surfaceTension: 1.44 })).toBeCloseTo(83.333333, 5);
    expect(effectiveDropRadius(100, { surfaceTension: 0.36 })).toBeCloseTo(166.666667, 5);
    expect(effectiveDropRadius(4, { surfaceTension: 1.5 })).toBe(4);
    expect(effectiveDropRadius(180, { surfaceTension: 0.3 })).toBe(180);
  });

  it('scales duration by viscosity and surface tension', () => {
    expect(effectiveSpreadDuration(450, { viscosity: 2, surfaceTension: 1 })).toBe(900);
    expect(effectiveSpreadDuration(450, { viscosity: 1, surfaceTension: 1.44 })).toBeCloseTo(540, 6);
    expect(effectiveSpreadDuration(1500, { viscosity: 3, surfaceTension: 1.5 })).toBe(4500);
    expect(effectiveSpreadDuration(0, { viscosity: 3 })).toBe(0);
  });

  it('changes held-growth rate in the same material direction', () => {
    const base = inkGrowthRate(80, DEFAULT_INK);
    expect(inkGrowthRate(80, { viscosity: 3, surfaceTension: 1.5 })).toBeLessThan(base);
    expect(inkGrowthRate(80, { viscosity: 0.3, surfaceTension: 0.3 })).toBeGreaterThan(base);
    expect(inkGrowthRate(80, DEFAULT_INK)).toBeCloseTo(64, 6);
  });
});

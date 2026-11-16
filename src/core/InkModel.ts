import type { InkMaterial } from '../model/types';

export const MIN_VISCOSITY = 0.2;
export const MAX_VISCOSITY = 3;
export const MIN_SURFACE_TENSION = 0.3;
export const MAX_SURFACE_TENSION = 1.5;
export const MAX_EFFECTIVE_DURATION = 4500;

export const DEFAULT_INK: InkMaterial = { viscosity: 1, surfaceTension: 1 };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function normalizeInk(ink?: Partial<InkMaterial>): InkMaterial {
  if (!ink) return { ...DEFAULT_INK };
  return {
    viscosity: Number.isFinite(ink.viscosity) ? clamp(ink.viscosity!, MIN_VISCOSITY, MAX_VISCOSITY) : 1,
    surfaceTension: Number.isFinite(ink.surfaceTension) ? clamp(ink.surfaceTension!, MIN_SURFACE_TENSION, MAX_SURFACE_TENSION) : 1,
  };
}

// The slider radius is the reference size at surface tension 1. A higher
// surface tension spreads the same nominal drop farther; the canvas radius cap
// still applies. Viscosity changes the rate, not the equilibrium size.
export function effectiveDropRadius(radius: number, ink?: Partial<InkMaterial>): number {
  const material = normalizeInk(ink);
  // Lower surface tension spreads farther (higher spreading coefficient). The
  // slider radius is the reference size at surface tension 1.
  return clamp(radius / Math.sqrt(material.surfaceTension), 4, 180);
}

// Viscosity slows spreading; higher surface tension also resists expansion.
export function effectiveSpreadDuration(durationMs: number, ink?: Partial<InkMaterial>): number {
  const material = normalizeInk(ink);
  return clamp(durationMs * material.viscosity * Math.sqrt(material.surfaceTension), 0, MAX_EFFECTIVE_DURATION);
}

// Extra growth while the pointer is held. This is a visual rate, not a measured
// rheological constant, but it follows the same material trend.
export function inkGrowthRate(baseRadius: number, ink?: Partial<InkMaterial>): number {
  const material = normalizeInk(ink);
  const ratio = clamp(1 / (material.surfaceTension * material.viscosity), 0.2, 2.5);
  return Math.max(18, baseRadius * 0.8) * ratio;
}

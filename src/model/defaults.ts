import type { DropOperation } from './types';

export const SIZE = 1024;
export const BLUE = '#278BEC';
export const PURPLE = '#6929E8';
export const RED = '#F02045';
export const defaults = {
  baseColor: BLUE,
  activeColor: PURPLE,
  dropRadius: 56,
  spreadDurationMs: 450,
  brushRadius: 80,
  brushStrength: 1.2,
};
export const demoDrops = (durationMs = 450): DropOperation[] => [
  { type: 'drop', id: crypto.randomUUID(), center: { x: 420, y: 512 }, radius: 130, color: PURPLE, durationMs },
  { type: 'drop', id: crypto.randomUUID(), center: { x: 690, y: 512 }, radius: 80, color: RED, durationMs },
];

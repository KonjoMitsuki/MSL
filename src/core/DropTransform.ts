import type { Point } from '../model/types';

// Independently derived from Jaffer's radial area equation r'² = r² + a².
// null denotes the new ink disk; all other points sample the previous surface.
export function inverseDrop(q: Point, center: Point, radius: number): Point | null {
  const x = q.x - center.x;
  const y = q.y - center.y;
  const d2 = x * x + y * y;
  if (d2 < radius * radius) return null;
  if (d2 === 0) return { ...q };
  const scale = Math.sqrt(Math.max(0, d2 - radius * radius) / d2);
  return { x: center.x + x * scale, y: center.y + y * scale };
}

export function spreadRadius(radius: number, progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return radius * (1 - (1 - t) ** 3);
}

export function rgb(hex: string): [number, number, number] {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error('色は #RRGGBB 形式で指定してください。');
  return [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16) / 255) as [number, number, number];
}

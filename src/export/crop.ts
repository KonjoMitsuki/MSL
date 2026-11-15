export type CropRect = { x: number; y: number; width: number; height: number };
export type CropHandle = 'nw' | 'ne' | 'se' | 'sw';

export const CROP_MIN = 32;
export const CROP_SIZE = 1024;

export const CROP_ASPECTS = [
  { id: 'free', label: '自由', ratio: null },
  { id: '1:1', label: '1:1', ratio: 1 },
  { id: '4:3', label: '4:3', ratio: 4 / 3 },
  { id: '3:4', label: '3:4', ratio: 3 / 4 },
  { id: '16:9', label: '16:9', ratio: 16 / 9 },
  { id: '9:16', label: '9:16', ratio: 9 / 16 },
] as const;

export type CropAspect = (typeof CROP_ASPECTS)[number]['id'];

export function aspectRatio(aspect: CropAspect): number | null {
  return CROP_ASPECTS.find((item) => item.id === aspect)?.ratio ?? null;
}

export function clampCrop(rect: CropRect, size = CROP_SIZE): CropRect {
  const width = Math.min(size, Math.max(CROP_MIN, Number.isFinite(rect.width) ? rect.width : CROP_MIN));
  const height = Math.min(size, Math.max(CROP_MIN, Number.isFinite(rect.height) ? rect.height : CROP_MIN));
  return {
    x: Math.min(size - width, Math.max(0, Number.isFinite(rect.x) ? rect.x : 0)),
    y: Math.min(size - height, Math.max(0, Number.isFinite(rect.y) ? rect.y : 0)),
    width,
    height,
  };
}

// Keep the current centre and shrink one axis until the requested ratio fits.
export function withAspect(rect: CropRect, ratio: number | null, size = CROP_SIZE): CropRect {
  const base = clampCrop(rect, size);
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) return base;
  let width = base.width;
  let height = width / ratio;
  if (height > base.height) {
    height = base.height;
    width = height * ratio;
  }
  return clampCrop({
    x: base.x + (base.width - width) / 2,
    y: base.y + (base.height - height) / 2,
    width,
    height,
  }, size);
}

export function moveCrop(rect: CropRect, dx: number, dy: number, size = CROP_SIZE): CropRect {
  return clampCrop({ ...rect, x: rect.x + dx, y: rect.y + dy }, size);
}

// The opposite corner stays fixed. With a ratio the larger pointer delta wins,
// then the rectangle is limited by the canvas edge in that direction.
export function resizeCrop(
  start: CropRect, handle: CropHandle, px: number, py: number, ratio: number | null, size = CROP_SIZE,
): CropRect {
  const base = clampCrop(start, size);
  const west = handle === 'nw' || handle === 'sw';
  const north = handle === 'nw' || handle === 'ne';
  const anchorX = west ? base.x + base.width : base.x;
  const anchorY = north ? base.y + base.height : base.y;
  const directionX = west ? -1 : 1;
  const directionY = north ? -1 : 1;
  const availableW = west ? anchorX : size - anchorX;
  const availableH = north ? anchorY : size - anchorY;
  const rawW = Math.max(CROP_MIN, Math.abs(px - anchorX));
  const rawH = Math.max(CROP_MIN, Math.abs(py - anchorY));
  let width: number;
  let height: number;
  if (ratio && Number.isFinite(ratio) && ratio > 0) {
    width = Math.min(Math.max(rawW, rawH * ratio), availableW, availableH * ratio);
    width = Math.max(Math.min(CROP_MIN, availableW, availableH * ratio), width);
    height = width / ratio;
  } else {
    width = Math.min(rawW, availableW);
    height = Math.min(rawH, availableH);
  }
  return clampCrop({
    x: west ? anchorX - width : anchorX,
    y: north ? anchorY - height : anchorY,
    width,
    height,
  }, size);
}

export function cropOutputHeight(crop: CropRect, outputWidth: number, ratio: number | null): number {
  const effective = ratio && ratio > 0 ? ratio : crop.width / Math.max(1, crop.height);
  return Math.max(1, Math.min(8192, Math.round(outputWidth / effective)));
}

import type { CropRect } from './crop';

function canvasContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG書き出し用のCanvasを作成できません。');
  return context;
}

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('PNGの生成に失敗しました。')),
    'image/png',
  ));
}

function applyBackground(canvas: HTMLCanvasElement, background: string) {
  const context = canvasContext(canvas);
  context.save();
  context.globalCompositeOperation = 'destination-over';
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.restore();
}

export async function exportPng(pixels: Uint8Array, size: number, background = '#ffffff'): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  canvasContext(canvas).putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0);
  applyBackground(canvas, background);
  return encode(canvas);
}

export async function exportCropPng(
  pixels: Uint8Array, sourceSize: number, crop: CropRect,
  outputWidth: number, outputHeight: number, background = '#ffffff',
): Promise<Blob> {
  const scale = sourceSize / 1024;
  const sx = Math.max(0, Math.min(sourceSize - 1, Math.round(crop.x * scale)));
  const sy = Math.max(0, Math.min(sourceSize - 1, Math.round(crop.y * scale)));
  const sw = Math.max(1, Math.min(sourceSize - sx, Math.round(crop.width * scale)));
  const sh = Math.max(1, Math.min(sourceSize - sy, Math.round(crop.height * scale)));

  const source = document.createElement('canvas');
  source.width = source.height = sourceSize;
  canvasContext(source).putImageData(new ImageData(new Uint8ClampedArray(pixels), sourceSize, sourceSize), 0, 0);

  const out = document.createElement('canvas');
  out.width = outputWidth;
  out.height = outputHeight;
  const context = canvasContext(out);
  if (outputWidth === sw && outputHeight === sh) {
    // No resampling: keep every selected simulation pixel exactly.
    const data = context.createImageData(sw, sh);
    for (let row = 0; row < sh; row++) {
      const from = ((sy + row) * sourceSize + sx) * 4;
      data.data.set(pixels.subarray(from, from + sw * 4), row * sw * 4);
    }
    context.putImageData(data, 0, 0);
  } else {
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, sx, sy, sw, sh, 0, 0, outputWidth, outputHeight);
  }
  applyBackground(out, background);
  return encode(out);
}

function pngFilename(prefix: string) {
  return `${prefix}-${new Date().toISOString().replaceAll(':', '-')}.png`;
}

export function createPngFile(blob: Blob, prefix = 'marbling'): File {
  return new File([blob], pngFilename(prefix), { type: 'image/png' });
}

export function canSharePng(file: File): boolean {
  try {
    return typeof navigator.share === 'function' && typeof navigator.canShare === 'function'
      && navigator.canShare({ files: [file] });
  } catch { return false; }
}

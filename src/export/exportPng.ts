export async function exportPng(pixels: Uint8Array, size: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('PNG書き出し用のCanvasを作成できません。');
  context.putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('PNGの生成に失敗しました。')),
    'image/png',
  ));
}

export function downloadPng(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `marbling-${new Date().toISOString().replaceAll(':', '-')}.png`;
  anchor.click();
  // Retain long enough for mobile browsers to consume the download.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

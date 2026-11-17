import { expect, test, type Page } from '@playwright/test';
import { closeSheet, openExport } from './editorHelpers';

declare global {
  interface Window {
    __photoShare?: { active: boolean | undefined; keys: string[]; file: File };
    __shareFailure?: string;
    __finishShare?: () => void;
    __revokedPhotoUrls?: string[];
  }
}

async function mockShare(page: Page, support: 'yes' | 'missing' | 'false' | 'throws' = 'yes') {
  await page.addInitScript((mode) => {
    Object.defineProperty(navigator, 'canShare', { configurable: true, value: mode === 'missing' ? undefined : ({ files }: ShareData) => {
      if (mode === 'throws') throw new TypeError('Unavailable');
      return mode === 'yes' && files?.length === 1 && files[0].type === 'image/png';
    } });
    Object.defineProperty(navigator, 'share', { configurable: true, value: mode === 'missing' ? undefined : (data: ShareData) => {
      window.__photoShare = { active: navigator.userActivation?.isActive, keys: Object.keys(data), file: data.files![0] };
      if (window.__shareFailure) return Promise.reject(new DOMException('Test failure', window.__shareFailure));
      return new Promise<void>((resolve) => { window.__finishShare = resolve; });
    } });
    const revoke = URL.revokeObjectURL.bind(URL);
    window.__revokedPhotoUrls = [];
    URL.revokeObjectURL = (url) => { window.__revokedPhotoUrls!.push(url); revoke(url); };
  }, support);
}

async function openPhoto(page: Page) {
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);
  await openExport(page);
  await expect(page.getByRole('button', { name: /ファイル|ダウンロード/ })).toHaveCount(0);
  await page.getByRole('button', { name: '写真に保存' }).click();
  await expect(page.getByRole('img', { name: '保存する作品のPNG画像' })).toBeVisible();
}

test('shares a ready PNG on a fresh tap, keeps exact pixels, and releases the preview', async ({ page }) => {
  await mockShare(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const downloads: string[] = [];
  page.on('download', (download) => downloads.push(download.suggestedFilename()));
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);
  await page.evaluate(() => {
    const e = window.__lab!;
    e.reset('#278BEC');
    e.enqueue({ type: 'drop', id: 'red', center: { x: 400, y: 512 }, radius: 100, color: '#F02045', durationMs: 0 });
    // Encoding must not trigger share; sharing needs a separate fresh tap.
    const toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (...args) { setTimeout(() => toBlob.apply(this, args), 250); };
  });
  await openExport(page);
  await expect(page.getByRole('button', { name: /ファイル|ダウンロード/ })).toHaveCount(0);
  await page.getByRole('button', { name: '写真に保存' }).click();
  const preview = page.getByRole('img', { name: '保存する作品のPNG画像' });
  await expect(preview).toBeVisible();
  await expect(page.getByRole('heading', { name: '画像を「写真」に保存' })).toBeFocused();
  const url = (await preview.getAttribute('src'))!;
  expect(await page.evaluate(() => window.__photoShare)).toBeUndefined();
  const share = page.getByRole('button', { name: '共有メニューを開く', exact: true });
  await share.click();
  await expect(page.getByRole('button', { name: '共有メニューを開いています…' })).toBeDisabled();
  const result = await page.evaluate(async () => {
    const { file, active, keys } = window.__photoShare!;
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const expected = window.__lab!.renderer.pixels();
    return { active, keys, name: file.name, type: file.type, width: canvas.width, height: canvas.height,
      exact: pixels.every((value, index) => value === expected[index]) };
  });
  expect(result).toMatchObject({ keys: ['files'], type: 'image/png', width: 512, height: 512, exact: true });
  expect(result.name).toMatch(/^marbling-.*\.png$/);
  if (result.active !== undefined) expect(result.active).toBe(true);
  await page.evaluate(() => window.__finishShare!());
  await expect(share).toBeEnabled();
  expect(downloads).toEqual([]);
  await page.screenshot({ path: 'docs/photo-export-mobile.png', fullPage: true });
  await closeSheet(page);
  expect(await page.evaluate((src) => window.__revokedPhotoUrls!.includes(src), url)).toBe(true);
  await openExport(page);
  await expect(preview).toHaveCount(0);
});

for (const support of ['missing', 'false', 'throws'] as const) {
  test(`photo preview remains available without file sharing (${support})`, async ({ page }) => {
    await mockShare(page, support);
    await page.setViewportSize({ width: 390, height: 844 });
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await openPhoto(page);
    await expect(page.getByRole('button', { name: '共有メニューを開く', exact: true })).toHaveCount(0);
    await expect(page.getByText(/iPhoneでは下の画像を長押し/)).toBeVisible();
    const preview = page.getByRole('img', { name: '保存する作品のPNG画像' });
    expect(await preview.evaluate(async (node) => {
      const image = node as HTMLImageElement;
      await image.decode();
      return image.naturalWidth;
    })).toBe(512);
    expect(await preview.evaluate(node => node.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (support === 'missing') {
      for (const [width, height] of [[320, 667], [844, 390], [390, 844]]) {
        await page.setViewportSize({ width, height });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const backButton = page.getByRole('button', { name: '戻る', exact: true });
        await backButton.scrollIntoViewIfNeeded();
        await expect(backButton).toBeInViewport();
      }
    }
    await expect(page.getByRole('button', { name: /ファイル|ダウンロード|切り抜きPNG/ })).toHaveCount(0);
    expect(downloads).toEqual([]);
    const url = (await preview.getAttribute('src'))!;
    await page.getByRole('button', { name: '戻る' }).click();
    await expect(page.getByRole('button', { name: '写真に保存' })).toBeFocused();
    expect(await page.evaluate((src) => window.__revokedPhotoUrls!.includes(src), url)).toBe(true);
  });
}

for (const failure of ['AbortError', 'NotAllowedError']) {
  test(`sharing can be retried after ${failure} without starting a download`, async ({ page }) => {
    await mockShare(page);
    const downloads: string[] = [];
    page.on('download', (download) => downloads.push(download.suggestedFilename()));
    await openPhoto(page);
    await page.evaluate((name) => { window.__shareFailure = name; }, failure);
    const share = page.getByRole('button', { name: '共有メニューを開く', exact: true });
    await share.click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText(failure === 'AbortError' ? '共有をキャンセルしました' : '共有メニューを開けませんでした');
    await expect(share).toBeEnabled();
    await expect(page.getByRole('img', { name: '保存する作品のPNG画像' })).toBeVisible();
    expect(downloads).toEqual([]);
    await page.evaluate(() => { window.__shareFailure = undefined; });
    await share.click();
    await page.evaluate(() => window.__finishShare!());
    await expect(share).toBeEnabled();
  });
}

test('crop photo sharing uses the selected PNG and output dimensions', async ({ page }) => {
  await mockShare(page);
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);
  await openExport(page);
  await expect(page.getByRole('button', { name: /ファイル|ダウンロード/ })).toHaveCount(0);
  await page.getByRole('button', { name: '切り抜き', exact: true }).click();
  await page.getByRole('button', { name: '16:9', exact: true }).click();
  await page.getByLabel('出力幅').fill('320');
  await page.getByRole('button', { name: '写真に保存' }).click();
  await expect(page.getByText('320 × 180 px · PNG', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '共有メニューを開く', exact: true }).click();
  const result = await page.evaluate(async () => {
    const file = window.__photoShare!.file;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const view = new DataView(bytes.buffer);
    const preview = document.querySelector<HTMLImageElement>('.photo-export-preview')!;
    const previewBytes = new Uint8Array(await (await fetch(preview.src)).arrayBuffer());
    return { name: file.name, width: view.getUint32(16), height: view.getUint32(20), exact: bytes.every((v, i) => v === previewBytes[i]) };
  });
  expect(result).toMatchObject({ width: 320, height: 180, exact: true });
  expect(result.name).toMatch(/^marbling-crop-.*\.png$/);
  await page.evaluate(() => window.__finishShare!());
  await closeSheet(page);
  await expect(page.getByTestId('crop-box')).toBeVisible();
});

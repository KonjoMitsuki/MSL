import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('crop selection moves without painting, locks aspect, and exports the requested pixels and size', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);
  await page.evaluate(() => {
    const e = window.__lab!;
    e.reset('#278BEC');
    e.enqueue({ type: 'drop', id: 'purple', center: { x: 420, y: 512 }, radius: 130, color: '#6929E8', durationMs: 0 });
    e.enqueue({ type: 'drop', id: 'red', center: { x: 690, y: 512 }, radius: 80, color: '#F02045', durationMs: 0 });
  });
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(2);

  await page.getByRole('button', { name: '切り抜き', exact: true }).click();
  const box = page.getByTestId('crop-box');
  await expect(box).toBeVisible();
  const before = (await box.boundingBox())!;
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
  await page.mouse.down();
  await page.mouse.move(before.x + before.width / 2 + 40, before.y + before.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  const after = (await box.boundingBox())!;
  expect(after.x).toBeGreaterThan(before.x + 20);
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(2);

  await page.getByRole('button', { name: '16:9', exact: true }).click();
  await page.getByLabel('出力幅').fill('320');
  await expect(page.getByText('320 × 180px', { exact: true })).toBeVisible();
  await page.getByLabel('切り抜き幅').fill('320');
  await page.getByLabel('切り抜きX').fill('450');
  await page.getByLabel('切り抜きY').fill('432');
  await expect(page.locator('.crop-output')).toHaveText('320 × 180px');

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '切り抜きPNG' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^marbling-crop-.*\.png$/);
  const bytes = await readFile((await download.path())!);
  expect(bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(bytes.readUInt32BE(16)).toBe(320);
  expect(bytes.readUInt32BE(20)).toBe(180);

  const samples = await page.evaluate(async (base64) => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image, 0, 0);
    const at = (x: number, y: number) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)];
    return { purple: at(30, 90), blue: at(100, 90), red: at(200, 90) };
  }, bytes.toString('base64'));
  const close = (actual: number[], expected: number[]) => actual.every((v, i) => Math.abs(v - expected[i]) <= 2);
  expect(close(samples.purple, [105, 41, 232])).toBe(true);
  expect(close(samples.blue, [39, 139, 236])).toBe(true);
  expect(close(samples.red, [240, 32, 69])).toBe(true);
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(2);
  await page.screenshot({ path: 'docs/crop-desktop.png', fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel('切り抜き設定')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/crop-mobile.png', fullPage: true });
});

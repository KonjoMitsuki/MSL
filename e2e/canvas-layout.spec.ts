import { expect, test } from '@playwright/test';

test('canvas occupies the available editor space without covering icon controls', async ({ page }) => {
  await page.goto('./?resolution=512');
  for (const [width, height] of [[390, 844], [320, 667], [1440, 900], [844, 390]]) {
    await page.setViewportSize({ width, height });
    const canvas = (await page.locator('canvas').boundingBox())!;
    const dock = (await page.getByRole('navigation', { name: '描画ツール' }).boundingBox())!;
    const quick = (await page.getByRole('region', { name: 'ツールの調整' }).boundingBox())!;
    expect(canvas.width).toBeGreaterThan(width <= 390 ? width - 24 : 230);
    expect(Math.abs(canvas.width - canvas.height)).toBeLessThan(2);
    expect(canvas.y).toBeGreaterThanOrEqual(55);
    expect(canvas.y + canvas.height).toBeLessThanOrEqual(height);
    expect(dock.y + dock.height).toBeLessThanOrEqual(height);
    expect(quick.x + quick.width).toBeLessThanOrEqual(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  await page.getByRole('button', { name: '変形ペン' }).click();
  await expect(page.getByRole('button', { name: '変形ペン' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('slider', { name: 'ペン半径' })).toBeVisible();
  await page.getByRole('button', { name: '詳細設定' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

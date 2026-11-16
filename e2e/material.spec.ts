import { expect, test } from '@playwright/test';

test('per-colour ink material changes the drop and survives reload', async ({ page }) => {
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);

  await page.getByLabel('インク粘度', { exact: true }).fill('2.5');
  await page.getByLabel('表面張力', { exact: true }).fill('1.4');
  await expect(page.getByText(/実効半径 47\.3px/)).toBeVisible();
  await expect(page.getByText(/実効広がり時間 1331ms/)).toBeVisible();

  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__lab!.status.operations === 1 && !window.__lab!.status.isAnimating);
  const offset = await page.evaluate(() => {
    const data = window.__lab!.renderer.pixels();
    const index = (256 * 512 + Math.round((512 + 35) / 2)) * 4;
    return [...data.slice(index, index + 3)];
  });
  expect(offset).toEqual([105, 41, 232]);

  await page.screenshot({ path: 'docs/ink-material.png', fullPage: true });

  await page.reload();
  await page.waitForFunction(() => !!window.__lab);
  await expect(page.getByLabel('インク粘度', { exact: true })).toHaveValue('2.5');
  await expect(page.getByLabel('表面張力', { exact: true })).toHaveValue('1.4');

  await page.getByRole('button', { name: 'この色の物性を初期値に戻す' }).click();
  await expect(page.getByLabel('インク粘度', { exact: true })).toHaveValue('1');
  await expect(page.getByLabel('表面張力', { exact: true })).toHaveValue('1');
});

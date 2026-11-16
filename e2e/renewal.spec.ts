import { expect, test, type Page } from '@playwright/test';
import { closeSheet, openColors, openSettings, setSpreadDuration } from './editorHelpers';

const hash = (page: Page) => page.evaluate(() => {
  let h = 2166136261;
  for (const value of window.__lab!.renderer.pixels()) h = Math.imul(h ^ value, 16777619);
  return h;
});

test('all tools paint through the UI and history preserves the exact image', async ({ page }) => {
  await page.goto('./?resolution=512');
  await setSpreadDuration(page);
  await openColors(page);
  await page.getByLabel('インク色 HEX').fill('#F02045');
  await page.getByRole('button', { name: 'この色を使う', exact: true }).click();
  await page.getByLabel('滴の半径', { exact: true }).fill('100');
  const canvas = page.locator('canvas');
  await canvas.click();
  const drop = await hash(page);
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(1);
  const center = await page.evaluate(() => [...window.__lab!.renderer.pixels().slice((256 * 512 + 256) * 4, (256 * 512 + 256) * 4 + 3)]);
  expect(center).toEqual([240, 32, 69]);
  const drag = async (from: number, to: number) => {
    const box = (await canvas.boundingBox())!;
    await page.mouse.move(box.x + box.width * from, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * to, box.y + box.height * .5, { steps: 12 });
    await page.mouse.up();
  };
  await drag(.2, .4);
  expect(await hash(page)).not.toBe(drop);
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(2);
  await page.getByRole('button', { name: '変形ペン', exact: true }).click();
  await page.getByLabel('ペン半径', { exact: true }).fill('120');
  const beforeStroke = await hash(page);
  await drag(.5, .72);
  expect(await hash(page)).not.toBe(beforeStroke);
  await page.getByRole('button', { name: '流体ペン', exact: true }).click();
  await page.getByLabel('余韻', { exact: true }).fill('0.2');
  const beforeFlow = await hash(page);
  await drag(.65, .8);
  await page.evaluate(() => window.__lab!.whenIdle());
  const afterFlow = await hash(page);
  expect(afterFlow).not.toBe(beforeFlow);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await hash(page)).toBe(beforeFlow);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await hash(page)).toBe(afterFlow);
  await page.getByRole('button', { name: '移動', exact: true }).click();
  const panBefore = await page.evaluate(() => window.__lab!.renderer.pan.x);
  await drag(.4, .5);
  expect(await page.evaluate(() => window.__lab!.renderer.pan.x)).toBeGreaterThan(panBefore);
  expect(await hash(page)).toBe(afterFlow);
});

test('sheets contain focus, preserve keyboard activation, return focus and isolate history shortcuts', async ({ page }) => {
  await page.goto('./?resolution=512');
  await setSpreadDuration(page);
  await page.locator('canvas').click();
  const original = await hash(page);
  const trigger = page.getByRole('button', { name: 'カラーを選択', exact: true });
  await trigger.focus();
  await page.keyboard.press('Space');
  const dialog = page.getByRole('dialog', { name: 'カラーを選択', exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: '閉じる', exact: true })).toBeFocused();
  await page.keyboard.press('Control+z');
  expect(await hash(page)).toBe(original);
  for (let i = 0; i < 45; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement === document.body || document.activeElement?.closest('dialog') !== null)).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await openColors(page);
  await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.keyboard.press('Escape');
  await openColors(page);
  expect(await dialog.evaluate(el => el.scrollTop)).toBe(0);
  await page.keyboard.press('Escape');
  await openSettings(page);
  await page.getByLabel('広がり時間', { exact: true }).fill('750');
  await closeSheet(page);
  await openSettings(page);
  await expect(page.getByLabel('広がり時間', { exact: true })).toHaveValue('750');
});

test('recent and saved colours survive reload; invalid HEX is recoverable', async ({ page }) => {
  await page.goto('./?resolution=512');
  await openColors(page);
  const input = page.getByLabel('インク色 HEX');
  await input.fill('#12AB34');
  await page.getByRole('button', { name: '＋ この色を保存', exact: true }).click();
  await input.fill('#BAD');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  await page.getByRole('button', { name: '閉じる', exact: true }).focus();
  await expect(input).toHaveValue('#12AB34');
  await page.reload();
  await openColors(page);
  await page.getByRole('button', { name: '最近の色 #12AB34', exact: true }).click();
  await expect(input).toHaveValue('#12AB34');
  await expect(page.getByRole('button', { name: '保存色 #12AB34', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const assets = await page.locator('.hue-choice img').evaluateAll(images => images.every(img => img instanceof HTMLImageElement && img.complete && img.naturalWidth === 32 && img.getBoundingClientRect().width === 32));
  expect(assets).toBe(true);
  await page.getByRole('button', { name: '色相 オレンジ', exact: true }).click();
  await expect(input).toHaveValue('#F38035');
});

test('phone, tablet, desktop and rotation preserve canvas pixels with reachable controls', async ({ page }) => {
  await page.goto('./?resolution=512');
  await setSpreadDuration(page);
  await page.locator('canvas').click();
  const original = await hash(page);
  for (const [width, height] of [[320, 667], [390, 844], [768, 1024], [1440, 900], [844, 390]]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole('navigation', { name: '描画ツール' })).toBeVisible();
    await expect(page.locator('canvas')).toHaveCSS('touch-action', 'none');
    const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth, height: innerHeight, dock: document.querySelector('.tool-dock')!.getBoundingClientRect().bottom }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width);
    if (height >= 667) expect(dimensions.dock).toBeLessThanOrEqual(height);
    expect(await hash(page)).toBe(original);
    await openColors(page);
    await expect(page.getByRole('dialog')).toBeInViewport();
    await closeSheet(page);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.setProperty('--safe-top', '47px');
    document.documentElement.style.setProperty('--safe-bottom', '34px');
  });
  const safeArea = await page.evaluate(() => ({
    top: document.querySelector('.topbar')!.getBoundingClientRect().top,
    bottom: document.querySelector('.tool-dock')!.getBoundingClientRect().bottom,
    canvas: document.querySelector('canvas')!.getBoundingClientRect().width,
  }));
  expect(safeArea.top).toBeGreaterThanOrEqual(47);
  expect(safeArea.bottom).toBeLessThanOrEqual(844 - 34);
  expect(safeArea.canvas).toBeGreaterThanOrEqual(250);
  expect(await hash(page)).toBe(original);
  await page.evaluate(() => {
    document.documentElement.style.removeProperty('--safe-top');
    document.documentElement.style.removeProperty('--safe-bottom');
  });
  await page.screenshot({ path: 'docs/renewal-mobile.png', fullPage: true, animations: 'disabled' });
  await openColors(page);
  await page.screenshot({ path: 'docs/renewal-colors.png', fullPage: true, animations: 'disabled' });
  await closeSheet(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: 'docs/renewal-desktop.png', fullPage: true, animations: 'disabled' });
});

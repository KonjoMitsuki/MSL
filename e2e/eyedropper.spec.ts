import { expect, test } from '@playwright/test';
import { openColors, setSpreadDuration } from './editorHelpers';

test('eyedropper samples the visible surface without painting and supports keyboard and cancellation', async ({ page }) => {
  await page.goto('./?resolution=512');
  await setSpreadDuration(page);
  await openColors(page);
  await page.getByLabel('インク色 HEX').fill('#F02045');
  await page.getByRole('button', { name: 'この色を使う' }).click();
  const canvas = page.locator('canvas');
  await canvas.click();
  const hash = () => page.evaluate(() => {
    let value = 2166136261;
    for (const pixel of window.__lab!.renderer.pixels()) value = Math.imul(value ^ pixel, 16777619);
    return value;
  });
  const original = await hash();
  const operations = await page.evaluate(() => window.__lab!.status.operations);

  await openColors(page);
  await page.getByLabel('インク色 HEX').fill('#123456');
  await page.getByRole('button', { name: 'スポイトで水面から色を選ぶ' }).click();
  await expect(canvas).toBeFocused();
  await expect(page.getByText('水面をタップして色を選ぶ', { exact: true })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.getByText('水面をタップして色を選ぶ', { exact: true })).not.toBeVisible();
  await openColors(page);
  await expect(page.getByLabel('インク色 HEX')).toHaveValue('#F02045');
  await page.getByRole('button', { name: 'この色を使う' }).click();

  await page.getByRole('button', { name: '拡大' }).click();
  await page.getByRole('button', { name: '移動', exact: true }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * .6, box.y + box.height * .5);
  await page.mouse.up();
  await openColors(page);
  await page.getByRole('button', { name: 'スポイトで水面から色を選ぶ' }).click();
  await canvas.click({ position: { x: box.width * .6, y: box.height * .5 } });
  await openColors(page);
  await expect(page.getByLabel('インク色 HEX')).toHaveValue('#F02045');
  await page.getByRole('button', { name: 'スポイトで水面から色を選ぶ' }).click();
  await canvas.click({ position: { x: box.width * .15, y: box.height * .2 } });
  await openColors(page);
  await expect(page.getByLabel('インク色 HEX')).toHaveValue('#278BEC');
  await page.getByRole('button', { name: 'スポイトで水面から色を選ぶ' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByText('水面をタップして色を選ぶ', { exact: true })).not.toBeVisible();
  await openColors(page);
  await expect(page.getByLabel('インク色 HEX')).toHaveValue('#278BEC');
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(operations);
  expect(await hash()).toBe(original);
});

test('sampling blends translucent pigment over the water and ignores points outside the surface', async ({ page }) => {
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);
  const edge = await page.evaluate(async () => {
    const engine = window.__lab!;
    engine.enqueue({ type: 'drop', id: 'fade-sample', center: { x: 512, y: 512 },
      radius: 160, color: '#F02045', durationMs: 0, waterFade: 1 });
    await engine.whenIdle();
    const point = { x: 662, y: 512 };
    const raw = engine.renderer.pixels();
    const index = (256 * 512 + 331) * 4;
    return { picked: engine.renderer.sampleColor(point), rgba: Array.from(raw.slice(index, index + 4)),
      outside: engine.renderer.sampleColor({ x: -1, y: 512 }) };
  });
  expect(edge.rgba.slice(0, 3)).toEqual([240, 32, 69]);
  expect(edge.rgba[3]).toBeLessThan(255);
  expect(edge.picked).toBe(
    `#${edge.rgba.slice(0, 3).map((channel, i) =>
      Math.round(channel * edge.rgba[3] / 255 + [39, 139, 236][i] * (1 - edge.rgba[3] / 255))
        .toString(16).padStart(2, '0')).join('').toUpperCase()}`,
  );
  expect(edge.outside).toBeNull();
});

test('touch sampling on a narrow screen picks a color without adding a drop', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto('./?resolution=512');
    await page.getByRole('button', { name: 'カラーを選択', exact: true }).tap();
    await page.getByRole('button', { name: 'スポイトで水面から色を選ぶ' }).tap();
    const box = (await page.locator('canvas').boundingBox())!;
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
    await page.getByRole('button', { name: 'カラーを選択', exact: true }).tap();
    await expect(page.getByLabel('インク色 HEX')).toHaveValue('#278BEC');
    expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(0);
  } finally {
    await context.close();
  }
});

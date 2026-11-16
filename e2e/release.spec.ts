import { setSpreadDuration } from './editorHelpers';
import { expect, test } from '@playwright/test';

test('press-and-hold grows the same drop, short taps finish, cancel leaves no history', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);

  const result = await page.evaluate(async () => {
    const e = window.__lab!;
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const pixel = (data: Uint8Array, x: number, y = 512) => {
      const px = Math.round(x / 2), py = Math.round(y / 2);
      return [...data.slice((py * 512 + px) * 4, (py * 512 + px) * 4 + 3)];
    };
    const hash = (data: Uint8Array) => {
      let value = 2166136261;
      for (const byte of data) value = Math.imul(value ^ byte, 16777619);
      return value;
    };

    e.reset('#278BEC');
    e.beginPressDrop({ x: 512, y: 512 }, 60, '#F02045', 300, 0);
    await sleep(40);
    e.releasePressDrop();
    await e.whenIdle();
    const early = e.renderer.pixels();
    const shortTap = {
      operations: e.status.operations,
      center: pixel(early, 512),
      nearEdge: pixel(early, 570),
    };

    e.reset('#278BEC');
    e.beginPressDrop({ x: 512, y: 512 }, 40, '#F02045', 100, 0);
    await sleep(450);
    const pressing = e.status.isPressing;
    e.releasePressDrop();
    await e.whenIdle();
    const held = e.renderer.pixels();
    const longPress = {
      pressing,
      operations: e.status.operations,
      outsideBase: pixel(held, 560),
      inside: pixel(held, 512),
    };

    e.reset('#278BEC');
    const before = hash(e.renderer.pixels());
    e.beginPressDrop({ x: 512, y: 512 }, 80, '#6929E8', 400, 0.8);
    await sleep(90);
    e.cancelPressDrop();
    const cancelled = {
      operations: e.status.operations,
      unchanged: hash(e.renderer.pixels()) === before,
      pressing: e.status.isPressing,
    };

    return { shortTap, longPress, cancelled };
  });

  expect(result.shortTap).toEqual({ operations: 1, center: [240, 32, 69], nearEdge: [240, 32, 69] });
  expect(result.longPress).toEqual({ pressing: true, operations: 1, outsideBase: [240, 32, 69], inside: [240, 32, 69] });
  expect(result.cancelled).toEqual({ operations: 0, unchanged: true, pressing: false });
});

test('surface tension changes spread and displacement without producing mixed colours', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);

  const result = await page.evaluate(() => {
    const e = window.__lab!;
    const measure = (surfaceTension: number) => {
      e.reset('#278BEC');
      e.enqueue({ type: 'drop', id: 'purple', center: { x: 420, y: 512 }, radius: 130, color: '#6929E8', durationMs: 0 });
      e.enqueue({
        type: 'drop', id: 'red', center: { x: 690, y: 512 }, radius: 100, color: '#F02045',
        durationMs: 0, ink: { viscosity: 1, surfaceTension },
      });
      const data = e.renderer.pixels();
      let redMin = 1024, redMax = -1, purpleMax = -1;
      const palette = new Set<string>();
      for (let x = 0; x < 512; x++) {
        const row = (256 * 512 + x) * 4;
        const rgb = [data[row], data[row + 1], data[row + 2]].join(',');
        palette.add(rgb);
        if (rgb === '240,32,69') { redMin = Math.min(redMin, x * 2); redMax = Math.max(redMax, x * 2); }
        if (rgb === '105,41,232') purpleMax = Math.max(purpleMax, x * 2);
      }
      return { redMin, redMax, purpleMax, palette: [...palette].sort() };
    };
    return { low: measure(0.6), high: measure(1.4), error: e.renderer.gl.getError() };
  });

  // Lower surface tension gives the same nominal drop a larger equilibrium radius.
  expect(result.high.redMin).toBeGreaterThan(result.low.redMin + 20);
  expect(result.high.redMax).toBeLessThan(result.low.redMax - 10);
  // It presses the older purple less.
  expect(result.high.purpleMax).toBeGreaterThan(result.low.purpleMax);
  expect(result.low.palette).toEqual(['105,41,232', '240,32,69', '39,139,236']);
  expect(result.high.palette).toEqual(['105,41,232', '240,32,69', '39,139,236']);
  expect(result.error).toBe(0);
});

test('real mouse hold expands beyond the chosen radius, while a tap keeps the chosen size', async ({ page }) => {
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);
  await setSpreadDuration(page);
  await page.getByLabel('滴の半径', { exact: true }).fill('40');
  const canvas = page.locator('canvas');
  const box = (await canvas.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const atOffset = (offset: number) => page.evaluate((x) => {
    const e = window.__lab!;
    const data = e.renderer.pixels();
    const index = (256 * 512 + Math.round(x / 2)) * 4;
    return [...data.slice(index, index + 3)];
  }, 512 + offset);

  await page.mouse.click(center.x, center.y);
  await page.waitForFunction(() => window.__lab!.status.operations === 1 && !window.__lab!.status.isAnimating);
  expect(await atOffset(50)).toEqual([39, 139, 236]);
  await page.evaluate(() => window.__lab!.undo());
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(0);

  await page.mouse.move(center.x, center.y);
  await page.mouse.down();
  await page.waitForFunction(() => window.__lab!.status.isPressing);
  await page.waitForTimeout(650);
  await page.mouse.up();
  await page.waitForFunction(() => window.__lab!.status.operations === 1 && !window.__lab!.status.isPressing);
  expect(await atOffset(50)).toEqual([105, 41, 232]);
  await page.screenshot({ path: 'docs/press-growth.png', fullPage: true });
});

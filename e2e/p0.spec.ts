import { test, expect, type Page } from '@playwright/test';
import { readFile, writeFile } from 'node:fs/promises';

async function ready(page: Page, url = './') {
  await page.goto(url);
  await page.waitForFunction(() => !!window.__lab);
}

test('AT-05/06/08: full-surface stroke, exact palette, Undo/Redo, cancel and clear', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(() => {
    const e = window.__lab!;
    const equal = (a: Uint8Array, b: Uint8Array) => a.every((v, i) => v === b[i]);
    e.enqueue({ type: 'drop', id: 'purple', center: { x: 420, y: 512 }, radius: 130, color: '#6929E8', durationMs: 0 });
    e.enqueue({ type: 'drop', id: 'red', center: { x: 690, y: 512 }, radius: 80, color: '#F02045', durationMs: 0 });
    const before = e.renderer.pixels();
    e.beginStroke({ x: 500, y: 512 }, 70, 0.8);
    for (let x = 510; x <= 610; x += 10) e.moveStroke({ x, y: 512 });
    e.endStroke();
    const after = e.renderer.pixels();
    let blueToPurple = 0, purpleToBlue = 0;
    const palette = new Set<string>();
    for (let i = 0; i < after.length; i += 4) {
      if (before[i] === 39 && after[i] === 105) blueToPurple++;
      if (before[i] === 105 && after[i] === 39) purpleToBlue++;
      palette.add([...after.slice(i, i + 3)].join(','));
    }
    const count = e.status.operations;
    e.undo();
    const undoStroke = equal(e.renderer.pixels(), before);
    e.undo();
    const dropUndone = e.status.operations === 1;
    e.redo();
    const redoDrop = equal(e.renderer.pixels(), before);
    e.redo();
    const redoStroke = equal(e.renderer.pixels(), after);
    e.beginStroke({ x: 500, y: 512 }, 70, 0.8);
    e.moveStroke({ x: 600, y: 500 });
    e.endStroke(true);
    const cancel = equal(e.renderer.pixels(), after) && e.status.operations === count;
    e.clear('#123456');
    const clear = [...e.renderer.pixels().slice(0, 4)];
    e.undo();
    const undoClear = equal(e.renderer.pixels(), after);
    e.undo();
    e.enqueue({ type: 'drop', id: 'branch', center: { x: 200, y: 100 }, radius: 10, color: '#F02045', durationMs: 0 });
    return { blueToPurple, purpleToBlue, changed: !equal(before, after), palette: [...palette].sort(), count,
      undoStroke, dropUndone, redoDrop, redoStroke, cancel, clear, undoClear, branch: !e.status.canRedo };
  });
  expect(result.blueToPurple).toBeGreaterThan(100);
  expect(result.changed).toBe(true);
  expect(result.palette).toEqual(['105,41,232', '240,32,69', '39,139,236']);
  expect(result.count).toBe(3);
  for (const flag of ['undoStroke', 'dropUndone', 'redoDrop', 'redoStroke', 'cancel', 'undoClear', 'branch'] as const) expect(result[flag], flag).toBe(true);
  expect(result.clear).toEqual([18, 52, 86, 255]);
});

test('stroke image is independent of event density along the same path', async ({ page }) => {
  await ready(page);
  const exact = await page.evaluate(() => {
    const e = window.__lab!;
    const run = (dense: boolean) => {
      e.reset('#278BEC');
      e.enqueue({ type: 'drop', id: 'start', center: { x: 420, y: 512 }, radius: 130, color: '#6929E8', durationMs: 0 });
      e.beginStroke({ x: 500, y: 512 }, 70, 0.6);
      if (dense) for (let x = 501; x <= 610; x++) e.moveStroke({ x, y: 512 });
      else e.moveStroke({ x: 610, y: 512 });
      e.endStroke();
      return e.renderer.pixels();
    };
    const sparse = run(false), dense = run(true);
    return sparse.every((v, i) => v === dense[i]);
  });
  expect(exact).toBe(true);
});

test('AT-09/12: mouse mapping at zoom, resize persistence, UI keyboard history and pointer cancellation', async ({ page }) => {
  await ready(page);
  await page.getByLabel('広がり時間', { exact: true }).fill('0');
  const canvas = page.locator('canvas');
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  await page.mouse.click(rect.x + rect.width * 0.7, rect.y + rect.height * 0.4);
  const painted = await page.evaluate(() => {
    const e = window.__lab!;
    const data = e.renderer.pixels();
    const x = Math.floor((0.2 / 1.25 + 0.5) * 1024), y = Math.floor((-0.1 / 1.25 + 0.5) * 1024);
    return [...data.slice((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 3)];
  });
  expect(painted).toEqual([105, 41, 232]);
  const hash = () => page.evaluate(() => {
    const data = window.__lab!.renderer.pixels();
    let hash = 2166136261;
    for (const v of data) hash = Math.imul(hash ^ v, 16777619);
    return hash;
  });
  const before = await hash();
  await page.setViewportSize({ width: 780, height: 950 });
  await expect(canvas).toHaveCSS('touch-action', 'none');
  expect(await hash()).toBe(before);
  await page.keyboard.press('Control+z');
  await expect(page.getByRole('button', { name: 'Redo', exact: true })).toBeEnabled();
  await page.keyboard.press('Control+Shift+z');
  expect(await hash()).toBe(before);
  await page.getByRole('button', { name: '変形ペン', exact: false }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.45, { steps: 8 });
  await canvas.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.mouse.up();
  expect(await hash()).toBe(before);
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(1);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: '全消去', exact: true }).click();
  expect(await hash()).toBe(before);
});

test('AT-09: real touch tap, two-finger pinch with no stray ink, touch stroke and mobile layout', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173/MSL/', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await ready(page);
  await page.getByLabel('広がり時間', { exact: true }).fill('0');
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  await page.touchscreen.tap(rect.x + rect.width / 2, rect.y + rect.height / 2);
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(1);
  const client = await context.newCDPSession(page);
  const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  const touches = (distance: number) => [{ x: center.x - distance, y: center.y, id: 1 }, { x: center.x + distance, y: center.y, id: 2 }];
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: touches(30) });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: touches(60) });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(1);
  expect(await page.evaluate(() => window.__lab!.renderer.zoom)).toBeGreaterThan(1.5);
  await page.getByRole('button', { name: '表示をフィット' }).click();
  await page.getByRole('button', { name: '変形ペン', exact: false }).click();
  // Scroll button clicks can move the canvas on a small viewport; recompute its bounds.
  await canvas.scrollIntoViewIfNeeded();
  const strokeRect = (await canvas.boundingBox())!;
  const sx = strokeRect.x + strokeRect.width / 2, sy = strokeRect.y + strokeRect.height / 2;
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: sx + 45, y: sy, id: 1 }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'docs/mobile.png', fullPage: true });
  await context.close();
});

test('AT-10: UI PNG download is the exact unzoomed simulation, at 512px', async ({ page }) => {
  await ready(page, './?resolution=512');
  await page.evaluate(() => {
    window.__lab!.enqueue({ type: 'drop', id: 'asymmetric', center: { x: 200, y: 300 }, radius: 60, color: '#F02045', durationMs: 0 });
  });
  await page.getByRole('button', { name: '拡大', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG保存', exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const bytes = await readFile((await download.path())!);
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const result = await page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const c = document.createElement('canvas');
    c.width = bitmap.width; c.height = bitmap.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
    const surface = window.__lab!.renderer.pixels();
    return { width: c.width, height: c.height, exact: pixels.every((v, i) => v === surface[i]), background: [...pixels.slice(0, 4)] };
  }, bytes.toString('base64'));
  expect(result).toEqual({ width: 512, height: 512, exact: true, background: [39, 139, 236, 255] });
});

test('WebGL context loss cancels preview and reconstructs committed history on restoration', async ({ page }) => {
  await ready(page);
  await page.evaluate(() => {
    const e = window.__lab!;
    e.enqueue({ type: 'drop', id: 'committed', center: { x: 420, y: 512 }, radius: 130, color: '#6929E8', durationMs: 0 });
    e.enqueue({ type: 'drop', id: 'preview', center: { x: 690, y: 512 }, radius: 80, color: '#F02045', durationMs: 1500 });
    const extension = e.renderer.gl.getExtension('WEBGL_lose_context')!;
    extension.loseContext();
    setTimeout(() => extension.restoreContext(), 150);
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const result = await page.evaluate(() => {
    const e = window.__lab!;
    const data = e.renderer.pixels();
    const at = (x: number) => [...data.slice((512 * 1024 + x) * 4, (512 * 1024 + x) * 4 + 3)];
    return { count: e.status.operations, purple: at(420), cancelledRed: at(690), textures: e.renderer.textureCount, error: e.renderer.gl.getError() };
  });
  expect(result).toEqual({ count: 1, purple: [105, 41, 232], cancelledRed: [39, 139, 236], textures: 3, error: 0 });
});

test('WebGL2 unavailable shows an actionable error', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<typeof original>) {
      if (args[0] === 'webgl2') return null;
      return original.apply(this, args);
    } as typeof original;
  });
  await page.goto('./');
  await expect(page.getByRole('alert')).toContainText('WebGL2が利用できません');
  await expect(page.getByRole('button', { name: 'PNG保存' })).toBeDisabled();
});

test('AT-11: 100 drops, bounded GPU resources/history, replay beyond eviction and measured preview', async ({ page }) => {
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const live = new Set<WebGLTexture>();
    let created = 0, deleted = 0;
    const proto = WebGL2RenderingContext.prototype;
    const create = proto.createTexture, remove = proto.deleteTexture;
    proto.createTexture = function () { const value = create.call(this); if (value) { live.add(value); created++; } return value; };
    proto.deleteTexture = function (texture) { if (texture && live.delete(texture)) deleted++; return remove.call(this, texture); };
    Object.defineProperty(window, '__gpuStats', { get: () => ({ live: live.size, created, deleted }) });
  });
  await ready(page);
  const result = await page.evaluate(async () => {
    const e = window.__lab!;
    const hash = (data: Uint8Array) => { let h = 2166136261; for (const v of data) h = Math.imul(h ^ v, 16777619); return h; };
    const stats = () => (window as unknown as { __gpuStats: { live: number; created: number; deleted: number } }).__gpuStats;
    const before = stats();
    const batchMs: number[] = [];
    let middleHash = 0;
    for (let batch = 0; batch < 5; batch++) {
      const start = performance.now();
      for (let j = 0; j < 20; j++) {
        const i = batch * 20 + j;
        e.enqueue({ type: 'drop', id: `stress-${i}`, center: { x: (i * 137 + 100) % 1024, y: (i * 271 + 300) % 1024 }, radius: 20 + i % 50, color: ['#6929E8', '#F02045', '#278BEC'][i % 3], durationMs: 0 });
        if (i === 49) middleHash = hash(e.renderer.pixels());
      }
      e.renderer.gl.finish();
      batchMs.push(performance.now() - start);
    }
    const finalHash = hash(e.renderer.pixels());
    const count = e.status.operations, retained = e.history.retained, memory = e.history.memoryBytes;
    for (let i = 0; i < 50; i++) e.undo();
    const undoToBaseline = hash(e.renderer.pixels()) === middleHash && !e.status.canUndo;
    for (let i = 0; i < 50; i++) e.redo();
    const redoExact = hash(e.renderer.pixels()) === finalHash;
    e.enqueue({ type: 'drop', id: 'fps', center: { x: 500, y: 500 }, radius: 100, color: '#F02045', durationMs: 1500 });
    await e.whenIdle();
    return { resolution: e.resolution, count, retained, memory, batchMs, previewFps: e.status.fps, undoToBaseline, redoExact, before, after: stats(), error: e.renderer.gl.getError(), userAgent: navigator.userAgent };
  });
  expect(result.count).toBe(100);
  expect(result.retained).toBe(50);
  expect(result.memory).toBeLessThanOrEqual(20 * 1024 * 1024);
  expect(result.undoToBaseline).toBe(true);
  expect(result.redoExact).toBe(true);
  expect(result.after).toEqual(result.before);
  expect(result.after.live).toBe(3);
  expect(result.error).toBe(0);
  await writeFile('docs/performance.json', JSON.stringify({ measuredAt: new Date().toISOString(), environment: 'Linux, Chromium, software WebGL2 / SwiftShader; not a physical-device benchmark', ...result }, null, 2) + '\n');
});

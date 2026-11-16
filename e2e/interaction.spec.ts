import { openSettings, openColors, closeSheet, setSpreadDuration } from './editorHelpers';
import { expect, test } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('palette selection, arbitrary HEX, and saved colors survive reload', async ({ page }) => {
  await page.goto('./');
  await openColors(page);
  await expect(page.getByRole('region', { name: 'カラーパレット' }).getByRole('button', { name: /^色 / })).toHaveCount(24);
  await page.getByLabel('パレット', { exact: true }).selectOption('パステル');
  await page.getByRole('button', { name: '色 #A8DEC2', exact: true }).click();
  await expect(page.getByLabel('インク色 HEX')).toHaveValue('#A8DEC2');
  await page.getByLabel('インク色 HEX').fill('#12AB34');
  await page.getByRole('button', { name: '＋ この色を保存', exact: true }).click();
  await page.reload();
  await openColors(page);
  await page.getByRole('button', { name: '保存色 #12AB34', exact: true }).click();
  await closeSheet(page);
  await setSpreadDuration(page);
  await page.locator('canvas').click();
  const pixel = await page.evaluate(() => [...window.__lab!.renderer.pixels().slice((512 * 1024 + 512) * 4, (512 * 1024 + 512) * 4 + 3)]);
  expect(pixel).toEqual([18, 171, 52]);
});

test('long pen follows the hand and fractional low-strength motion accumulates without new pigment', async ({ page }) => {
  await page.goto('./?resolution=512');
  const result = await page.evaluate(() => {
    const e = window.__lab!;
    const drop = () => e.enqueue({ type: 'drop', id: 'seed', center: { x: 300, y: 512 }, radius: 100, color: '#6929E8', durationMs: 0 });
    drop();
    e.beginStroke({ x: 350, y: 512 }, 80, 1.2);
    e.moveStroke({ x: 750, y: 512 });
    e.endStroke();
    let right = 0;
    const image = e.renderer.pixels();
    for (let x = 0; x < 512; x++) if (image[(256 * 512 + x) * 4] === 105) right = x * 2;
    e.reset('#278BEC'); drop();
    const before = e.renderer.pixels();
    e.beginStroke({ x: 390, y: 512 }, 8, 0.2);
    e.moveStroke({ x: 440, y: 512 }); e.endStroke();
    const after = e.renderer.pixels();
    const colors = new Set<string>();
    let changed = 0;
    for (let i = 0; i < after.length; i += 4) {
      if (after[i] !== before[i]) changed++;
      colors.add([...after.slice(i, i + 3)].join(','));
    }
    return { right, changed, colors: [...colors].sort(), error: e.renderer.gl.getError() };
  });
  expect(result.right).toBeGreaterThan(700);
  expect(result.changed).toBeGreaterThan(0);
  expect(result.colors).toEqual(['105,41,232', '39,139,236']);
  expect(result.error).toBe(0);
});

test('fluid inertia, exact history, cancellation, bounded resources and context restoration', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('./?resolution=512');
  const result = await page.evaluate(async () => {
    const e = window.__lab!;
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const hash = () => { let h = 0; for (const v of e.renderer.pixels()) h = Math.imul(h ^ v, 16777619); return h; };
    e.enqueue({ type: 'drop', id: 'p', center: { x: 420, y: 512 }, radius: 130, color: '#6929E8', durationMs: 0 });
    e.enqueue({ type: 'drop', id: 'r', center: { x: 690, y: 512 }, radius: 80, color: '#F02045', durationMs: 0 });
    const initial = hash();
    e.beginFlow({ x: 480, y: 512 }, 100, 1.5, 0.5);
    const times: number[] = [];
    let last = performance.now();
    for (let i = 1; i <= 18; i++) {
      e.moveFlow({ x: 480 + i * 10, y: 512 - Math.sin(i / 18 * Math.PI) * 90 });
      await frame();
      times.push(performance.now() - last); last = performance.now();
    }
    e.endFlow();
    const release = hash(), pendingCount = e.status.operations;
    await e.whenIdle();
    const final = hash(), count = e.status.operations;
    const colors = new Set<string>(), pixels = e.renderer.pixels();
    for (let i = 0; i < pixels.length; i += 4) colors.add([...pixels.slice(i, i + 3)].join(','));
    e.undo(); const undo = hash() === initial;
    e.redo(); const redo = hash() === final;
    const textures = e.renderer.textureCount;
    for (let i = 0; i < 3; i++) {
      e.beginFlow({ x: 500, y: 512 }, 80, 1.2, 0.2);
      e.moveFlow({ x: 550, y: 512 }); await frame(); await frame(); e.endFlow(true);
    }
    const cancelled = hash() === final && e.status.operations === count;
    return { initial, release, final, pendingCount, count, undo, redo, cancelled,
      colors: [...colors].sort(), textures, afterTextures: e.renderer.textureCount, error: e.renderer.gl.getError(),
      frameMs: times, finalHash: final };
  });
  expect(result.release).not.toBe(result.initial);
  expect(result.final).not.toBe(result.release);
  expect(result.pendingCount).toBe(2);
  expect(result.count).toBe(3);
  expect(result.undo && result.redo && result.cancelled).toBe(true);
  expect(result.colors).toEqual(['105,41,232', '240,32,69', '39,139,236']);
  expect(result.textures).toBe(6);
  expect(result.afterTextures).toBe(6);
  expect(result.error).toBe(0);
  await page.getByRole('button', { name: '流体ペン', exact: false }).click();
  await page.screenshot({ path: 'docs/fluid-demo.png', fullPage: true });
  await writeFile('docs/fluid-performance.json', JSON.stringify({ environment: 'Chromium / SwiftShader, 512px pigment, 64x64 CPU velocity; not real device', ...result }, null, 2) + '\n');
  await page.evaluate(() => {
    const ext = window.__lab!.renderer.gl.getExtension('WEBGL_lose_context')!;
    ext.loseContext(); setTimeout(() => ext.restoreContext(), 150);
  });
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => {
    let h = 0; for (const v of window.__lab!.renderer.pixels()) h = Math.imul(h ^ v, 16777619); return h;
  })).toBe(result.finalHash);
});

test('continuous drops follow mouse, displace old ink, replay exactly and cancel as one gesture', async ({ page }) => {
  await page.goto('./?resolution=512');
  const consistent = await page.evaluate(() => {
    const e = window.__lab!;
    const hash = () => { let h = 0; for (const v of e.renderer.pixels()) h = Math.imul(h ^ v, 16777619); return h; };
    const seed = () => { e.reset('#278BEC'); e.enqueue({ type: 'drop', id: 'p', center: { x: 420, y: 512 }, radius: 130, color: '#6929E8', durationMs: 0 }); };
    seed();
    const original = e.renderer.pixels();
    const run = (dense: boolean) => {
      seed();
      e.beginTrail({ x: 570, y: 350 }, 20, '#F02045', 0.7);
      if (dense) for (let y = 351; y <= 700; y++) e.moveTrail({ x: 570, y });
      else e.moveTrail({ x: 570, y: 700 });
      e.endTrail(); return hash();
    };
    const sparse = run(false), dense = run(true);
    const count = e.status.operations;
    e.undo(); const undone = e.status.operations === 1;
    e.redo(); const redone = hash() === dense;
    const beforeCancel = hash();
    e.beginTrail({ x: 100, y: 100 }, 30, '#00A88F'); e.moveTrail({ x: 700, y: 700 }); e.endTrail(true);
    const cancelled = hash() === beforeCancel;
    const data = e.renderer.pixels();
    // An overlay can only turn purple red. It cannot move blue into old purple.
    let displaced = 0;
    for (let i = 0; i < data.length; i += 4) if (original[i] === 105 && data[i] === 39) displaced++;
    seed();
    return { equal: sparse === dense, count, undone, redone, cancelled, displaced };
  });
  expect(consistent.equal && consistent.undone && consistent.redone && consistent.cancelled).toBe(true);
  expect(consistent.count).toBe(2);
  expect(consistent.displaced).toBeGreaterThan(10);
  await page.getByLabel('滴の半径', { exact: true }).fill('20');
  const canvas = page.locator('canvas'), rect = (await canvas.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * 0.2, rect.y + rect.height * 0.25);
  await page.mouse.down();
  await page.mouse.move(rect.x + rect.width * 0.8, rect.y + rect.height * 0.25, { steps: 15 });
  expect(await page.evaluate(() => window.__lab!.status.isStroking)).toBe(true);
  await page.mouse.up();
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(2);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(1);
});

test('touch continuous drops, pinch rollback and fluid-tool wiring', async ({ browser }) => {
  const context = await browser.newContext({ baseURL: 'http://127.0.0.1:5173/MSL/', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto('./?resolution=512');
  await page.getByLabel('滴の半径', { exact: true }).fill('20');
  const canvas = page.locator('canvas');
  await canvas.scrollIntoViewIfNeeded();
  const rect = (await canvas.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const a = { x: rect.x + rect.width * 0.3, y: rect.y + rect.height * 0.5, id: 1 };
  const b = { ...a, x: a.x + 70 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [b] });
  expect(await page.evaluate(() => window.__lab!.status.isStroking)).toBe(true);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [a] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [b] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [b, { ...a, y: a.y + 50, id: 2 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(1);
  await page.getByRole('button', { name: '流体ペン', exact: false }).click();
  await openSettings(page);
  await page.getByLabel('流れが続く時間（詳細）', { exact: true }).fill('0.2');
  await closeSheet(page);
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const start = { x: box.x + box.width * 0.4, y: box.y + box.height * 0.5, id: 1 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...start, x: start.x + 60 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => !window.__lab!.status.isFlowing);
  expect(await page.evaluate(() => window.__lab!.status.operations)).toBe(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});

test('1024px fluid tool and immediate stop preserve last input as a single replayable operation', async ({ page }) => {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__lab);
  const result = await page.evaluate(() => {
    const e = window.__lab!;
    const hash = () => { let h = 0; for (const v of e.renderer.pixels()) h = Math.imul(h ^ v, 16777619); return h; };
    e.enqueue({ type: 'drop', id: 'purple', center: { x: 420, y: 512 }, radius: 130, color: '#6929E8', durationMs: 0 });
    const before = hash(), start = performance.now();
    e.beginFlow({ x: 500, y: 512 }, 100, 2, 1.2);
    e.moveFlow({ x: 600, y: 512 });
    e.settleFlow();
    const after = hash(), ms = performance.now() - start;
    e.undo(); const undone = hash() === before;
    e.redo(); const redone = hash() === after;
    return { changed: after !== before, undone, redone, count: e.status.operations, ms, error: e.renderer.gl.getError() };
  });
  expect(result.changed && result.undone && result.redone).toBe(true);
  expect(result.count).toBe(2);
  expect(result.error).toBe(0);
});

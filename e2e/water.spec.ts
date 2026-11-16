import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('water fade lowers alpha only at the rim, keeps exact RGB labels, and shows the water behind', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);

  const result = await page.evaluate(() => {
    const e = window.__lab!;
    const measure = (waterFade: number) => {
      e.reset('#278BEC');
      e.enqueue({
        type: 'drop', id: `water-${waterFade}`, center: { x: 512, y: 512 }, radius: 160,
        color: '#F02045', durationMs: 0, waterFade,
      });
      const raw = e.renderer.pixels();
      const rawAt = (offset: number) => {
        const index = (256 * 512 + Math.round((512 + offset) / 2)) * 4;
        return [...raw.slice(index, index + 4)];
      };
      e.renderer.display();
      const gl = e.renderer.gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const shown = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, shown);
      const shownAt = (offset: number) => {
        const x = Math.round(w / 2 + offset / 1024 * w), y = Math.round(h / 2);
        const index = (y * w + x) * 4;
        return [...shown.slice(index, index + 4)];
      };
      return {
        center: rawAt(0), mid: rawAt(120), edge: rawAt(150),
        displayCenter: shownAt(0), displayMid: shownAt(120), displayEdge: shownAt(150), error: gl.getError(),
      };
    };
    return { off: measure(0), on: measure(1) };
  });

  expect(result.off.center).toEqual([240, 32, 69, 255]);
  expect(result.off.mid).toEqual([240, 32, 69, 255]);
  expect(result.off.edge).toEqual([240, 32, 69, 255]);
  expect(result.off.displayEdge.slice(0, 3)).toEqual([240, 32, 69]);

  expect(result.on.center).toEqual([240, 32, 69, 255]);
  expect(result.on.mid.slice(0, 3)).toEqual([240, 32, 69]);
  expect(result.on.edge.slice(0, 3)).toEqual([240, 32, 69]);
  expect(result.on.mid[3]).toBeLessThan(240);
  expect(result.on.edge[3]).toBeLessThan(80);
  expect(result.on.displayCenter.slice(0, 3)).toEqual([240, 32, 69]);
  expect(result.on.displayMid[2]).toBeGreaterThan(result.on.displayCenter[2]);
  expect(result.on.displayEdge[2]).toBeGreaterThan(170);
  expect(result.on.displayEdge[0]).toBeLessThan(110);
  expect(result.on.error).toBe(0);
});

test('the water fade option is optional and PNG export keeps the background opaque', async ({ page }) => {
  await page.goto('./?resolution=512');
  await page.waitForFunction(() => !!window.__lab);
  await page.getByLabel('滴の半径', { exact: true }).fill('160');
  await page.getByLabel('広がり時間', { exact: true }).fill('0');
  const checkbox = page.getByLabel('外側を水で薄める');
  await expect(checkbox).not.toBeChecked();
  await checkbox.check();
  await expect(page.getByRole('slider', { name: '薄まりの強さ' })).toBeVisible();
  await page.getByRole('slider', { name: '薄まりの強さ' }).fill('1');

  const box = (await page.locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => window.__lab!.status.operations === 1 && !window.__lab!.status.isAnimating);

  const raw = await page.evaluate(() => {
    const data = window.__lab!.renderer.pixels();
    const at = (offset: number) => {
      const index = (256 * 512 + Math.round((512 + offset) / 2)) * 4;
      return [...data.slice(index, index + 4)];
    };
    return { center: at(0), edge: at(150) };
  });
  expect(raw.center).toEqual([105, 41, 232, 255]);
  expect(raw.edge.slice(0, 3)).toEqual([105, 41, 232]);
  expect(raw.edge[3]).toBeLessThan(80);
  await page.screenshot({ path: 'docs/water-fade.png', fullPage: true });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG保存', exact: true }).click();
  const download = await downloadPromise;
  const bytes = await readFile((await download.path())!);
  const png = await page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const at = (offset: number) => {
      const index = (256 * 512 + Math.round((512 + offset) / 2)) * 4;
      return [...data.slice(index, index + 4)];
    };
    return { size: canvas.width, center: at(0), edge: at(150) };
  }, bytes.toString('base64'));

  expect(png.size).toBe(512);
  expect(png.center).toEqual([105, 41, 232, 255]);
  expect(png.edge[3]).toBe(255);
  expect(png.edge[0]).toBeLessThan(110);
  expect(png.edge[2]).toBeGreaterThan(170);
});

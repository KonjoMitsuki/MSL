import { openSettings } from './editorHelpers';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('./');
  await page.waitForFunction(() => !!window.__lab);
}

test('M1 GPU: AT-01, 02, 04, 07 and exact palette', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const e = window.__lab!;
    const blue = '#278BEC', purple = '#6929E8', red = '#F02045';
    function drop(x: number, y: number, radius: number, color: string, durationMs = 0) {
      e.enqueue({ type: 'drop', id: crypto.randomUUID(), center: { x, y }, radius, color, durationMs });
    }
    const pixel = (data: Uint8Array, x: number, y: number) => [...data.slice((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 3)];
    const equal = (a: Uint8Array, b: Uint8Array) => a.every((v, i) => v === b[i]);
    e.reset(blue);
    drop(512, 512, 60, purple);
    const first = e.renderer.pixels();
    drop(512, 512, 80, red);
    const second = e.renderer.pixels();
    e.reset(blue);
    drop(420, 512, 130, purple);
    drop(690, 512, 80, red);
    const instant = e.renderer.pixels();
    e.reset(blue);
    drop(420, 512, 130, purple, 80);
    drop(690, 512, 80, red, 160);
    await e.whenIdle();
    const animated = e.renderer.pixels();
    e.reset(blue);
    drop(690, 512, 80, red);
    drop(420, 512, 130, purple);
    const reversed = e.renderer.pixels();
    const palette = new Set<string>();
    for (let i = 0; i < animated.length; i += 4) palette.add([...animated.slice(i, i + 3)].join(','));
    return {
      at01: [pixel(first, 512, 512), pixel(first, 571, 512), pixel(first, 573, 512)],
      at02: [pixel(second, 591, 512), pixel(second, 602, 512), pixel(second, 613, 512)],
      at04: !equal(instant, reversed),
      at07: equal(instant, animated),
      palette: [...palette].sort(),
      error: e.renderer.gl.getError(),
    };
  });
  expect(result.at01).toEqual([[105, 41, 232], [105, 41, 232], [39, 139, 236]]);
  expect(result.at02).toEqual([[240, 32, 69], [105, 41, 232], [39, 139, 236]]);
  expect(result.at04).toBe(true);
  expect(result.at07).toBe(true);
  expect(result.palette).toEqual(['105,41,232', '240,32,69', '39,139,236']);
  expect(result.error).toBe(0);
});

test('AT-03 fixed scenario: continuous blue and displaced purple, with visual evidence', async ({ page }) => {
  await ready(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'AT-03 デモを再生' }).click();
  await expect(page.getByText('AT-03：赤の左に青', { exact: false })).toBeVisible();
  const result = await page.evaluate(() => {
    const data = window.__lab!.renderer.pixels();
    const at = (x: number, y = 512) => [...data.slice((y * 1024 + x) * 4, (y * 1024 + x) * 4 + 3)].join(',');
    // Original purple right edge is x=550. Mapped edge is 690-sqrt(140²+80²)=528.75.
    // An overlay would keep purple at x=540, and fails this assertion.
    const band: string[] = [];
    for (let x = 531; x <= 607; x++) band.push(at(x));
    return { purple: at(500), displaced: at(540), red: at(690), blueBand: [...new Set(band)] };
  });
  expect(result).toEqual({ purple: '105,41,232', displaced: '39,139,236', red: '240,32,69', blueBand: ['39,139,236'] });
  await page.screenshot({ path: 'docs/at-03-desktop.png', fullPage: true });
  await page.locator('canvas').screenshot({ path: 'docs/at-03-surface.png' });
  const additionalRed = await page.evaluate(() => {
    const e = window.__lab!;
    e.enqueue({ type: 'drop', id: 'more-red', center: { x: 690, y: 512 }, radius: 80, color: '#F02045', durationMs: 0 });
    const data = e.renderer.pixels();
    return [...data.slice((512 * 1024 + 520) * 4, (512 * 1024 + 520) * 4 + 3)];
  });
  // Purple's edge moves farther left (~510px); this pixel was still purple after two drops.
  expect(additionalRed).toEqual([39, 139, 236]);
});

test('drop queue is bounded at ten and snapshots input settings', async ({ page }) => {
  await ready(page);
  const result = await page.evaluate(async () => {
    const e = window.__lab!;
    const op = { type: 'drop' as const, id: 'queue', center: { x: 512, y: 512 }, radius: 10, color: '#F02045', durationMs: 30 };
    e.enqueue({ ...op, durationMs: 150 });
    const accepted = Array.from({ length: 11 }, () => e.enqueue(op));
    op.color = '#ffffff';
    await e.whenIdle();
    return { accepted, count: e.status.operations, center: [...e.renderer.pixels().slice((512 * 1024 + 512) * 4, (512 * 1024 + 512) * 4 + 3)] };
  });
  expect(result.accepted).toEqual([...Array(10).fill(true), false]);
  expect(result.count).toBe(11);
  expect(result.center).toEqual([240, 32, 69]);
});

import type { Page } from '@playwright/test';

export const openSettings = (page: Page) => page.getByRole('button', { name: '詳細設定', exact: true }).click();
export const openColors = (page: Page) => page.getByRole('button', { name: 'カラーを選択', exact: true }).click();
export const openExport = (page: Page) => page.getByRole('button', { name: '作品を書き出す', exact: true }).click();
export const closeSheet = (page: Page) => page.getByRole('dialog').getByRole('button', { name: '閉じる', exact: true }).click();

export async function setSpreadDuration(page: Page, value = '0') {
  await openSettings(page);
  await page.getByLabel('広がり時間', { exact: true }).fill(value);
  await closeSheet(page);
}

export async function photoPreviewPng(page: Page): Promise<Buffer> {
  const preview = page.getByRole('img', { name: '保存する作品のPNG画像' });
  await preview.waitFor({ state: 'visible' });
  const bytes = await preview.evaluate(async (node) => [...new Uint8Array(
    await (await fetch((node as HTMLImageElement).src)).arrayBuffer(),
  )]);
  return Buffer.from(bytes);
}

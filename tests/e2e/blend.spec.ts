import type { Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** Pictures blended into a light surface must not vanish once the surface is dark. */

async function pixel(page: Page, x: number, y: number): Promise<number[]> {
  const png = PNG.sync.read(await page.screenshot({ clip: { x, y, width: 1, height: 1 } }));
  return [...png.data.subarray(0, 3)];
}

const blend = (page: Page, selector: string) =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)!).mixBlendMode, selector);

test('product photos blended into a light card stay visible', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('blend'));
  await expect.poll(() => sombreState(page)).toBe('on');

  expect(await blend(page, '.img-transparent img')).toBe('normal');
  const box = (await page.locator('.img-transparent img').boundingBox())!;
  // The product (red) and the photo's own white background, not the card's dark color.
  const [r, g, b] = await pixel(page, box.x + box.width / 2, box.y + box.height / 2);
  expect(r).toBeGreaterThan(180);
  expect(g! + b!).toBeLessThan(200);
  expect(Math.min(...(await pixel(page, box.x + 5, box.y + 5)))).toBeGreaterThan(240);

  // Blends that are not on a picture are the page's design.
  expect(await blend(page, '.tint')).toBe('multiply');
});

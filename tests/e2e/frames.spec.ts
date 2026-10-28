import type { Frame, Page } from '@playwright/test';
import { PNG } from 'pngjs';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** Embedded documents: a transparent frame must stay transparent, whether Sombre themes its parent or not. */

const overlay = (page: Page) => page.frame({ url: /overlay-frame\.html$/ })!;

const frameReady = (frame: Frame) => frame.evaluate(() => document.documentElement.hasAttribute('data-sombre-ready'));

const rootScheme = (frame: Frame) => frame.evaluate(() => getComputedStyle(document.documentElement).colorScheme);

/** The pixel at the middle of the player, below the overlay's badge. */
async function playerPixel(page: Page): Promise<number[]> {
  const box = (await page.locator('.player').boundingBox())!;
  const png = PNG.sync.read(
    await page.screenshot({ clip: { x: box.x + box.width / 2, y: box.y + box.height / 2, width: 1, height: 1 } }),
  );
  return [...png.data.subarray(0, 3)];
}

/** Largest channel difference at the player's middle with and without the overlay frame. */
async function overlayDifference(page: Page): Promise<number> {
  const iframe = page.locator('.player iframe');
  const through = await playerPixel(page);
  await iframe.evaluate((el) => (el.style.visibility = 'hidden'));
  const below = await playerPixel(page);
  await iframe.evaluate((el) => (el.style.visibility = ''));
  return Math.max(...through.map((channel, i) => Math.abs(channel - below[i]!)));
}

// Polled: a toggle cross-fades the page for a moment.
const expectSeeThrough = (page: Page) => expect.poll(() => overlayDifference(page)).toBeLessThanOrEqual(2);

test('a transparent overlay frame stays see-through', async ({ context, pressShortcut }) => {
  const page = await context.newPage();
  await page.goto(fixture('video-overlay'));
  await expect.poll(() => sombreState(page)).toBe('on');
  await expect.poll(() => frameReady(overlay(page))).toBe(true);
  await expectSeeThrough(page);

  // Sombre left off on the page (as on a site with its own dark theme) but on in the frame:
  // the frame takes its parent's light scheme, or the browser paints its canvas opaque.
  await pressShortcut();
  await expect.poll(() => sombreState(page)).toBe('off');
  await expect.poll(() => rootScheme(overlay(page))).toBe('light');
  await expectSeeThrough(page);
});

test('a light frame is still darkened', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('iframe'));
  const frame = page.frame({ url: /cdn\.sombre-assets\.dev\/frame-content\.html$/ })!;
  await expect.poll(() => frameReady(frame)).toBe(true);
  const background = await frame.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(rgbToOklch(parseColor(background)!).l).toBeLessThan(0.4);
});

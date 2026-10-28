import { PNG } from 'pngjs';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** The page canvas: Sombre must not change which box paints it. */

test('photos behind their card stay above the page background', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('negative-z'));
  await expect.poll(() => sombreState(page)).toBe('on');

  // The page colors <body> only: its (dark) color goes to the canvas and the root stays unpainted.
  const { root, body } = await page.evaluate(() => ({
    root: getComputedStyle(document.documentElement).backgroundColor,
    body: getComputedStyle(document.body).backgroundColor,
  }));
  expect(parseColor(root)!.a).toBe(0);
  expect(rgbToOklch(parseColor(body)!).l).toBeLessThan(0.4);

  // The photo (a red image at z-index -1) shows, not <body>'s box painted over it.
  const box = (await page.locator('.deal').boundingBox())!;
  const png = PNG.sync.read(
    await page.screenshot({ clip: { x: box.x + box.width - 10, y: box.y + box.height - 10, width: 1, height: 1 } }),
  );
  const [r, g, b] = png.data;
  expect(r).toBeGreaterThan(180);
  expect(g! + b!).toBeLessThan(200);
});

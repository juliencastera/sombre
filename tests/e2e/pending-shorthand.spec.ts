import { expect, fixture, sombreState, test } from './fixtures.ts';

/** A `var()` background shorthand split by a later longhand cannot be read in the CSSOM. */

test('a gradient written with var() and a later longhand is darkened', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('pending-shorthand'));
  await expect.poll(() => sombreState(page)).toBe('on');
  const gradient = await page.evaluate(() => getComputedStyle(document.querySelector('.sidebar')!, '::after').backgroundImage);
  expect(gradient).toContain('linear-gradient');
  expect(gradient).not.toContain('255, 255, 255');
});

import type { Page } from '@playwright/test';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** Colors that are the content: vivid bars and buttons, and icons drawn in their element's color. */

const style = (page: Page, selector: string) =>
  page.evaluate((s) => {
    const { color, fill, backgroundColor } = getComputedStyle(document.querySelector(s)!);
    return { color, fill, backgroundColor };
  }, selector);

const oklch = (value: string) => rgbToOklch(parseColor(value)!);

test('vivid bars keep their color and icons follow their color', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('accents'));
  await expect.poll(() => sombreState(page)).toBe('on');

  for (const accord of ['.accord:nth-child(1)', '.accord:nth-child(2)']) {
    const background = oklch((await style(page, accord)).backgroundColor);
    expect(background.c).toBeGreaterThan(0.12);
    expect(background.l).toBeGreaterThan(0.45);
  }

  // fill="currentColor" draws with the element's (transformed) color, never a fixed black or white.
  for (const icon of ['.heart', '.folder', '.code-icon']) {
    const { color, fill } = await style(page, icon);
    expect(fill).toBe(color);
  }
  expect(oklch((await style(page, '.heart')).color).c).toBeGreaterThan(0.08);

  // White text on the green button stays white: a contrast fix never makes it worse.
  expect(oklch((await style(page, '.label')).color).l).toBeGreaterThan(0.9);

  // A logo's own stylesheet: the brand color stays as drawn, its black ink turns light.
  expect((await style(page, '.logo-art .st1')).fill).toBe('rgb(0, 135, 205)');
  expect(oklch((await style(page, '.logo-art .st3')).fill).l).toBeGreaterThan(0.85);
  // With its own white-on-color backdrop, the black details sit on the logo: all colors stay.
  expect((await style(page, '.logo-badge .badge-ink')).fill).toBe('rgb(25, 25, 25)');
  expect((await style(page, '.logo-badge .badge-white')).fill).toBe('rgb(255, 255, 255)');
});

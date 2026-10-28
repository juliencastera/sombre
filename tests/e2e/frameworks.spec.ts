import type { Page } from '@playwright/test';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** CSS frameworks that route their colors through channel variables. */

const color = (page: Page, selector: string, property: 'color' | 'backgroundColor') =>
  page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s!)!)[p as 'color'], [selector, property]);

const oklch = (value: string) => rgbToOklch(parseColor(value)!);

test('Bootstrap utilities with comma-separated channels are darkened', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('bootstrap'));
  await expect.poll(() => sombreState(page)).toBe('on');

  expect(oklch(await color(page, 'header', 'backgroundColor')).l).toBeLessThan(0.3);
  expect(oklch(await color(page, 'nav', 'backgroundColor')).l).toBeLessThan(0.3);
  expect(oklch(await color(page, 'header .text-body', 'color')).l).toBeGreaterThan(0.8);
  // The brand color keeps its hue and stays vivid.
  const primary = oklch(await color(page, '.bg-primary', 'backgroundColor'));
  expect(primary.c).toBeGreaterThan(0.12);
  expect(primary.l).toBeGreaterThan(0.45);
});

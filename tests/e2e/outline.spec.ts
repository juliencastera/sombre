import type { Page } from '@playwright/test';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** A wide outline painted in the surface's color is part of the surface, not a focus ring. */

const style = (page: Page, selector: string, property: 'outlineColor' | 'backgroundColor') =>
  page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s!)!)[p as 'outlineColor'], [selector, property]);

const lightness = (value: string) => rgbToOklch(parseColor(value)!).l;

test('wide outlines that mask chat bubble corners follow the surface', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('outline'));
  await expect.poll(() => sombreState(page)).toBe('on');

  const thread = await style(page, '.thread', 'backgroundColor');
  expect(lightness(thread)).toBeLessThan(0.3);
  expect(await style(page, '.via-variable', 'outlineColor')).toBe(thread);
  expect(await style(page, '.plain', 'outlineColor')).toBe(thread);
  // A thin focus ring stays light on the dark page.
  expect(lightness(await style(page, '.ring', 'outlineColor'))).toBeGreaterThan(0.8);
});

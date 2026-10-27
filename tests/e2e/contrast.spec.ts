import type { Page } from '@playwright/test';
import { apcaContrast } from '../../src/shared/color/apca.ts';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** Small text readability on a Gmail-like inbox (14px rows, grey snippets, tinted read rows). */

const computed = (page: Page, selector: string, property: 'color' | 'backgroundColor') =>
  page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s!)!)[p as 'color'], [selector, property]);

const lc = async (page: Page, text: string, row: string) =>
  Math.abs(
    apcaContrast(parseColor(await computed(page, text, 'color'))!, parseColor(await computed(page, row, 'backgroundColor'))!),
  );

test('a mail list stays readable at the Soft level', async ({ context, openPopup, settings }) => {
  const page = await context.newPage();
  await page.goto(fixture('mail-list'));
  await expect.poll(() => sombreState(page)).toBe('on');
  const popup = await openPopup(page);
  await popup.getByRole('radio', { name: 'Soft' }).click();
  await expect.poll(async () => (await settings()).contrast).toBe('soft');
  await page.bringToFront();

  // Soft targets Lc 60 for 16px text, 65 for 14px.
  await expect.poll(() => lc(page, '.read .snippet', '.read')).toBeGreaterThanOrEqual(65);
  await expect.poll(() => lc(page, '.unread .snippet', '.unread')).toBeGreaterThanOrEqual(65);
  // Titles stay clearly above snippets.
  expect(await lc(page, '.read .subject', '.read')).toBeGreaterThan((await lc(page, '.read .snippet', '.read')) + 5);
  // Read and unread rows remain distinguishable.
  const lightness = async (row: string) => rgbToOklch(parseColor(await computed(page, row, 'backgroundColor'))!).l;
  expect((await lightness('.read')) - (await lightness('.unread'))).toBeGreaterThan(0.02);
});

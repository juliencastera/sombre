import type { Page } from '@playwright/test';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** Dark icons on transparent backgrounds are inverted, as in Dark Reader; pictures are left alone. */

const backgroundImage = (page: Page, selector: string, pseudo: string | null = null) =>
  page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s!)!, p).backgroundImage, [selector, pseudo]);

test('dark icons get an inverted copy, light pictures stay', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('icons'));
  await expect.poll(() => sombreState(page)).toBe('on');

  // Cross-origin SVG on a pseudo-element: fetched by the background, stays vector.
  await expect.poll(() => backgroundImage(page, '.compose', '::before')).toContain('data:image/svg+xml');
  await expect.poll(() => backgroundImage(page, '.mail')).toContain('data:image/png');
  // Analyzed as well, but light and opaque: the original URL.
  await page.waitForTimeout(300);
  expect(await backgroundImage(page, '.photo')).toMatch(/^url\("https:\/\/sombre-bench\.dev\/icons\/photo\.svg"\)$/);
});

test('a mask-image icon is drawn in a light ink', async ({ context }) => {
  const page = await context.newPage();
  await page.goto(fixture('icons'));
  await expect.poll(() => sombreState(page)).toBe('on');
  const ink = await page.evaluate(() => getComputedStyle(document.querySelector('.masked')!).backgroundColor);
  expect(rgbToOklch(parseColor(ink)!).l).toBeGreaterThan(0.7);
});

test('icon analyses are cached with the site', async ({ context, worker }) => {
  const page = await context.newPage();
  await page.goto(fixture('icons'));
  // Inverted icons and "keep" verdicts both, so a second visit analyzes nothing.
  const icons = () =>
    worker.evaluate(async () => {
      const entry = (await chrome.storage.local.get('sombre:cache:sombre-bench.dev'))['sombre:cache:sombre-bench.dev'];
      return Object.entries<string>(entry?.sheets ?? {})
        .filter(([key]) => key.startsWith('icon:'))
        .map(([, result]) => (result.startsWith('data:') ? result.slice(0, 14) : result))
        .sort();
    });
  await expect.poll(icons).toEqual(['-', 'data:image/png', 'data:image/svg']);
});

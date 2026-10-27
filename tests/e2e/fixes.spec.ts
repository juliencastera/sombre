import { statSync } from 'node:fs';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { PATHS } from '../../bench/config.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** Spec §8 flows: element picker, shared signed list, fixes in the options page. */

const background = (page: Page, selector: string) =>
  page.evaluate((s) => getComputedStyle(document.querySelector(s)!).backgroundColor, selector);

/** Popup → "Fix an element" → click the element → pick the action: the three clicks of spec §12. */
async function pickFix(page: Page, openPopup: (page: Page) => Promise<Page>, selector: string, action: string) {
  const popup = await openPopup(page);
  await popup.getByRole('button', { name: 'Fix an element' }).click();
  await page.bringToFront();
  await expect(page.locator('sombre-picker')).toBeAttached();
  const box = (await page.locator(selector).first().boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.locator('sombre-picker').getByRole('button', { name: action }).click();
  await expect(page.locator('sombre-picker')).not.toBeAttached();
}

test('"Keep original" leaves an element as the site designed it', async ({ context, openPopup, worker }) => {
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  await expect.poll(() => sombreState(page)).toBe('on');
  expect(await background(page, 'blockquote')).not.toBe('rgb(250, 250, 250)');

  await pickFix(page, openPopup, 'blockquote', 'Keep original');
  await expect.poll(() => background(page, 'blockquote')).toBe('rgb(250, 250, 250)');
  // The rest of the page stays dark.
  expect(await background(page, 'pre')).not.toBe('rgb(246, 248, 250)');
  const stored = await worker.evaluate(async () => (await chrome.storage.local.get('sombre:fixes'))['sombre:fixes']);
  const [fix] = stored['sombre-bench.dev'];
  expect(fix.action).toBe('ignore');
  expect(await page.evaluate((s) => document.querySelector(s)?.localName, fix.selector)).toBe('blockquote');
});

test('"Invert" and "Force dark" apply at once', async ({ context, openPopup }) => {
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  await expect.poll(() => sombreState(page)).toBe('on');

  await pickFix(page, openPopup, 'h1', 'Invert');
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector('h1')!).filter)).toBe(
    'invert(1) hue-rotate(180deg)',
  );

  await pickFix(page, openPopup, 'pre', 'Force dark');
  await expect.poll(() => background(page, 'pre')).toBe('rgb(22, 22, 22)');
});

test('a fix can target an icon drawn by a pseudo-element', async ({ context, worker }) => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ 'sombre:fixes': { 'sombre-bench.dev': [{ selector: 'h1::before', action: 'invert' }] } });
  });
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  const filter = (pseudo: string | null) =>
    page.evaluate((p) => getComputedStyle(document.querySelector('h1')!, p).filter, pseudo);
  await expect.poll(() => filter('::before')).toBe('invert(1) hue-rotate(180deg)');
  // The element itself, text and background, is left alone.
  expect(await filter(null)).toBe('none');
});

test('the shared list applies, unless turned off', async ({ context, worker, openOptions }) => {
  // Installed with the bundled, signed list.
  await expect
    .poll(() => worker.evaluate(async () => (await chrome.storage.local.get('sombre:shared-fixes'))['sombre:shared-fixes']?.version))
    .toBeGreaterThanOrEqual(1);
  await worker.evaluate(async () => {
    const list = { version: 999, sites: { 'sombre-bench.dev': [{ selector: '.muted', action: 'set-color', property: 'color', value: '#ff0000' }] } };
    await chrome.storage.local.set({ 'sombre:shared-fixes': list });
  });
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  const muted = () => page.evaluate(() => getComputedStyle(document.querySelector('.muted')!).color);
  await expect.poll(muted).toBe('rgb(255, 0, 0)');

  const options = await openOptions();
  await options.getByRole('checkbox', { name: 'Use shared fixes' }).uncheck();
  await expect.poll(muted).not.toBe('rgb(255, 0, 0)');
});

test('the options page lists, exports, imports and removes fixes', async ({ openOptions, worker }) => {
  await worker.evaluate(async () => {
    await chrome.storage.local.set({ 'sombre:fixes': { 'a.example': [{ selector: '.logo', action: 'invert' }] } });
  });
  const options = await openOptions();
  const list = options.getByTestId('fixes');
  await expect(list).toContainText('a.example');
  await expect(list).toContainText('.logo');
  await expect(list).toContainText('Invert');

  const download = options.waitForEvent('download');
  await options.getByRole('button', { name: 'Export' }).click();
  expect((await download).suggestedFilename()).toBe('sombre-fixes.json');

  await options.locator('input[type=file]').setInputFiles({
    name: 'fixes.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ version: 1, sites: { 'b.example': [{ selector: '#ad', action: 'force-dark' }] } })),
  });
  await expect(options.getByRole('status')).toHaveText('Imported 1 fixes.');
  await expect(list).toContainText('b.example');

  await options.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":1}') });
  await expect(options.getByRole('status')).toHaveText('This file is not a valid fix list.');

  await list.getByRole('listitem').filter({ hasText: 'a.example' }).getByRole('button', { name: 'Remove' }).click();
  await expect(list).not.toContainText('a.example');
});

test('the engine content script stays within its size budget', () => {
  expect(statSync(path.join(PATHS.sombre, 'sombre.js')).size).toBeLessThan(37 * 1024);
});

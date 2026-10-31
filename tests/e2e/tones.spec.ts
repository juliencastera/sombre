import type { Page, Worker } from '@playwright/test';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
import { expect, fixture, sombreState, test } from './fixtures.ts';

/** The tone of dark surfaces: neutral, true black, gray or sepia (options page). */

const pageColor = (page: Page) =>
  page.evaluate(() => {
    const body = getComputedStyle(document.body).backgroundColor;
    return body === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.documentElement).backgroundColor : body;
  });

const setTone = (worker: Worker, tone: string) =>
  worker.evaluate(async (tone) => {
    const { 'sombre:settings': settings } = await chrome.storage.local.get('sombre:settings');
    await chrome.storage.local.set({ 'sombre:settings': { ...settings, tone } });
  }, tone);

const registeredCss = (worker: Worker) =>
  worker.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).flatMap((script) => script.css ?? []));

test('pictures are dimmed when the option is on', async ({ context, openOptions }) => {
  const page = await context.newPage();
  await page.goto(fixture('blend'));
  await expect.poll(() => sombreState(page)).toBe('on');
  const filter = () => page.evaluate(() => getComputedStyle(document.querySelector('img')!).filter);
  expect(await filter()).toBe('none');

  const options = await openOptions();
  await options.getByRole('checkbox', { name: 'Dim images' }).check();
  await expect.poll(filter).toBe('brightness(0.8)');
  await options.getByRole('checkbox', { name: 'Dim images' }).uncheck();
  await expect.poll(filter).toBe('none');
});

test('surfaces follow the chosen tone, from the base layer on', async ({ context, worker, openOptions }) => {
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  await expect.poll(() => sombreState(page)).toBe('on');
  expect(await pageColor(page)).toBe('rgb(22, 22, 22)');

  const options = await openOptions();
  await options.getByRole('radiogroup', { name: 'Background' }).getByRole('radio', { name: 'Black' }).click();
  await expect.poll(() => pageColor(page)).toBe('rgb(0, 0, 0)');
  await expect.poll(() => registeredCss(worker)).toEqual(['base/black-auto.css']);
  // Text stays light and readable on black.
  const text = await page.evaluate(() => getComputedStyle(document.querySelector('p')!).color);
  expect(rgbToOklch(parseColor(text)!).l).toBeGreaterThan(0.8);

  await setTone(worker, 'sepia');
  await expect.poll(() => pageColor(page)).not.toBe('rgb(0, 0, 0)');
  const sepia = rgbToOklch(parseColor(await pageColor(page))!);
  expect(sepia.c).toBeGreaterThan(0.01);
  expect(sepia.h).toBeGreaterThan(40);
  expect(sepia.h).toBeLessThan(100);
  await page.reload();
  await expect.poll(() => sombreState(page)).toBe('on');
  expect(rgbToOklch(parseColor(await pageColor(page))!).h).toBeCloseTo(sepia.h, 0);
});

test('pictures the site marks to invert in dark mode are inverted, dimmed or not', async ({ context, openOptions }) => {
  const page = await context.newPage();
  await page.goto(fixture('wiki-math'));
  await expect.poll(() => sombreState(page)).toBe('on');
  const filter = (selector: string) => page.evaluate((s) => getComputedStyle(document.querySelector(s)!).filter, selector);
  await expect.poll(() => filter('.skin-invert')).toBe('invert(1) hue-rotate(180deg)');
  expect(await filter('.photo')).toBe('none');

  const options = await openOptions();
  await options.getByRole('checkbox', { name: 'Dim images' }).check();
  await expect.poll(() => filter('.photo')).toBe('brightness(0.8)');
  expect(await filter('.skin-invert')).toBe('invert(1) hue-rotate(180deg)');
});

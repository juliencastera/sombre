import { expect, fixture, sombreState, test } from './fixtures.ts';

/** Spec §7 flows: activation model, popup, options page, shortcut, languages. */

test('the popup explains the state and turns the site off and back on', async ({ context, openPopup, settings }) => {
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  await expect.poll(() => sombreState(page)).toBe('on');

  const popup = await openPopup(page);
  await expect(popup.locator('h1')).toHaveText('sombre-bench.dev');
  await expect(popup.getByTestId('status')).toHaveText('Dark — global default (Auto, system is dark)');

  await popup.getByRole('radio', { name: 'Never' }).click();
  await expect.poll(() => sombreState(page)).toBe('off');
  await expect(popup.getByTestId('status')).toHaveText('Light — never on this site');
  expect((await settings()).sites).toEqual({ 'sombre-bench.dev': 'never' });

  await popup.getByRole('radio', { name: 'Default' }).click();
  await expect.poll(() => sombreState(page)).toBe('on');
  expect((await settings()).sites).toEqual({});
});

test('a Dark exception wins over a Light global default', async ({ context, openPopup }) => {
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  const popup = await openPopup(page);

  await popup.getByRole('combobox').selectOption('light');
  await expect.poll(() => sombreState(page)).toBe('off');
  await expect(popup.getByTestId('status')).toHaveText('Light — global default');

  await popup.getByRole('radio', { name: 'Dark' }).click();
  await expect.poll(() => sombreState(page)).toBe('on');
  await expect(popup.getByTestId('status')).toHaveText('Dark — always on this site');
});

test('the contrast level is saved and applied to the page', async ({ context, openPopup, settings }) => {
  const page = await context.newPage();
  await page.goto(fixture('low-contrast'));
  await expect.poll(() => sombreState(page)).toBe('on');
  const textLightness = () =>
    page.evaluate(() => {
      const [r, g, b] = getComputedStyle(document.querySelector('.thin')!).color.match(/\d+/g)!.map(Number);
      return (r! + g! + b!) / 3;
    });
  const before = await textLightness();

  const popup = await openPopup(page);
  await popup.getByRole('radio', { name: 'High' }).click();
  await expect.poll(async () => (await settings()).contrast).toBe('high');
  await expect.poll(textLightness).toBeGreaterThan(before);
});

test('a native dark site is recognized and can be switched to the engine', async ({ context, openPopup }) => {
  const page = await context.newPage();
  await page.goto(fixture('native-dark'));
  await expect.poll(() => sombreState(page)).toBe('on');

  const popup = await openPopup(page);
  await expect(popup.getByTestId('status')).toHaveText("Dark — the site's own dark theme");
  await popup.getByRole('button', { name: "Use Sombre's engine instead" }).click();
  await expect(popup.getByTestId('status')).toHaveText('Dark — always on this site');
  await expect(popup.getByText("Sombre's engine is used instead of the site's own dark theme.")).toBeVisible();
});

test('the popup says when a page cannot be themed', async ({ context, openPopup }) => {
  const page = await context.newPage();
  await page.goto('chrome://version');
  const popup = await openPopup(page);
  await expect(popup.getByText('Not available on this page')).toBeVisible();
  // Global settings stay reachable.
  await expect(popup.getByRole('radio', { name: 'Standard' })).toBeVisible();
});

test('the shortcut toggles the current site, then back', async ({ context, settings, pressShortcut }) => {
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  await expect.poll(() => sombreState(page)).toBe('on');

  await pressShortcut();
  await expect.poll(() => sombreState(page)).toBe('off');
  await expect.poll(async () => (await settings()).sites).toEqual({ 'sombre-bench.dev': 'never' });

  await pressShortcut();
  await expect.poll(() => sombreState(page)).toBe('on');
  await expect.poll(async () => (await settings()).sites).toEqual({});
});

test('the options page lists exceptions and removes them', async ({ context, openPopup, openOptions }) => {
  const page = await context.newPage();
  await page.goto(fixture('basic'));
  const popup = await openPopup(page);
  await popup.getByRole('radio', { name: 'Never' }).click();
  await expect.poll(() => sombreState(page)).toBe('off');

  const options = await openOptions();
  const list = options.getByTestId('site-exceptions');
  await expect(list).toContainText('sombre-bench.dev');
  await list.getByRole('button', { name: 'Remove' }).click();
  await expect(options.getByText('No exceptions yet.')).toBeVisible();
  await expect.poll(() => sombreState(page)).toBe('on');
});

test('the options page changes global settings', async ({ openOptions, settings }) => {
  const options = await openOptions();
  await options.getByRole('radiogroup', { name: 'Default for all sites' }).getByRole('radio', { name: 'Light' }).click();
  await options.getByRole('radiogroup', { name: 'Contrast' }).getByRole('radio', { name: 'Soft' }).click();
  await expect.poll(settings).toMatchObject({ mode: 'light', contrast: 'soft' });
  await expect(options.getByTestId('shortcut')).toHaveText('Alt+Shift+D');
});

test('the welcome page explains the button, the shortcut and fixes', async ({ context, extensionId }) => {
  const welcome = await context.newPage();
  await welcome.goto(`chrome-extension://${extensionId}/welcome.html`);
  await expect(welcome.getByRole('heading', { level: 1 })).toHaveText('Sombre is ready');
  await expect(welcome.getByRole('listitem')).toHaveCount(3);
  await expect(welcome.getByText('Or press Alt+Shift+D to switch it.')).toBeVisible();
});

test.describe('in French', () => {
  test.use({ lang: 'fr' });

  test('the popup is translated', async ({ context, openPopup }) => {
    const page = await context.newPage();
    await page.goto(fixture('basic'));
    const popup = await openPopup(page);
    await expect(popup.getByTestId('status')).toHaveText('Sombre — réglage global (Auto, système sombre)');
    await expect(popup.getByRole('radio', { name: 'Jamais' })).toBeVisible();
    await expect(popup.getByRole('radio', { name: 'Élevé' })).toBeVisible();
  });
});

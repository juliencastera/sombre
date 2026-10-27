import { test as base, expect, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { launchContext } from '../../bench/browser.ts';
import { FIXTURE_ORIGIN, PATHS } from '../../bench/config.ts';
import { startFixtureServers } from '../../bench/server.ts';

interface Fixtures {
  /** UI language of the browser (override per test with `test.use({ lang: 'fr' })`). */
  lang: string;
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  /** Open the popup for `page` (as a tab, pointed at `page`'s tab). */
  openPopup: (page: Page) => Promise<Page>;
  openOptions: () => Promise<Page>;
  /** The extension's stored settings. */
  settings: () => Promise<{ mode: string; sites: Record<string, string>; contrast: string }>;
  /** Simulate the keyboard shortcut on the active tab. */
  pressShortcut: () => Promise<void>;
}

export const fixture = (name: string) => `${FIXTURE_ORIGIN}/${name}.html`;

/** Sombre's state on the page's root element (`on` / `off`). */
export const sombreState = (page: Page) => page.evaluate(() => document.documentElement.getAttribute('data-sombre'));

export const test = base.extend<Fixtures, { servers: void }>({
  servers: [
    // eslint-disable-next-line no-empty-pattern -- Playwright fixtures must destructure their dependencies
    async ({}, use) => {
      const stop = await startFixtureServers();
      await use();
      await stop();
    },
    { scope: 'worker', auto: true },
  ],

  lang: ['en', { option: true }],

  context: async ({ lang }, use) => {
    const context = await launchContext({ extensionPath: PATHS.sombre, headed: false, scheme: 'dark', lang });
    await use(context);
    await context.close();
  },

  worker: async ({ context }, use) => {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    await worker.evaluate(async () => {
      for (let i = 0; i < 100 && !(await chrome.scripting.getRegisteredContentScripts()).length; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    });
    await use(worker);
  },

  extensionId: async ({ worker }, use) => use(new URL(worker.url()).host),

  openPopup: async ({ context, worker, extensionId }, use) => {
    await use(async (page) => {
      await page.bringToFront();
      const tabId = await worker.evaluate(
        async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]?.id,
      );
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html?tab=${tabId}`);
      return popup;
    });
  },

  openOptions: async ({ context, extensionId }, use) => {
    await use(async () => {
      const options = await context.newPage();
      await options.goto(`chrome-extension://${extensionId}/options.html`);
      return options;
    });
  },

  settings: async ({ worker }, use) => {
    await use(() => worker.evaluate(async () => (await chrome.storage.local.get('sombre:settings'))['sombre:settings']));
  },

  pressShortcut: async ({ worker }, use) => {
    await use(async () => {
      await worker.evaluate(async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        await chrome.tabs.sendMessage(tab!.id!, { type: 'sombre:toggle-site' }, { frameId: 0 });
      });
    });
  },
});

export { expect };

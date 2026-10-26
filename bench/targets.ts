import { access } from 'node:fs/promises';
import path from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { PATHS } from './config.ts';

/** Extension APIs used by functions evaluated inside extension pages and workers (not in Node). */
declare const chrome: {
  runtime: { sendMessage(message: unknown): Promise<{ data?: { isEnabled?: boolean } }> };
  scripting: { getRegisteredContentScripts(): Promise<unknown[]> };
  storage: { local: { get(key: string): Promise<Record<string, any>>; set(items: object): Promise<void> } };
};

export type TargetId = 'control' | 'darkreader' | 'sombre';

export interface TargetSession {
  /** Switch dark mode on/off for the site at `url`. Resolves with the epoch ms at which the command was sent. */
  toggle?: (enabled: boolean, url: string) => Promise<number>;
}

export interface Target {
  id: TargetId;
  label: string;
  /** Unpacked extension directory, absent for the control run. */
  extensionPath?: string;
  /** Returns a reason when the target cannot run (e.g. not built / not downloaded). */
  unavailableReason(): Promise<string | null>;
  /** Called once per fresh browser context, before the site page is opened. */
  prepare(context: BrowserContext): Promise<TargetSession>;
}

async function exists(file: string): Promise<boolean> {
  return access(file).then(
    () => true,
    () => false,
  );
}

async function extensionId(context: BrowserContext): Promise<string> {
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
  return new URL(worker.url()).host;
}

async function closePagesExcept(context: BrowserContext, keep: Page[]): Promise<void> {
  await Promise.all(context.pages().filter((page) => !keep.includes(page)).map((page) => page.close()));
}

const control: Target = {
  id: 'control',
  label: 'No extension',
  unavailableReason: async () => null,
  prepare: async () => ({}),
};

const darkReader: Target = {
  id: 'darkreader',
  label: 'Dark Reader',
  extensionPath: PATHS.darkReader,
  unavailableReason: async () =>
    (await exists(path.join(PATHS.darkReader, 'manifest.json'))) ? null : 'not downloaded, run `npm run bench:setup`',
  async prepare(context) {
    const id = await extensionId(context);
    // Dark Reader only accepts settings messages from its own UI pages, so we drive it
    // from its options page, kept open in a background tab.
    const options = await context.newPage();
    await options.goto(`chrome-extension://${id}/ui/options/index.html`);
    const isEnabled = await options.evaluate(async () => {
      const response = await chrome.runtime.sendMessage({ type: 'ui-bg-get-data' });
      return Boolean(response?.data?.isEnabled);
    });
    if (!isEnabled) throw new Error('Dark Reader did not start in enabled state');
    // Give the install-time help tab a moment to open, then close it.
    await new Promise((resolve) => setTimeout(resolve, 500));
    await closePagesExcept(context, [options]);
    return {
      toggle: (enabled) =>
        options.evaluate((value) => {
          const sentAt = Date.now();
          void chrome.runtime.sendMessage({ type: 'ui-bg-change-settings', data: { enabled: value } });
          return sentAt;
        }, enabled),
    };
  },
};

const sombre: Target = {
  id: 'sombre',
  label: 'Sombre',
  extensionPath: PATHS.sombre,
  unavailableReason: async () =>
    (await exists(path.join(PATHS.sombre, 'manifest.json'))) ? null : 'not built, run `npm run build`',
  async prepare(context) {
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    // The base layer is registered on install; pages loaded before that would miss it.
    await worker.evaluate(async () => {
      for (let i = 0; i < 100; i++) {
        if ((await chrome.scripting.getRegisteredContentScripts()).length) return;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      throw new Error('Sombre base layer never registered');
    });
    return {
      // Same path as the shortcut: "off" adds a never-exception, "on" removes it (back to the dark default).
      // Content scripts react to the storage change.
      toggle: (enabled, url) =>
        worker.evaluate(
          async ({ enabled, hostname }) => {
            const key = 'sombre:settings';
            const settings = (await chrome.storage.local.get(key))[key] ?? { mode: 'auto', sites: {} };
            const site = hostname.replace(/^www\./, '');
            if (enabled) delete settings.sites[site];
            else settings.sites[site] = 'never';
            const sentAt = Date.now();
            await chrome.storage.local.set({ [key]: settings });
            return sentAt;
          },
          { enabled, hostname: new URL(url).hostname },
        ),
    };
  },
};

export const TARGETS: Record<TargetId, Target> = { control, darkreader: darkReader, sombre };

export function selectTargets(filter: string): Target[] {
  return filter.split(',').map((id) => {
    const target = TARGETS[id.trim() as TargetId];
    if (!target) throw new Error(`Unknown target: ${id} (expected ${Object.keys(TARGETS).join(', ')})`);
    return target;
  });
}

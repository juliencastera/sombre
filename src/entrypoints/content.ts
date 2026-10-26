import { Engine } from '../engine/engine.ts';
import type { ContentRequest, PageState } from '../shared/messages.ts';
import {
  findSiteKey,
  NATIVE_KEY,
  normalizeSettings,
  resolveEffective,
  SETTINGS_KEY,
  siteKey,
  toggleSite,
  type Settings,
} from '../shared/settings.ts';

/** Hostname for this frame; about:blank / srcdoc frames inherit their parent's. */
function frameHostname(): string {
  if (location.hostname) return location.hostname;
  try {
    return window.parent.location.hostname;
  } catch {
    return '';
  }
}

async function recordNative(hostname: string, native: boolean): Promise<void> {
  const key = siteKey(hostname);
  const stored = ((await browser.storage.local.get(NATIVE_KEY))[NATIVE_KEY] ?? {}) as Record<string, number>;
  if (native === key in stored) return;
  if (native) stored[key] = Date.now();
  else delete stored[key];
  await browser.storage.local.set({ [NATIVE_KEY]: stored });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,

  async main() {
    const root = document.documentElement;
    if (!(document instanceof HTMLDocument) || !root) {
      // SVG/XML documents: the base layer must not flatten them.
      root?.setAttribute('data-sombre', 'off');
      return;
    }

    const isTop = window === window.top;
    const hostname = frameHostname();
    const osQuery = matchMedia('(prefers-color-scheme: dark)');
    const engine = new Engine(
      () => osQuery.matches,
      () => {
        if (isTop) void recordNative(hostname, true);
      },
    );

    let settings: Settings = normalizeSettings((await browser.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY]);

    const update = async (animate: boolean) => {
      const effective = resolveEffective(settings, hostname, osQuery.matches);
      await engine.setEnabled(effective.on, { animate, ignoreNative: effective.reason === 'site-dark' });
      // A site previously detected as native that no longer is must get the base layer back.
      if (isTop && effective.on && effective.reason !== 'site-dark' && !engine.native) {
        void recordNative(hostname, false);
      }
    };

    browser.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !(SETTINGS_KEY in changes)) return;
      settings = normalizeSettings(changes[SETTINGS_KEY]!.newValue);
      void update(true);
    });
    osQuery.addEventListener('change', () => void update(true));

    if (isTop) {
      browser.runtime.onMessage.addListener((message: ContentRequest, _sender, sendResponse) => {
        if (message.type === 'sombre:get-state') {
          const key = findSiteKey(Object.keys(settings.sites), hostname);
          const state: PageState = {
            hostname,
            effective: resolveEffective(settings, hostname, osQuery.matches),
            siteState: key ? settings.sites[key]! : null,
            native: engine.native,
          };
          sendResponse(state);
        } else if (message.type === 'sombre:toggle-site') {
          void browser.storage.local.set({ [SETTINGS_KEY]: toggleSite(settings, hostname, osQuery.matches) });
        }
      });
    }

    await update(false);
  },
});

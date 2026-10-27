import { Engine } from '../engine/engine.ts';
import type { ContentRequest, PageState } from '../shared/messages.ts';
import {
  findSiteKey,
  NATIVE_KEY,
  normalizeNative,
  normalizeSettings,
  resolveEffective,
  SETTINGS_KEY,
  siteKey,
  toggleSite,
  type NativeMarker,
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

async function recordNative(hostname: string, native: boolean, marker: NativeMarker | null = null): Promise<void> {
  const key = siteKey(hostname);
  const stored = normalizeNative((await browser.storage.local.get(NATIVE_KEY))[NATIVE_KEY]);
  const current = stored[key];
  if (!native && !current) return;
  if (native && current && JSON.stringify(current.marker ?? null) === JSON.stringify(marker)) return;
  if (native) stored[key] = { at: Date.now(), ...(marker && { marker }) };
  else delete stored[key];
  await browser.storage.local.set({ [NATIVE_KEY]: stored });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchOriginAsFallback: true,

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
      (marker) => {
        if (isTop) void recordNative(hostname, true, marker);
      },
    );

    const stored = await browser.storage.local.get([SETTINGS_KEY, NATIVE_KEY]);
    let settings: Settings = normalizeSettings(stored[SETTINGS_KEY]);
    engine.setContrast(settings.contrast);
    const remembered = normalizeNative(stored[NATIVE_KEY])[siteKey(hostname)]?.marker;
    if (remembered && resolveEffective(settings, hostname, osQuery.matches).on) engine.applyRememberedMarker(remembered);

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
      engine.setContrast(settings.contrast);
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

import { Engine } from '../engine/engine.ts';
import {
  CACHE_INDEX_KEY,
  CACHE_PREFIX,
  cacheVersion,
  mergeSheets,
  sheetsSize,
  type CacheEntry,
  type CacheIndex,
} from '../shared/cache.ts';
import { fixesFor, LOCAL_FIXES_KEY, SHARED_FIXES_KEY, type Fix, type FixList } from '../shared/fixes.ts';
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

/**
 * Fixes for this page: the user's first, then the shared list. Both are validated when
 * written (picker, import, background); selectors this browser rejects are dropped here.
 */
function pageFixes(
  hostname: string,
  local: Record<string, Fix[]> | undefined,
  shared: FixList | undefined,
  useShared: boolean,
): Fix[] {
  const fixes = [...fixesFor(local ?? {}, hostname), ...(useShared && shared ? fixesFor(shared.sites, hostname) : [])];
  return fixes.filter((fix) => {
    try {
      document.querySelector(fix.selector);
      return true;
    } catch {
      return false;
    }
  });
}

/** Merge this page's fetched-stylesheet mirrors into the site's cache entry. */
async function writeCache(
  key: string,
  version: string,
  sheets: Record<string, string>,
  previous: CacheEntry | undefined,
): Promise<void> {
  const merged = mergeSheets(previous?.version === version ? previous.sheets : undefined, sheets);
  if (!merged) return;
  const entry: CacheEntry = { version, sheets: merged, at: Date.now() };
  const index = ((await browser.storage.local.get(CACHE_INDEX_KEY))[CACHE_INDEX_KEY] ?? {}) as CacheIndex;
  index[key] = { at: entry.at, size: sheetsSize(merged) };
  await browser.storage.local.set({ [CACHE_PREFIX + key]: entry, [CACHE_INDEX_KEY]: index });
}

/**
 * The engine's content script. Built as an unlisted script and declared in the
 * manifest by wxt.config.ts (document_start, all frames): unlike a WXT content
 * script it carries no runtime wrapper, which keeps it small and quiet (WXT
 * announces content scripts to the page with events).
 */
export default defineUnlistedScript(async () => {
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

  const key = siteKey(hostname);
  const cacheKey = CACHE_PREFIX + key;
  const stored = await browser.storage.local.get([
    SETTINGS_KEY,
    NATIVE_KEY,
    LOCAL_FIXES_KEY,
    SHARED_FIXES_KEY,
    ...(isTop ? [cacheKey] : []),
  ]);
  let settings: Settings = normalizeSettings(stored[SETTINGS_KEY]);
  engine.setContrast(settings.contrast);
  let localFixes = stored[LOCAL_FIXES_KEY] as Record<string, Fix[]> | undefined;
  let sharedFixes = stored[SHARED_FIXES_KEY] as FixList | undefined;
  const applyFixes = () => engine.setFixes(pageFixes(hostname, localFixes, sharedFixes, settings.sharedFixes));
  applyFixes();
  const verdict = normalizeNative(stored[NATIVE_KEY])[key];
  const startsOn = resolveEffective(settings, hostname, osQuery.matches).on;
  if (verdict?.marker && startsOn) engine.applyRememberedMarker(verdict.marker);

  // Stale-while-revalidate: mirrors of known stylesheets without waiting for the network.
  const buildVersion = `${browser.runtime.getManifest().version}+${__SOMBRE_BUILD__}`;
  const cached = stored[cacheKey] as CacheEntry | undefined;
  if (cached?.version === cacheVersion(buildVersion, settings.contrast, Boolean(verdict))) {
    engine.seedCache(cached.sheets);
  }

  const update = async (animate: boolean) => {
    const effective = resolveEffective(settings, hostname, osQuery.matches);
    await engine.setEnabled(effective.on, { animate, ignoreNative: effective.reason === 'site-dark' });
    // A site previously detected as native that no longer is must get the base layer back.
    if (isTop && effective.on && effective.reason !== 'site-dark' && !engine.native) {
      void recordNative(hostname, false);
    }
  };

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (LOCAL_FIXES_KEY in changes) localFixes = changes[LOCAL_FIXES_KEY]!.newValue as Record<string, Fix[]> | undefined;
    if (SHARED_FIXES_KEY in changes) sharedFixes = changes[SHARED_FIXES_KEY]!.newValue as FixList | undefined;
    if (SETTINGS_KEY in changes) settings = normalizeSettings(changes[SETTINGS_KEY]!.newValue);
    if (LOCAL_FIXES_KEY in changes || SHARED_FIXES_KEY in changes || SETTINGS_KEY in changes) applyFixes();
    if (!(SETTINGS_KEY in changes)) return;
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
        // Apply right away; the storage change that follows finds nothing left to do.
        settings = toggleSite(settings, hostname, osQuery.matches);
        void update(true);
        void browser.storage.local.set({ [SETTINGS_KEY]: settings });
      }
    });
  }

  await update(false);

  if (isTop) {
    const save = () =>
      requestIdleCallback(
        () => {
          const sheets = engine.cachedSheets();
          const version = cacheVersion(buildVersion, settings.contrast, engine.native);
          if (Object.keys(sheets).length) void writeCache(key, version, sheets, cached);
        },
        { timeout: 5000 },
      );
    if (document.readyState === 'complete') save();
    else addEventListener('load', save, { once: true });
  }
});

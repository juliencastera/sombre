import { CACHE_INDEX_KEY, CACHE_PREFIX, evictions, type CacheIndex } from '../shared/cache.ts';
import { SHARED_FIXES_URL } from '../shared/config.ts';
import { FIXES_PUBLIC_KEY } from '../shared/fixes-key.ts';
import { SHARED_FIXES_KEY, verifyFixList, type FixList } from '../shared/fixes.ts';
import type { ContentRequest, FetchCssRequest, FetchImageRequest, FetchResponse } from '../shared/messages.ts';
import { NATIVE_KEY, normalizeSettings, SETTINGS_KEY, sitePatterns } from '../shared/settings.ts';

const BASE_ID = 'sombre-base';
const FORCED_ID = 'sombre-base-forced';
const MAX_CSS_BYTES = 8 * 1024 * 1024;
/** Icons are small; anything larger is a photo or a banner, never inverted. */
const MAX_IMAGE_BYTES = 512 * 1024;

/**
 * The base layer (public/base-*.css) is registered dynamically rather than in
 * the manifest so the browser injects it before first paint *only* where dark
 * mode applies: never-sites and sites with a native dark theme are excluded,
 * and "auto" mode uses a prefers-color-scheme media query. No async lookup
 * stands between navigation and the first dark frame.
 */
async function syncRegistrations(): Promise<void> {
  const stored = await browser.storage.local.get([SETTINGS_KEY, NATIVE_KEY]);
  const settings = normalizeSettings(stored[SETTINGS_KEY]);
  const native = Object.keys((stored[NATIVE_KEY] ?? {}) as Record<string, number>);

  const siteKeys = Object.keys(settings.sites);
  const forced = siteKeys.filter((key) => settings.sites[key] === 'dark');
  const excluded = [...new Set([...siteKeys, ...native])].flatMap(sitePatterns);

  const scripts: Parameters<typeof browser.scripting.registerContentScripts>[0] = [];
  const common = { runAt: 'document_start', allFrames: true, matchOriginAsFallback: true, persistAcrossSessions: true } as const;
  if (settings.mode !== 'light') {
    scripts.push({
      ...common,
      id: BASE_ID,
      css: [settings.mode === 'dark' ? 'base-dark.css' : 'base-auto.css'],
      matches: ['<all_urls>'],
      ...(excluded.length && { excludeMatches: excluded }),
    });
  }
  const forcedPatterns = forced.flatMap(sitePatterns);
  if (forcedPatterns.length) scripts.push({ ...common, id: FORCED_ID, css: ['base-dark.css'], matches: forcedPatterns });

  const existing = await browser.scripting.getRegisteredContentScripts({ ids: [BASE_ID, FORCED_ID] });
  if (existing.length) await browser.scripting.unregisterContentScripts({ ids: existing.map((script) => script.id) });
  if (scripts.length) await browser.scripting.registerContentScripts(scripts);
}

/** Keep the per-site theme cache within its limits, least recently used first. */
async function evictCache(index: CacheIndex): Promise<void> {
  const evicted = evictions(index);
  if (!evicted.length) return;
  for (const key of evicted) delete index[key];
  await browser.storage.local.remove(evicted.map((key) => CACHE_PREFIX + key));
  await browser.storage.local.set({ [CACHE_INDEX_KEY]: index });
}

const FIXES_ALARM = 'sombre:refresh-fixes';

/**
 * Keep the newest valid shared fix list: the one bundled with this version,
 * or the remote one (refreshed daily) when it is newer. Anything unsigned,
 * tampered or invalid is ignored and the last valid list stays in place.
 */
async function refreshSharedFixes(): Promise<void> {
  const current = (await browser.storage.local.get(SHARED_FIXES_KEY))[SHARED_FIXES_KEY] as FixList | undefined;
  let best = current;
  const sources: [string, RequestInit][] = [[browser.runtime.getURL('/fixes.signed.json'), {}]];
  if (SHARED_FIXES_URL) sources.push([SHARED_FIXES_URL, { cache: 'no-cache', credentials: 'omit' }]);
  for (const [url, init] of sources) {
    try {
      const response = await fetch(url, init);
      if (!response.ok) continue;
      const list = await verifyFixList(await response.json(), FIXES_PUBLIC_KEY);
      if (list && (!best || list.version > best.version)) best = list;
    } catch {
      // Offline or unreachable: keep the last valid list.
    }
  }
  if (best && best !== current) await browser.storage.local.set({ [SHARED_FIXES_KEY]: best });
}

let syncQueue = Promise.resolve();
function queueSync(): void {
  syncQueue = syncQueue.then(syncRegistrations).catch((error) => console.error('[sombre] registration failed', error));
}

const LOCAL_HOST = /^(?:localhost|.*\.(?:local|localhost|internal|lan|home|corp|test))$/i;
const IP_HOST = /^(?:\[.*\]|\d{1,3}(?:\.\d{1,3}){3})$/;

/**
 * The page cannot read cross-origin stylesheets (nor images, on a canvas), so the
 * background fetches them (host permissions bypass CORS). Their mirrored colors and
 * inverted icons end up in sheets the page can inspect, so private-network targets
 * are refused unless the page itself lives on that origin.
 */
function mayFetch(target: URL, frameUrl: string | undefined): boolean {
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;
  if (frameUrl && new URL(frameUrl).origin === target.origin) return true;
  return target.protocol === 'https:' && !target.port && !LOCAL_HOST.test(target.hostname) && !IP_HOST.test(target.hostname);
}

/** A stylesheet's text, or an image as a data URL (the content script analyzes it on a canvas). */
async function fetchResource(url: string, frameUrl: string | undefined, image: boolean): Promise<FetchResponse> {
  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return { ok: false, error: 'invalid url' };
  }
  if (!mayFetch(target, frameUrl)) return { ok: false, error: 'blocked' };
  try {
    const response = await fetch(target, { cache: 'force-cache', credentials: 'omit' });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    if (!image) {
      const text = await response.text();
      if (text.length > MAX_CSS_BYTES) return { ok: false, error: 'too large' };
      return { ok: true, text };
    }
    const type = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!type.startsWith('image/')) return { ok: false, error: 'not an image' };
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > MAX_IMAGE_BYTES) return { ok: false, error: 'too large' };
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { ok: true, text: `data:${type};base64,${btoa(binary)}` };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/** First install: show where the button is and what it does. Unpacked builds (development, tests) skip it. */
async function welcome(): Promise<void> {
  if ((await browser.management.getSelf()).installType === 'development') return;
  await browser.tabs.create({ url: browser.runtime.getURL('/welcome.html') });
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(({ reason }) => {
    queueSync();
    void refreshSharedFixes();
    void browser.alarms.create(FIXES_ALARM, { periodInMinutes: 24 * 60 });
    if (reason === 'install') void welcome();
  });
  browser.runtime.onStartup.addListener(queueSync);
  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === FIXES_ALARM) void refreshSharedFixes();
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (SETTINGS_KEY in changes || NATIVE_KEY in changes) queueSync();
    if (CACHE_INDEX_KEY in changes) void evictCache((changes[CACHE_INDEX_KEY]!.newValue ?? {}) as CacheIndex);
  });

  browser.runtime.onMessage.addListener((message: FetchCssRequest | FetchImageRequest, sender, sendResponse) => {
    const image = message?.type === 'sombre:fetch-image';
    if ((!image && message?.type !== 'sombre:fetch-css') || sender.id !== browser.runtime.id) return;
    void fetchResource(message.url, sender.url, image).then(sendResponse);
    return true;
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'toggle-site' || tab?.id === undefined) return;
    const request: ContentRequest = { type: 'sombre:toggle-site' };
    browser.tabs.sendMessage(tab.id, request, { frameId: 0 }).catch(() => {});
  });
});

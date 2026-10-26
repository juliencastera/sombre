import type { ContentRequest, FetchCssRequest, FetchCssResponse } from '../shared/messages.ts';
import { NATIVE_KEY, normalizeSettings, SETTINGS_KEY, sitePatterns } from '../shared/settings.ts';

const BASE_ID = 'sombre-base';
const FORCED_ID = 'sombre-base-forced';
const MAX_CSS_BYTES = 8 * 1024 * 1024;

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

let syncQueue = Promise.resolve();
function queueSync(): void {
  syncQueue = syncQueue.then(syncRegistrations).catch((error) => console.error('[sombre] registration failed', error));
}

const LOCAL_HOST = /^(?:localhost|.*\.(?:local|localhost|internal|lan|home|corp|test))$/i;
const IP_HOST = /^(?:\[.*\]|\d{1,3}(?:\.\d{1,3}){3})$/;

/**
 * The page cannot read cross-origin stylesheets, so the background fetches them
 * (host permissions bypass CORS). Their mirrored colors end up in a sheet the
 * page can inspect, so private-network targets are refused unless the page
 * itself lives on that origin.
 */
function mayFetch(target: URL, frameUrl: string | undefined): boolean {
  if (target.protocol !== 'https:' && target.protocol !== 'http:') return false;
  if (frameUrl && new URL(frameUrl).origin === target.origin) return true;
  return target.protocol === 'https:' && !target.port && !LOCAL_HOST.test(target.hostname) && !IP_HOST.test(target.hostname);
}

async function fetchCss(url: string, frameUrl: string | undefined): Promise<FetchCssResponse> {
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
    const text = await response.text();
    if (text.length > MAX_CSS_BYTES) return { ok: false, error: 'too large' };
    return { ok: true, text };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(queueSync);
  browser.runtime.onStartup.addListener(queueSync);
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (SETTINGS_KEY in changes || NATIVE_KEY in changes)) queueSync();
  });

  browser.runtime.onMessage.addListener((message: FetchCssRequest, sender, sendResponse) => {
    if (message?.type !== 'sombre:fetch-css' || sender.id !== browser.runtime.id) return;
    void fetchCss(message.url, sender.url).then(sendResponse);
    return true;
  });

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== 'toggle-site' || tab?.id === undefined) return;
    const request: ContentRequest = { type: 'sombre:toggle-site' };
    browser.tabs.sendMessage(tab.id, request, { frameId: 0 }).catch(() => {});
  });
});

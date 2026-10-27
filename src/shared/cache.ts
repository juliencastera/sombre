/**
 * Per-site cache (spec §5) of the mirrors generated for fetched stylesheets,
 * by stylesheet URL. A mirror is only ever used for the exact stylesheet it was
 * generated from, so a cached entry can never leave part of a page uncovered.
 */
export const CACHE_PREFIX = 'sombre:cache:';
/** `{ [siteKey]: { at, size } }`, maintained by content scripts, evicted by the background. */
export const CACHE_INDEX_KEY = 'sombre:cache-index';

export const CACHE_MAX_SITES = 200;
export const CACHE_MAX_BYTES = 20 * 1024 * 1024;
/** Per-site budget; the stylesheets seen most recently are kept. */
export const CACHE_MAX_SITE_BYTES = 2 * 1024 * 1024;

export interface CacheEntry {
  /** Extension version, contrast level and native mode the mirrors were generated for. */
  version: string;
  /** Mirror CSS by stylesheet URL, most recently seen last. */
  sheets: Record<string, string>;
  at: number;
}

export type CacheIndex = Record<string, { at: number; size: number }>;

export function cacheVersion(extensionVersion: string, contrast: string, native: boolean): string {
  return `${extensionVersion}|${contrast}|${native ? 'native' : ''}`;
}

/**
 * Merge this page's mirrors into the site's cached ones (pages of a site share
 * most stylesheets), dropping the least recently seen beyond the budget.
 * Returns null when nothing changed.
 */
export function mergeSheets(
  previous: Record<string, string> | undefined,
  current: Record<string, string>,
): Record<string, string> | null {
  const before = previous ?? {};
  const changed = Object.entries(current).some(([url, css]) => before[url] !== css);
  if (!changed) return null;
  // Re-insert current sheets so they count as most recent.
  const merged: Record<string, string> = { ...before };
  for (const url of Object.keys(current)) delete merged[url];
  Object.assign(merged, current);
  const urls = Object.keys(merged);
  let bytes = urls.reduce((sum, url) => sum + merged[url]!.length, 0);
  for (const url of urls) {
    if (bytes <= CACHE_MAX_SITE_BYTES) break;
    bytes -= merged[url]!.length;
    delete merged[url];
  }
  return merged;
}

export function sheetsSize(sheets: Record<string, string>): number {
  return Object.values(sheets).reduce((sum, css) => sum + css.length, 0);
}

/** Site keys to drop so the index fits the limits, least recently used first. */
export function evictions(index: CacheIndex): string[] {
  const entries = Object.entries(index).sort((a, b) => b[1].at - a[1].at);
  const evicted: string[] = [];
  let bytes = 0;
  entries.forEach(([key, { size }], i) => {
    bytes += size;
    if (i >= CACHE_MAX_SITES || bytes > CACHE_MAX_BYTES) evicted.push(key);
  });
  return evicted;
}

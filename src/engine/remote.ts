import { browser } from 'wxt/browser';
import type { FetchCssRequest, FetchCssResponse } from '../shared/messages.ts';
import { generateRules, type GenerateOptions } from './generate.ts';

const MAX_IMPORT_DEPTH = 4;
const IMPORT_RULE = /@import\s+(?:url\(\s*)?(['"]?)([^'")\s]+)\1\s*\)?([^;]*);/g;

async function fetchText(url: string): Promise<string> {
  if (new URL(url).origin === location.origin) {
    // Same origin: fetch from the page context, sharing its HTTP cache and cookies.
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  }
  const request: FetchCssRequest = { type: 'sombre:fetch-css', url };
  const response: FetchCssResponse = await browser.runtime.sendMessage(request);
  if (!response?.ok) throw new Error(response?.error ?? 'no response');
  return response.text;
}

/**
 * Generate the dark mirror of a stylesheet the page cannot read, from its text
 * fetched by the background. Constructed sheets reject `@import`, so imports
 * are fetched and generated separately, then wrapped in their conditions.
 */
async function generateRemote(url: string, options: GenerateOptions, depth: number): Promise<string> {
  const text = await fetchText(url);
  let imports = '';
  if (depth < MAX_IMPORT_DEPTH) {
    for (const [, , href, condition] of text.matchAll(IMPORT_RULE)) {
      const absolute = new URL(href!, url).href;
      const body = await generateRemote(absolute, options, depth + 1).catch(() => '');
      const media = condition!.replace(/\b(?:layer|supports)\([^)]*\)|\blayer\b/g, '').trim();
      imports += media && body ? `@media ${media}{${body}}` : body;
    }
  }
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text.replace(IMPORT_RULE, ''));
  return imports + generateRules(sheet.cssRules, { ...options, baseUrl: url });
}

export class RemoteSheets {
  readonly #done = new Map<string, string>();
  readonly #pending = new Map<string, Promise<void>>();
  /** Seeded from the cache and not revalidated yet. */
  readonly #stale = new Set<string>();
  readonly #options: GenerateOptions;
  readonly #onLoaded: () => void;

  constructor(options: GenerateOptions, onLoaded: () => void) {
    this.#options = options;
    this.#onLoaded = onLoaded;
  }

  /** Cached mirrors from a previous visit, served at once and revalidated on first use. */
  seed(sheets: Record<string, string>): void {
    for (const [url, css] of Object.entries(sheets)) {
      if (this.#done.has(url)) continue;
      this.#done.set(url, css);
      this.#stale.add(url);
    }
  }

  /** Mirrors generated on this page, by URL (cached ones that turned out current included). */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [url, css] of this.#done) if (css && !this.#stale.has(url)) out[url] = css;
    return out;
  }

  /** Generated CSS for `url`, or null while it is being fetched (a fetch is started on first call). */
  get(url: string): string | null {
    const css = this.#done.get(url);
    if (css !== undefined) {
      if (this.#stale.delete(url)) this.#revalidate(url, css);
      return css;
    }
    if (!this.#pending.has(url)) {
      const task = generateRemote(url, this.#options, 0)
        .catch(() => '')
        .then((generated) => {
          this.#done.set(url, generated);
          this.#pending.delete(url);
          this.#onLoaded();
        });
      this.#pending.set(url, task);
    }
    return null;
  }

  /** Forget generated CSS (the contrast level changed); texts come back from the HTTP cache. */
  reset(): void {
    this.#done.clear();
    this.#stale.clear();
  }

  #revalidate(url: string, cached: string): void {
    void generateRemote(url, this.#options, 0)
      .then((css) => {
        this.#done.set(url, css);
        if (css !== cached) this.#onLoaded();
      })
      .catch(() => {});
  }

  /** Resolves once every fetch started so far has settled. */
  async settled(): Promise<void> {
    while (this.#pending.size) await Promise.all(this.#pending.values());
  }
}

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
  private readonly done = new Map<string, string>();
  private readonly pending = new Map<string, Promise<void>>();
  private readonly options: GenerateOptions;
  private readonly onLoaded: () => void;

  constructor(options: GenerateOptions, onLoaded: () => void) {
    this.options = options;
    this.onLoaded = onLoaded;
  }

  /** Generated CSS for `url`, or null while it is being fetched (a fetch is started on first call). */
  get(url: string): string | null {
    const css = this.done.get(url);
    if (css !== undefined) return css;
    if (!this.pending.has(url)) {
      const task = generateRemote(url, this.options, 0)
        .catch(() => '')
        .then((generated) => {
          this.done.set(url, generated);
          this.pending.delete(url);
          this.onLoaded();
        });
      this.pending.set(url, task);
    }
    return null;
  }

  /** Forget generated CSS (the contrast level changed); texts come back from the HTTP cache. */
  reset(): void {
    this.done.clear();
  }

  /** Resolves once every fetch started so far has settled. */
  async settled(): Promise<void> {
    while (this.pending.size) await Promise.all(this.pending.values());
  }
}

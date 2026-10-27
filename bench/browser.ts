import { chromium, type BrowserContext } from '@playwright/test';
import { CDN_ORIGIN, FIXTURE_ORIGIN, FIXTURE_PORTS, VIEWPORT } from './config.ts';

export type ColorScheme = 'light' | 'dark';

export interface LaunchOptions {
  extensionPath?: string;
  headed: boolean;
  scheme: ColorScheme;
  reducedMotion?: boolean;
  /** Browser UI language (drives chrome.i18n), e.g. `fr`. */
  lang?: string;
}

/** Route the fixture hostnames to the local HTTPS servers, for pages and extension workers alike. */
const FIXTURE_ARGS = [
  `--host-resolver-rules=${[
    `MAP ${new URL(FIXTURE_ORIGIN).hostname}:443 127.0.0.1:${FIXTURE_PORTS.site}`,
    `MAP ${new URL(CDN_ORIGIN).hostname}:443 127.0.0.1:${FIXTURE_PORTS.cdn}`,
  ].join(',')}`,
  '--ignore-certificate-errors',
];

/**
 * Fresh persistent context (temporary profile) so every run starts with empty
 * caches and a freshly installed extension. Extensions require a persistent
 * context, and the `chromium` channel keeps them working in headless mode.
 */
export function launchContext({ extensionPath, headed, scheme, reducedMotion = false, lang }: LaunchOptions): Promise<BrowserContext> {
  return chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: !headed,
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: scheme,
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
    args: [
      ...FIXTURE_ARGS,
      ...(lang ? [`--lang=${lang}`] : []),
      ...(extensionPath ? [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`] : []),
    ],
  });
}

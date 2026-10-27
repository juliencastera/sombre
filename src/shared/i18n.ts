import { browser } from 'wxt/browser';

const getMessage = browser.i18n.getMessage.bind(browser.i18n) as (key: string, substitutions?: string[]) => string;

/** Translated UI string (public/_locales); falls back to the key so a missing string is visible. */
export function t(key: string, ...substitutions: string[]): string {
  return getMessage(key, substitutions) || key;
}

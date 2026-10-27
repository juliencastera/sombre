/**
 * Site fixes (spec §8): what the algorithm gets wrong on a given site, corrected
 * by the user (element picker) or by a shared, signed list. The schema is a
 * closed set of actions on selectors — never free CSS — so a fix list cannot
 * load anything (no url(), no @import) or exfiltrate data.
 */

export type FixAction = 'ignore' | 'invert' | 'force-dark' | 'set-color';

export const FIX_ACTIONS: readonly FixAction[] = ['ignore', 'invert', 'force-dark', 'set-color'];
export const COLOR_PROPERTIES = ['color', 'background-color', 'border-color'] as const;
export type ColorProperty = (typeof COLOR_PROPERTIES)[number];

export interface Fix {
  selector: string;
  action: FixAction;
  /** `set-color` only. */
  property?: ColorProperty;
  /** `set-color` only: a hex color. */
  value?: string;
}

export interface FixList {
  /** Monotonic; a list only replaces another with a lower version. */
  version: number;
  /** By site key (hostname without `www.`), covering subdomains. */
  sites: Record<string, Fix[]>;
}

export interface SignedFixList {
  /** The FixList as JSON text: exactly the signed bytes. */
  payload: string;
  /** Ed25519 signature of the UTF-8 payload, base64. */
  signature: string;
}

/** User fixes, `{ [siteKey]: Fix[] }`. */
export const LOCAL_FIXES_KEY = 'sombre:fixes';
/** Shared fixes (bundled or remote, verified), a FixList. */
export const SHARED_FIXES_KEY = 'sombre:shared-fixes';

const MAX_SELECTOR = 300;
const MAX_FIXES_PER_SITE = 50;
const MAX_SITES = 5000;
const SITE_KEY = /^[a-z0-9.-]+$/;
/**
 * Characters and functions a selector never needs: block delimiters, at-rules,
 * escapes that could hide them, comments, and anything that loads a resource.
 */
const FORBIDDEN_SELECTOR = /[{};@\\<]|\/\*|url\(|image-set|src\(|expression/i;

export function validateFix(value: unknown): Fix | null {
  if (!value || typeof value !== 'object') return null;
  const { selector, action, property, value: color } = value as Record<string, unknown>;
  if (typeof selector !== 'string' || !selector.trim() || selector.length > MAX_SELECTOR) return null;
  if (FORBIDDEN_SELECTOR.test(selector)) return null;
  if (!FIX_ACTIONS.includes(action as FixAction)) return null;
  if (action === 'set-color') {
    if (!COLOR_PROPERTIES.includes(property as ColorProperty)) return null;
    if (typeof color !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(color)) return null;
    return { selector: selector.trim(), action, property: property as ColorProperty, value: color.toLowerCase() };
  }
  return { selector: selector.trim(), action: action as FixAction };
}

/** Validated per-site fixes; invalid entries are dropped, invalid site keys too. */
export function validateSites(value: unknown): Record<string, Fix[]> {
  const sites: Record<string, Fix[]> = {};
  if (!value || typeof value !== 'object') return sites;
  for (const [key, list] of Object.entries(value as Record<string, unknown>).slice(0, MAX_SITES)) {
    if (!SITE_KEY.test(key) || !Array.isArray(list)) continue;
    const fixes = list
      .slice(0, MAX_FIXES_PER_SITE)
      .map(validateFix)
      .filter((fix): fix is Fix => fix !== null);
    if (fixes.length) sites[key] = fixes;
  }
  return sites;
}

export function validateFixList(value: unknown): FixList | null {
  if (!value || typeof value !== 'object') return null;
  const { version, sites } = value as Record<string, unknown>;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) return null;
  return { version, sites: validateSites(sites) };
}

/** Fixes for a hostname: every site key covering it (exact host or parent domain). */
export function fixesFor(sites: Record<string, Fix[]>, hostname: string): Fix[] {
  const host = hostname.toLowerCase().replace(/^www\./, '');
  return Object.entries(sites)
    .filter(([key]) => host === key || host.endsWith(`.${key}`))
    .flatMap(([, fixes]) => fixes);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Verify an Ed25519-signed list against the embedded public key (raw, base64). Null if anything is off. */
export async function verifyFixList(signed: unknown, publicKey: string): Promise<FixList | null> {
  if (!signed || typeof signed !== 'object' || !publicKey) return null;
  const { payload, signature } = signed as Partial<SignedFixList>;
  if (typeof payload !== 'string' || typeof signature !== 'string' || payload.length > 1_000_000) return null;
  try {
    const key = await crypto.subtle.importKey('raw', fromBase64(publicKey), { name: 'Ed25519' }, false, ['verify']);
    const valid = await crypto.subtle.verify('Ed25519', key, fromBase64(signature), new TextEncoder().encode(payload));
    return valid ? validateFixList(JSON.parse(payload)) : null;
  } catch {
    return null;
  }
}

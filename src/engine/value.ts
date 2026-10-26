import { formatColor, isNamedColor, parseColor } from '../shared/color/parse.ts';
import type { Rgba } from '../shared/color/types.ts';
import { transformColor, type Role } from './transform.ts';

export interface RewriteOptions {
  /** Base URL to absolutize `url()` against: our sheet is not served from the original stylesheet's URL. */
  baseUrl?: string | null;
  /** Fallback for color syntaxes `parseColor` does not handle (lab(), oklch(), color()…). */
  resolveColor?: (text: string) => Rgba | null;
}

const COLOR_FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/;

/**
 * Name of the role-specific twin of a custom property. A variable can feed both
 * text and backgrounds, so each role gets its own transformed copy.
 */
export function roleVariable(role: Role, name: string): string {
  return `--sombre-${role}${name}`;
}

/** Index of the `)` matching the `(` at `open`, skipping quoted strings. -1 if unbalanced. */
function matchParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"' || ch === "'") {
      const end = s.indexOf(ch, i + 1);
      if (end < 0) return -1;
      i = end;
    } else if (ch === '(') depth++;
    else if (ch === ')' && --depth === 0) return i;
  }
  return -1;
}

function topLevelComma(s: string): number {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) return i;
  }
  return -1;
}

function absolutizeUrl(inner: string, baseUrl: string): string {
  const raw = inner.trim().replace(/^(['"])(.*)\1$/s, '$2');
  if (/^(?:data:|[a-z][a-z0-9+.-]*:|#)/i.test(raw)) return `url(${inner})`;
  try {
    return `url(${JSON.stringify(new URL(raw, baseUrl).href)})`;
  } catch {
    return `url(${inner})`;
  }
}

interface Result {
  text: string;
  changed: boolean;
}

function rewrite(s: string, role: Role, options: RewriteOptions): Result {
  let out = '';
  let changed = false;
  const color = (rgba: Rgba) => {
    changed = true;
    return formatColor(transformColor(rgba, role));
  };

  for (let i = 0; i < s.length; ) {
    const ch = s[i]!;

    if (ch === '"' || ch === "'") {
      const end = s.indexOf(ch, i + 1);
      const stop = end < 0 ? s.length : end + 1;
      out += s.slice(i, stop);
      i = stop;
      continue;
    }

    if (ch === '#') {
      const hex = /^#[0-9a-f]{3,8}(?![\w-])/i.exec(s.slice(i, i + 10))?.[0];
      const parsed = hex ? parseColor(hex) : null;
      if (hex && parsed) {
        out += color(parsed);
        i += hex.length;
        continue;
      }
    }

    const prev = i > 0 ? s[i - 1]! : '';
    if (/[a-z_-]/i.test(ch) && !/[\w-]/.test(prev)) {
      const ident = /^-?[a-z_][\w-]*/i.exec(s.slice(i))?.[0];
      if (ident) {
        const open = i + ident.length;
        if (s[open] === '(') {
          const close = matchParen(s, open);
          if (close < 0) {
            out += s.slice(i);
            break;
          }
          const name = ident.toLowerCase();
          const inner = s.slice(open + 1, close);
          const whole = s.slice(i, close + 1);
          if (name === 'url') {
            out += options.baseUrl ? absolutizeUrl(inner, options.baseUrl) : whole;
          } else if (name === 'var') {
            out += rewriteVar(inner, role, options);
            changed = true;
          } else if (COLOR_FUNCTION.test(name)) {
            const parsed = parseColor(whole) ?? options.resolveColor?.(whole) ?? null;
            out += parsed ? color(parsed) : whole;
          } else {
            // Gradients, color-mix(), calc()…: rewrite the colors inside.
            const nested = rewrite(inner, role, options);
            out += `${ident}(${nested.text})`;
            changed ||= nested.changed;
          }
          i = close + 1;
          continue;
        }
        if (isNamedColor(ident)) out += color(parseColor(ident)!);
        else out += ident;
        i += ident.length;
        continue;
      }
    }

    out += ch;
    i++;
  }
  return { text: out, changed };
}

/** `var(--x, F)` → `var(--sombre-<role>--x, var(--x, F'))`, falling back to the page's own variable. */
function rewriteVar(inner: string, role: Role, options: RewriteOptions): string {
  const comma = topLevelComma(inner);
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  if (!name.startsWith('--')) return `var(${inner})`;
  const fallback = comma < 0 ? '' : `,${rewrite(inner.slice(comma + 1), role, options).text}`;
  return `var(${roleVariable(role, name)},var(${name}${fallback}))`;
}

/**
 * Rewrite every color in a CSS value for the given role. Returns null when the
 * value contains no color and no variable (nothing to emit).
 */
export function rewriteValue(value: string, role: Role, options: RewriteOptions = {}): string | null {
  // light-dark() already carries the site's own dark color.
  if (/light-dark\(/i.test(value)) return null;
  const result = rewrite(value, role, options);
  return result.changed ? result.text : null;
}

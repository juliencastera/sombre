import { formatColor, parseColor } from '../shared/color/parse.ts';
import type { Rgba } from '../shared/color/types.ts';
import { transformColor, type Role } from './transform.ts';

export interface RewriteOptions {
  /** Base URL to absolutize `url()` against: our sheet is not served from the original stylesheet's URL. */
  baseUrl?: string | null;
  /** Fallback for colors `parseColor` does not handle: named colors, lab(), oklch(), color()… */
  resolveColor?: (text: string) => Rgba | null;
}

const COLOR_FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/;

/**
 * Identifiers the browser resolves to a color but that must not be transformed:
 * `currentcolor` follows text, `transparent` stays so, system colors already
 * follow the color scheme we set.
 */
const NOT_NAMED_COLORS = new Set(
  (
    'currentcolor transparent inherit initial unset revert none auto canvas canvastext linktext ' +
    'visitedtext activetext buttonface buttontext buttonborder field fieldtext highlight highlighttext ' +
    'selecteditem selecteditemtext mark marktext graytext accentcolor accentcolortext'
  ).split(' '),
);

/**
 * Name of the role-specific twin of a custom property. A variable can feed both
 * text and backgrounds, so each role gets its own transformed copy.
 */
export function roleVariable(role: Role, name: string): string {
  return `--sombre-${role}${name}`;
}

/** `var(--x)` or `var(--x) / <alpha>` as the whole argument list of rgb()/hsl(). */
const CHANNEL_VAR = /^\s*var\(\s*(--[\w-]+)\s*\)\s*(?:\/\s*(.+?))?\s*$/s;
const HSL_CHANNELS = /^\s*(-?[\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%\s*$/;
const RGB_CHANNELS = /^\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*$/;

/** Twin of a custom property holding bare channels (`0 0% 100%`), transformed for a role. */
export function channelVariable(role: Role, kind: 'rgb' | 'hsl', name: string): string {
  return `--sombre-${role}-${kind}${name}`;
}

function rgbToHslChannels({ r, g, b }: Rgba): string {
  // Round first: float noise on a neutral grey would otherwise yield an arbitrary hue.
  const [rn, gn, bn] = [r, g, b].map((v) => Math.round(v) / 255) as [number, number, number];
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  return `${round((h * 60 + 360) % 360)} ${round(s * 100)}% ${round(l * 100)}%`;
}

/**
 * Role twins of a custom property whose value is bare color channels, as used
 * through `hsl(var(--x))` / `rgb(var(--x) / a)`. Empty when the value is not
 * a channel list.
 */
export function channelTwins(name: string, value: string, roles: readonly Role[], important: string): string {
  const hsl = HSL_CHANNELS.exec(value);
  const rgb = hsl ? null : RGB_CHANNELS.exec(value);
  if (!hsl && !rgb) return '';
  const color = parseColor(hsl ? `hsl(${hsl[1]} ${hsl[2]}% ${hsl[3]}%)` : `rgb(${rgb![1]} ${rgb![2]} ${rgb![3]})`);
  if (!color) return '';
  let out = '';
  for (const role of roles) {
    const t = transformColor(color, role);
    const channels = hsl ? rgbToHslChannels(t) : `${Math.round(t.r)} ${Math.round(t.g)} ${Math.round(t.b)}`;
    out += `${channelVariable(role, hsl ? 'hsl' : 'rgb', name)}:${channels}${important};`;
  }
  return out;
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
  // Colors the transform leaves as they are (preserve mode) keep their source text and do not count as a change.
  const color = (rgba: Rgba, source: string) => {
    const transformed = transformColor(rgba, role);
    if (transformed === rgba) return source;
    changed = true;
    return formatColor(transformed);
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
        out += color(parsed, hex);
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
          } else if (COLOR_FUNCTION.test(name) && CHANNEL_VAR.test(inner) && /^(?:rgba?|hsla?)$/.test(name)) {
            // hsl(var(--background) / .5) with `--background: 0 0% 100%` (shadcn/ui, Tailwind themes).
            const [, variable, alpha] = CHANNEL_VAR.exec(inner)!;
            const kind = name.startsWith('rgb') ? 'rgb' : 'hsl';
            out += `${name}(var(${channelVariable(role, kind, variable!)},var(${variable}))${alpha ? ` / ${alpha}` : ''})`;
            changed = true;
          } else if (COLOR_FUNCTION.test(name)) {
            const parsed = parseColor(whole) ?? options.resolveColor?.(whole) ?? null;
            const variableAlpha = parsed ? null : withVariableAlpha(name, inner, role);
            if (parsed) out += color(parsed, whole);
            else if (variableAlpha) {
              out += variableAlpha;
              changed = true;
            } else out += whole;
          } else {
            // Gradients, color-mix(), calc()…: rewrite the colors inside.
            const nested = rewrite(inner, role, options);
            out += `${ident}(${nested.text})`;
            changed ||= nested.changed;
          }
          i = close + 1;
          continue;
        }
        const named = /^[a-z]+$/i.test(ident) && !NOT_NAMED_COLORS.has(ident.toLowerCase()) ? options.resolveColor?.(ident) : null;
        out += named ? color(named, ident) : ident;
        i += ident.length;
        continue;
      }
    }

    out += ch;
    i++;
  }
  return { text: out, changed };
}

/**
 * `rgb(255 255 255 / var(--tw-bg-opacity))` (Tailwind v3 and similar): the
 * channels are known, only the alpha is variable. Transform the channels and
 * keep the alpha expression as is.
 */
function withVariableAlpha(name: string, inner: string, role: Role): string | null {
  if (!/^(?:rgba?|hsla?)$/.test(name) || !inner.includes('var(')) return null;
  let channels: string;
  let alpha: string;
  const slash = inner.lastIndexOf('/');
  if (slash >= 0) {
    channels = inner.slice(0, slash);
    alpha = inner.slice(slash + 1);
  } else {
    const comma = inner.lastIndexOf(',');
    if (comma < 0) return null;
    channels = inner.slice(0, comma);
    alpha = inner.slice(comma + 1);
  }
  if (channels.includes('var(')) return null;
  const parsed = parseColor(`${name.slice(0, 3)}(${channels})`);
  if (!parsed) return null;
  const { r, g, b } = transformColor(parsed, role);
  const ch = (v: number) => Math.round(v);
  return `rgb(${ch(r)} ${ch(g)} ${ch(b)} / ${alpha.trim()})`;
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

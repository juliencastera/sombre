import type { Rgba } from './types.ts';

function parseHex(hex: string): Rgba | null {
  const h = hex.slice(1);
  if (!/^[0-9a-f]+$/i.test(h)) return null;
  if (h.length === 3 || h.length === 4) {
    const [r, g, b, a = 'f'] = h;
    return { r: parseInt(r! + r, 16), g: parseInt(g! + g, 16), b: parseInt(b! + b, 16), a: parseInt(a + a, 16) / 255 };
  }
  if (h.length === 6 || h.length === 8) {
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a };
  }
  return null;
}

/** Split `rgb()`/`hsl()` arguments, legacy comma or modern space/slash syntax. */
function args(inner: string): string[] | null {
  if (/\bfrom\b|calc\(|var\(/i.test(inner)) return null; // relative colors / math: let the browser resolve
  const parts = inner
    .trim()
    .split(/\s*[,/]\s*|\s+/)
    .filter(Boolean);
  return parts.length === 3 || parts.length === 4 ? parts : null;
}

function num(part: string, percentScale: number): number {
  if (part === 'none') return 0;
  return part.endsWith('%') ? (parseFloat(part) / 100) * percentScale : parseFloat(part);
}

function hueDegrees(part: string): number {
  const value = parseFloat(part);
  if (part.endsWith('turn')) return value * 360;
  if (part.endsWith('grad')) return value * 0.9;
  if (part.endsWith('rad')) return (value * 180) / Math.PI;
  return part === 'none' ? 0 : value;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

const clampChannel = (v: number) => Math.min(255, Math.max(0, v));
const clampAlpha = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Parse a CSS color: hex, rgb()/rgba(), hsl()/hsla() and `transparent`.
 * Returns null for anything else (named colors, lab(), oklch(), color(),
 * relative colors, `currentcolor`, system colors): callers fall back to the
 * browser for those — or to named.ts outside a browser — which keeps the
 * 148-entry name table out of the content script.
 */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value.startsWith('#')) return parseHex(value);
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };

  const fn = /^(rgba?|hsla?)\((.*)\)$/s.exec(value);
  if (!fn) return null;
  const parts = args(fn[2]!);
  if (!parts) return null;
  const alpha = parts[3] === undefined ? 1 : clampAlpha(num(parts[3], 1));
  if (fn[1]!.startsWith('rgb')) {
    const [r, g, b] = parts.slice(0, 3).map((p) => clampChannel(num(p, 255)));
    if ([r, g, b, alpha].some(Number.isNaN)) return null;
    return { r: r!, g: g!, b: b!, a: alpha };
  }
  const h = hueDegrees(parts[0]!);
  const s = clampAlpha(num(parts[1]!, 100) / 100);
  const l = clampAlpha(num(parts[2]!, 100) / 100);
  if ([h, s, l, alpha].some(Number.isNaN)) return null;
  const [r, g, b] = hslToRgb(((h % 360) + 360) % 360, s, l);
  return { r, g, b, a: alpha };
}

/** Serialize as `#rrggbb` when opaque, `rgb(r g b / a)` otherwise. */
export function formatColor({ r, g, b, a }: Rgba): string {
  const ch = (v: number) => Math.round(clampChannel(v));
  if (a >= 1) return `#${((1 << 24) | (ch(r) << 16) | (ch(g) << 8) | ch(b)).toString(16).slice(1)}`;
  return `rgb(${ch(r)} ${ch(g)} ${ch(b)} / ${Math.round(a * 1000) / 1000})`;
}

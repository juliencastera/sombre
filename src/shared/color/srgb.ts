import type { Rgb, Rgba } from './types.ts';

/** sRGB channel (0–255) to linear light (0–1). */
export function toLinear(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Composite a translucent color over an opaque backdrop (source-over). */
export function compositeOver(top: Rgba, backdrop: Rgb): Rgb {
  const { a } = top;
  return {
    r: top.r * a + backdrop.r * (1 - a),
    g: top.g * a + backdrop.g * (1 - a),
    b: top.b * a + backdrop.b * (1 - a),
  };
}

/**
 * Parse a CSS `rgb()` / `rgba()` string as returned by `getComputedStyle`
 * (legacy comma syntax and modern space syntax). Returns null for any other format.
 */
export function parseRgbString(value: string): Rgba | null {
  const match = /^rgba?\(\s*([^)]+)\)$/i.exec(value.trim());
  if (!match) return null;
  const parts = match[1]!.split(/[\s,/]+/).filter(Boolean);
  if (parts.length < 3 || parts.length > 4) return null;
  const [r, g, b] = parts.slice(0, 3).map(parseChannel);
  const a = parts[3] === undefined ? 1 : parseAlpha(parts[3]);
  if (r === undefined || g === undefined || b === undefined || Number.isNaN(r + g + b + a)) return null;
  return { r, g, b, a };
}

function parseChannel(part: string): number {
  return part.endsWith('%') ? (parseFloat(part) / 100) * 255 : parseFloat(part);
}

function parseAlpha(part: string): number {
  return part.endsWith('%') ? parseFloat(part) / 100 : parseFloat(part);
}

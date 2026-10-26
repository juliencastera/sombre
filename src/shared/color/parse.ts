import type { Rgba } from './types.ts';

// CSS named colors (CSS Color 4), packed as name → 0xRRGGBB.
const NAMED: Record<string, number> = {
  aliceblue: 0xf0f8ff, antiquewhite: 0xfaebd7, aqua: 0x00ffff, aquamarine: 0x7fffd4, azure: 0xf0ffff,
  beige: 0xf5f5dc, bisque: 0xffe4c4, black: 0x000000, blanchedalmond: 0xffebcd, blue: 0x0000ff,
  blueviolet: 0x8a2be2, brown: 0xa52a2a, burlywood: 0xdeb887, cadetblue: 0x5f9ea0, chartreuse: 0x7fff00,
  chocolate: 0xd2691e, coral: 0xff7f50, cornflowerblue: 0x6495ed, cornsilk: 0xfff8dc, crimson: 0xdc143c,
  cyan: 0x00ffff, darkblue: 0x00008b, darkcyan: 0x008b8b, darkgoldenrod: 0xb8860b, darkgray: 0xa9a9a9,
  darkgreen: 0x006400, darkgrey: 0xa9a9a9, darkkhaki: 0xbdb76b, darkmagenta: 0x8b008b,
  darkolivegreen: 0x556b2f, darkorange: 0xff8c00, darkorchid: 0x9932cc, darkred: 0x8b0000,
  darksalmon: 0xe9967a, darkseagreen: 0x8fbc8f, darkslateblue: 0x483d8b, darkslategray: 0x2f4f4f,
  darkslategrey: 0x2f4f4f, darkturquoise: 0x00ced1, darkviolet: 0x9400d3, deeppink: 0xff1493,
  deepskyblue: 0x00bfff, dimgray: 0x696969, dimgrey: 0x696969, dodgerblue: 0x1e90ff, firebrick: 0xb22222,
  floralwhite: 0xfffaf0, forestgreen: 0x228b22, fuchsia: 0xff00ff, gainsboro: 0xdcdcdc, ghostwhite: 0xf8f8ff,
  gold: 0xffd700, goldenrod: 0xdaa520, gray: 0x808080, green: 0x008000, greenyellow: 0xadff2f,
  grey: 0x808080, honeydew: 0xf0fff0, hotpink: 0xff69b4, indianred: 0xcd5c5c, indigo: 0x4b0082,
  ivory: 0xfffff0, khaki: 0xf0e68c, lavender: 0xe6e6fa, lavenderblush: 0xfff0f5, lawngreen: 0x7cfc00,
  lemonchiffon: 0xfffacd, lightblue: 0xadd8e6, lightcoral: 0xf08080, lightcyan: 0xe0ffff,
  lightgoldenrodyellow: 0xfafad2, lightgray: 0xd3d3d3, lightgreen: 0x90ee90, lightgrey: 0xd3d3d3,
  lightpink: 0xffb6c1, lightsalmon: 0xffa07a, lightseagreen: 0x20b2aa, lightskyblue: 0x87cefa,
  lightslategray: 0x778899, lightslategrey: 0x778899, lightsteelblue: 0xb0c4de, lightyellow: 0xffffe0,
  lime: 0x00ff00, limegreen: 0x32cd32, linen: 0xfaf0e6, magenta: 0xff00ff, maroon: 0x800000,
  mediumaquamarine: 0x66cdaa, mediumblue: 0x0000cd, mediumorchid: 0xba55d3, mediumpurple: 0x9370db,
  mediumseagreen: 0x3cb371, mediumslateblue: 0x7b68ee, mediumspringgreen: 0x00fa9a,
  mediumturquoise: 0x48d1cc, mediumvioletred: 0xc71585, midnightblue: 0x191970, mintcream: 0xf5fffa,
  mistyrose: 0xffe4e1, moccasin: 0xffe4b5, navajowhite: 0xffdead, navy: 0x000080, oldlace: 0xfdf5e6,
  olive: 0x808000, olivedrab: 0x6b8e23, orange: 0xffa500, orangered: 0xff4500, orchid: 0xda70d6,
  palegoldenrod: 0xeee8aa, palegreen: 0x98fb98, paleturquoise: 0xafeeee, palevioletred: 0xdb7093,
  papayawhip: 0xffefd5, peachpuff: 0xffdab9, peru: 0xcd853f, pink: 0xffc0cb, plum: 0xdda0dd,
  powderblue: 0xb0e0e6, purple: 0x800080, rebeccapurple: 0x663399, red: 0xff0000, rosybrown: 0xbc8f8f,
  royalblue: 0x4169e1, saddlebrown: 0x8b4513, salmon: 0xfa8072, sandybrown: 0xf4a460, seagreen: 0x2e8b57,
  seashell: 0xfff5ee, sienna: 0xa0522d, silver: 0xc0c0c0, skyblue: 0x87ceeb, slateblue: 0x6a5acd,
  slategray: 0x708090, slategrey: 0x708090, snow: 0xfffafa, springgreen: 0x00ff7f, steelblue: 0x4682b4,
  tan: 0xd2b48c, teal: 0x008080, thistle: 0xd8bfd8, tomato: 0xff6347, turquoise: 0x40e0d0,
  violet: 0xee82ee, wheat: 0xf5deb3, white: 0xffffff, whitesmoke: 0xf5f5f5, yellow: 0xffff00,
  yellowgreen: 0x9acd32,
};

export function isNamedColor(ident: string): boolean {
  return Object.hasOwn(NAMED, ident.toLowerCase());
}

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
  const parts = inner.trim().split(/\s*[,/]\s*|\s+/).filter(Boolean);
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
 * Parse a CSS color: hex, rgb()/rgba(), hsl()/hsla(), named colors and
 * `transparent`. Returns null for anything else (lab(), oklch(), color(),
 * relative colors, `currentcolor`, system colors): callers can fall back to
 * the browser for those.
 */
export function parseColor(input: string): Rgba | null {
  const value = input.trim().toLowerCase();
  if (value.startsWith('#')) return parseHex(value);
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  const named = NAMED[value];
  if (named !== undefined) return { r: named >> 16, g: (named >> 8) & 0xff, b: named & 0xff, a: 1 };

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

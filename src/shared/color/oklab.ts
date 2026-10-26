import { toLinear } from './srgb.ts';
import type { Rgb } from './types.ts';

export interface Oklab {
  /** Perceived lightness, 0 (black) – 1 (white). */
  l: number;
  a: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  /** Hue in degrees. */
  h: number;
}

/** sRGB → OKLab (Björn Ottosson, https://bottosson.github.io/posts/oklab/). */
export function rgbToOklab({ r, g, b }: Rgb): Oklab {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);

  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** Perceived lightness (OKLab L) of an sRGB color. */
export function perceivedLightness(color: Rgb): number {
  return rgbToOklab(color).l;
}

export function rgbToOklch(color: Rgb): Oklch {
  const { l, a, b } = rgbToOklab(color);
  const h = (Math.atan2(b, a) * 180) / Math.PI;
  return { l, c: Math.hypot(a, b), h: h < 0 ? h + 360 : h };
}

/** OKLab → linear sRGB, unclamped (channels may fall outside 0–1 when out of gamut). */
function oklabToLinear({ l, a, b }: Oklab): [number, number, number] {
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function fromLinear(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return 255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
}

const inGamut = (linear: number[]) => linear.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/**
 * OKLCH → sRGB. Out-of-gamut colors are mapped by reducing chroma at constant
 * lightness and hue, which keeps the perceived lightness we computed.
 */
export function oklchToRgb({ l, c, h }: Oklch): Rgb {
  const rad = (h * Math.PI) / 180;
  const toLab = (chroma: number): Oklab => ({ l, a: chroma * Math.cos(rad), b: chroma * Math.sin(rad) });

  let linear = oklabToLinear(toLab(c));
  if (!inGamut(linear)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklabToLinear(toLab(mid)))) lo = mid;
      else hi = mid;
    }
    linear = oklabToLinear(toLab(lo));
  }
  return { r: fromLinear(linear[0]), g: fromLinear(linear[1]), b: fromLinear(linear[2]) };
}

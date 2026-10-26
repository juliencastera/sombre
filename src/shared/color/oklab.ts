import { toLinear } from './srgb.ts';
import type { Rgb } from './types.ts';

export interface Oklab {
  /** Perceived lightness, 0 (black) – 1 (white). */
  l: number;
  a: number;
  b: number;
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

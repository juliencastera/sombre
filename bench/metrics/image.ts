import { PNG } from 'pngjs';
import { toLinear } from '../../src/shared/color/srgb.ts';
import type { Rect } from '../probes.ts';

const LINEAR = Array.from({ length: 256 }, (_, i) => toLinear(i));

/** OKLab L from 8-bit sRGB channels, using a linearization lookup table. */
function lightness(r: number, g: number, b: number): number {
  const lr = LINEAR[r]!;
  const lg = LINEAR[g]!;
  const lb = LINEAR[b]!;
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

export function decodePng(data: Buffer): PNG {
  return PNG.sync.read(data);
}

/** Mean perceived lightness of an image, sampling every `stride` pixels. */
export function meanLightness(png: PNG, stride: number): number {
  let sum = 0;
  let count = 0;
  for (let y = 0; y < png.height; y += stride) {
    for (let x = 0; x < png.width; x += stride) {
      const i = (y * png.width + x) * 4;
      sum += lightness(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!);
      count++;
    }
  }
  return count ? sum / count : 0;
}

/**
 * Fraction of sampled pixels brighter than `threshold`, ignoring pixels inside
 * `excluded` rects (images and video, which an extension is not expected to darken).
 */
export function brightFraction(png: PNG, stride: number, threshold: number, excluded: Rect[]): number {
  let bright = 0;
  let count = 0;
  for (let y = 0; y < png.height; y += stride) {
    for (let x = 0; x < png.width; x += stride) {
      if (excluded.some((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height)) continue;
      const i = (y * png.width + x) * 4;
      if (lightness(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!) > threshold) bright++;
      count++;
    }
  }
  return count ? bright / count : 0;
}

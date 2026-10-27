import { parseColor } from '../shared/color/parse.ts';
import type { Rgba } from '../shared/color/types.ts';

let context: OffscreenCanvasRenderingContext2D | null = null;
const cache = new Map<string, Rgba | null>();

/**
 * Resolve any CSS color the browser understands (lab(), oklch(), color()…)
 * through a canvas, which normalizes `fillStyle` to sRGB. Unparseable values
 * (relative colors with var(), currentcolor) resolve to null.
 */
export function resolveColorInBrowser(text: string): Rgba | null {
  // A canvas has no element to inherit from: it resolves currentcolor to black.
  if (/^\s*currentcolor\s*$/i.test(text)) return null;
  const cached = cache.get(text);
  if (cached !== undefined) return cached;

  context ??= new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true });
  let result: Rgba | null = null;
  if (context) {
    const sentinel = '#010203';
    context.fillStyle = sentinel;
    context.fillStyle = text;
    const normalized = String(context.fillStyle);
    if (normalized !== sentinel || text.trim().toLowerCase() === sentinel) {
      result = parseColor(normalized);
      if (!result) {
        // Wide-gamut serializations: read the rasterized pixel instead.
        context.clearRect(0, 0, 1, 1);
        context.fillRect(0, 0, 1, 1);
        const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(0, 0, 1, 1).data;
        result = a ? { r, g, b, a: a / 255 } : null;
      }
    }
  }
  cache.set(text, result);
  return result;
}

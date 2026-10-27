import { apcaContrast } from '../shared/color/apca.ts';
import { oklchToRgb, perceivedLightness, rgbToOklch } from '../shared/color/oklab.ts';
import type { Rgb } from '../shared/color/types.ts';

/** Extra |Lc| for small, then tiny text. */
const SMALL_TEXT_BOOST = [0, 5, 10];

/**
 * APCA floor for a piece of text, following APCA's font lookup in simplified
 * form: the level's target holds for 16px regular text. Large text (≥ 24px, or
 * ≥ 18.66px bold) reads fine with 15 less; small text (under 16px, or under
 * 14px when semi-bold) needs 5 more, tiny text (under 13px) 10 more. A thin
 * weight counts as one step smaller: thin glyphs render fainter than their color.
 * Capped at Lc 100, about what white text on the dark page reaches.
 */
export function requiredLc(target: number, fontSizePx: number, fontWeight: number): number {
  const large = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
  if (large) return target - 15;
  let step = fontSizePx < 13 ? 2 : fontSizePx < 14 || (fontSizePx < 16 && fontWeight < 600) ? 1 : 0;
  if (fontWeight < 400) step = Math.min(step + 1, 2);
  return Math.min(target + SMALL_TEXT_BOOST[step]!, 100);
}

/**
 * The text color closest in lightness to `text` (same hue, chroma reduced only
 * to stay in gamut) reaching `required` |Lc| against `background`, or null when
 * `text` already does. Lighter text is tried first on dark backgrounds, darker
 * text on light ones. When neither white nor black reaches the floor (white on a
 * mid-tone button), the extreme with the most contrast is returned, or null when
 * `text` already beats it: a fix never lowers contrast.
 */
export function fixTextColor(text: Rgb, background: Rgb, required: number): Rgb | null {
  const original = Math.abs(apcaContrast(text, background));
  if (original >= required) return null;
  const { l, c, h } = rgbToOklch(text);
  const at = (lightness: number) => oklchToRgb({ l: lightness, c, h });
  const contrast = (lightness: number) => Math.abs(apcaContrast(at(lightness), background));
  // Aim slightly above the floor: the result is rounded to 8-bit channels afterwards.
  const passes = (lightness: number) => contrast(lightness) >= required + 0.6;

  const preferLighter = perceivedLightness(background) < 0.5;
  for (const extreme of preferLighter ? [1, 0] : [0, 1]) {
    if (!passes(extreme)) continue;
    let near = l;
    let far = extreme;
    for (let i = 0; i < 14; i++) {
      const mid = (near + far) / 2;
      if (passes(mid)) far = mid;
      else near = mid;
    }
    return at(far);
  }
  const best = contrast(1) >= contrast(0) ? 1 : 0;
  return contrast(best) > original ? at(best) : null;
}

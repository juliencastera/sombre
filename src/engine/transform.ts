import { oklchToRgb, rgbToOklch } from '../shared/color/oklab.ts';
import type { Rgba } from '../shared/color/types.ts';
import { CONTRAST_TARGETS, type ContrastLevel } from '../shared/settings.ts';

/** Text lightness band per contrast level: `top - slope × L` for dark and mid-grey source text. */
const TEXT_CURVES: Record<ContrastLevel, { top: number; slope: number; floor: number }> = {
  soft: { top: 0.92, slope: 0.32, floor: 0.7 },
  standard: { top: 0.96, slope: 0.32, floor: 0.72 },
  high: { top: 0.98, slope: 0.18, floor: 0.82 },
};

let level: ContrastLevel = 'standard';

/** Switch the contrast level used by every later transformation. */
export function setContrastLevel(next: ContrastLevel): void {
  if (next === level) return;
  level = next;
  cache.clear();
}

export function contrastLevel(): ContrastLevel {
  return level;
}

let preserveDark = false;

/**
 * On sites with their own dark theme, leave what is already dark (backgrounds,
 * borders, shadows) or light (text, icons) exactly as designed: only the
 * light leftovers — consent walls, third-party widgets — are transformed.
 */
export function setPreserveDark(next: boolean): void {
  if (next === preserveDark) return;
  preserveDark = next;
  cache.clear();
}

/** Roles whose colors stay untouched in preserve mode, by source lightness. */
function preserved(l: number, role: Role): boolean {
  if (role === 'fg') return l >= 0.5;
  if (role === 'invert') return true;
  return l < 0.5;
}

/** Minimum APCA |Lc| for body text at the current level. */
export function contrastTarget(): number {
  return CONTRAST_TARGETS[level];
}

/**
 * How a color is used decides how it is darkened: a white background must
 * become dark, while white text must stay light.
 */
export type Role = 'bg' | 'fg' | 'border' | 'shadow' | 'invert';

/**
 * Roles a custom property can feed (each gets a twin). `invert` is reserved for
 * SVG artwork attributes, where a fill can be a shape's background or its ink.
 */
export const ROLES: readonly Role[] = ['bg', 'fg', 'border', 'shadow'];

/** OKLCH lightness of the page background a white page maps to. Keep in sync with public/base-*.css. */
export const PAGE_BG_L = 0.2;

/**
 * Lightness mapping per role (spec §3). Light backgrounds are inverted into a
 * narrow dark band; already-dark backgrounds (dark headers, tooltips) stay
 * dark, slightly below the page so they keep standing out. Dark and mid-grey
 * text is inverted into a compressed light band calibrated with APCA against
 * the page background (standard level: #222 → Lc 81, #999 → Lc 56); light
 * text (on colored buttons, dark banners) is kept light. Text that still
 * falls under the level's floor is lifted by the contrast passes.
 */
function mapLightness(l: number, role: Role): number {
  switch (role) {
    case 'bg':
      return l >= 0.5 ? PAGE_BG_L + (1 - l) * 0.44 : 0.12 + l * 0.16;
    case 'fg': {
      const { top, slope, floor } = TEXT_CURVES[level];
      return l < 0.75 ? top - l * slope : Math.max(l, floor);
    }
    case 'border':
      return l >= 0.5 ? 0.28 + (1 - l) * 0.4 : 0.55 - l * 0.4;
    case 'shadow':
      return l < 0.5 ? l : l * 0.2;
    case 'invert':
      return l >= 0.5 ? mapLightness(l, 'bg') : mapLightness(l, 'fg');
  }
}

/** Saturated colors look louder on dark backgrounds; tone chroma down a little. */
const CHROMA_SCALE: Record<Role, number> = { bg: 0.8, fg: 0.95, border: 0.8, shadow: 1, invert: 0.9 };

const cache = new Map<string, Rgba>();

export function transformColor(color: Rgba, role: Role): Rgba {
  const key = `${role}${color.r},${color.g},${color.b},${color.a}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { l, c, h } = rgbToOklch(color);
  const result =
    preserveDark && preserved(l, role)
      ? color
      : { ...oklchToRgb({ l: mapLightness(l, role), c: c * CHROMA_SCALE[role], h }), a: color.a };
  if (cache.size > 4096) cache.clear();
  cache.set(key, result);
  return result;
}

import { oklchToRgb, rgbToOklch } from '../shared/color/oklab.ts';
import type { Rgba } from '../shared/color/types.ts';

/**
 * How a color is used decides how it is darkened: a white background must
 * become dark, while white text must stay light.
 */
export type Role = 'bg' | 'fg' | 'border' | 'shadow';

export const ROLES: readonly Role[] = ['bg', 'fg', 'border', 'shadow'];

/** OKLCH lightness of the page background a white page maps to. Keep in sync with public/base-*.css. */
export const PAGE_BG_L = 0.2;

/**
 * Lightness mapping per role (spec §3). Light backgrounds are inverted into a
 * narrow dark band; already-dark backgrounds (dark headers, tooltips) stay
 * dark, slightly below the page so they keep standing out. Dark and mid-grey
 * text is inverted into a compressed light band calibrated with APCA against
 * the page background (#222 → Lc 81, #999 → Lc 56); light text (on colored
 * buttons, dark banners) is kept light.
 */
function mapLightness(l: number, role: Role): number {
  switch (role) {
    case 'bg':
      return l >= 0.5 ? PAGE_BG_L + (1 - l) * 0.44 : 0.12 + l * 0.16;
    case 'fg':
      return l < 0.75 ? 0.96 - l * 0.32 : Math.max(l, 0.72);
    case 'border':
      return l >= 0.5 ? 0.28 + (1 - l) * 0.4 : 0.55 - l * 0.4;
    case 'shadow':
      return l < 0.5 ? l : l * 0.2;
  }
}

/** Saturated colors look louder on dark backgrounds; tone chroma down a little. */
const CHROMA_SCALE: Record<Role, number> = { bg: 0.8, fg: 0.95, border: 0.8, shadow: 1 };

const cache = new Map<string, Rgba>();

export function transformColor(color: Rgba, role: Role): Rgba {
  const key = `${role}${color.r},${color.g},${color.b},${color.a}`;
  const cached = cache.get(key);
  if (cached) return cached;

  const { l, c, h } = rgbToOklch(color);
  const rgb = oklchToRgb({ l: mapLightness(l, role), c: c * CHROMA_SCALE[role], h });
  const result = { ...rgb, a: color.a };
  if (cache.size > 4096) cache.clear();
  cache.set(key, result);
  return result;
}

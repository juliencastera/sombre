import { oklchToRgb, rgbToOklch } from '../shared/color/oklab.ts';
import type { Rgba } from '../shared/color/types.ts';
import { CONTRAST_TARGETS, type ContrastLevel } from '../shared/settings.ts';

/** Text lightness band per contrast level: `top - slope × L` for dark and mid-grey source text. */
const TEXT_CURVES: Record<ContrastLevel, { top: number; slope: number; floor: number }> = {
  soft: { top: 0.94, slope: 0.26, floor: 0.7 },
  standard: { top: 0.97, slope: 0.22, floor: 0.72 },
  high: { top: 0.99, slope: 0.14, floor: 0.82 },
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
  if (role === 'fg' || role === 'art') return l >= 0.5;
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
export type Role = 'bg' | 'fg' | 'border' | 'shadow' | 'invert' | 'art';

/**
 * Roles a custom property can feed (each gets a twin). `invert` is reserved for
 * SVG artwork attributes, where a fill can be a shape's background or its ink;
 * `art` for the paints of an SVG's own stylesheet (logos): vivid colors stay as
 * drawn, greys and black move into the text band like ink.
 */
export const ROLES: readonly Role[] = ['bg', 'fg', 'border', 'shadow'];

/** OKLCH lightness of the page background a white page maps to. Keep in sync with public/base-*.css. */
export const PAGE_BG_L = 0.2;

/**
 * Lightness mapping per role (spec §3). Light backgrounds are inverted into a
 * narrow dark band, steeper near white so that close surfaces (read and unread
 * rows, hover, zebra stripes) stay apart; already-dark backgrounds (dark
 * headers, tooltips) stay dark, slightly below the page so they keep standing
 * out. Dark and mid-grey text is inverted into a compressed light band
 * calibrated with APCA against the page background (standard level: #1f1f1f →
 * Lc 89, #5f6368 → Lc 78); light text (on colored buttons, dark banners) is
 * kept light. Text that still falls under its floor is lifted by the contrast passes.
 */
function mapLightness(l: number, role: Role): number {
  switch (role) {
    case 'bg':
      return l >= 0.5 ? PAGE_BG_L + 0.22 * ((1 - l) / 0.5) ** 0.75 : 0.12 + l * 0.16;
    case 'fg':
    case 'art': {
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

/** OKLCH chroma from which a fill or border reads as a color (badge, button, bar) rather than a tinted surface. */
const ACCENT_MIN_CHROMA = 0.06;
/** Accents above this lightness are pastel tints, darkened like surfaces. */
const ACCENT_PASTEL_L = 0.88;
/** Accents are kept vivid, at most this light: white text on them stays around Lc 70–76. */
const ACCENT_MAX_L = 0.6;

/**
 * Vivid fills, borders and glows (accord bars, badges, colored and outlined
 * buttons, rating bars, focus rings) carry meaning through their color:
 * darkening them like page surfaces or drop shadows turns them into near-black
 * browns and maroons. They keep their hue and most of their chroma, capped in
 * lightness so the text on them stays readable.
 */
function isAccent(l: number, c: number, role: Role): boolean {
  const colored = role === 'bg' || role === 'border' || role === 'shadow' || (role === 'invert' && l >= 0.5);
  return colored && c >= ACCENT_MIN_CHROMA && l <= ACCENT_PASTEL_L;
}

/** Most opacity of a neutral fill or border still read as an overlay rather than a surface. */
const OVERLAY_MAX_ALPHA = 0.16;
/** Most chroma a lightened overlay keeps. */
const OVERLAY_MAX_CHROMA = 0.04;

/**
 * Faint overlays (hover tints, glassy buttons, hairlines) shade whatever is
 * below them. On a dark page they must lighten to show, so they become white,
 * or a light tint of their hue, at the same opacity; on a site's own dark theme
 * they are left alone. Dark tinted ones count too: Vaadin's Lumo draws its grid
 * lines and fills with a navy at 5–16 % opacity, which reads as grey on white.
 */
function isOverlay(alpha: number, l: number, c: number, role: Role): boolean {
  return (role === 'bg' || role === 'border') && alpha > 0 && alpha <= OVERLAY_MAX_ALPHA && (c < 0.02 || l < 0.5);
}

function lightOverlay(alpha: number, c: number, h: number): Rgba {
  if (c < 0.02) return { r: 255, g: 255, b: 255, a: alpha };
  return { ...oklchToRgb({ l: 0.92, c: Math.min(c, OVERLAY_MAX_CHROMA), h }), a: alpha };
}

/** Saturated colors look louder on dark backgrounds; tone chroma down a little. */
const CHROMA_SCALE: Record<Role, number> = { bg: 0.8, fg: 0.95, border: 0.8, shadow: 1, invert: 0.9, art: 0.95 };
/** Most chroma a light tint gets once darkened. */
const TINT_MAX_CHROMA = 0.05;

/**
 * A faint tint (mint panel, blue-grey row) shows on a white page but vanishes
 * at the lightness of a dark surface: light surfaces get twice their chroma, up
 * to a visible but quiet tint. Everything else is toned down a little.
 */
function mapChroma(l: number, c: number, role: Role): number {
  const lightSurface = l >= 0.5 && (role === 'bg' || role === 'border' || role === 'invert');
  return lightSurface ? Math.min(c * 2, Math.max(TINT_MAX_CHROMA, c * CHROMA_SCALE[role])) : c * CHROMA_SCALE[role];
}

/** Cached results; `null` means the color is left as is (callers get their own object back). */
const cache = new Map<string, Rgba | null>();

export function transformColor(color: Rgba, role: Role): Rgba {
  const key = `${role}${color.r},${color.g},${color.b},${color.a}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached ?? color;

  const result = transform(color, role);
  if (cache.size > 4096) cache.clear();
  cache.set(key, result);
  return result ?? color;
}

/** The dark counterpart of `color`, or null to leave it as is. */
function transform(color: Rgba, role: Role): Rgba | null {
  const { l, c, h } = rgbToOklch(color);
  const overlay = isOverlay(color.a, l, c, role);
  if (preserveDark && (overlay || preserved(l, role))) return null;
  if (overlay) return lightOverlay(color.a, c, h);
  // A logo's brand colors read on any background: only dark ones are lifted, like ink.
  if (role === 'art' && c >= ACCENT_MIN_CHROMA && l >= 0.5) return null;
  if (isAccent(l, c, role)) return { ...oklchToRgb({ l: Math.min(l, ACCENT_MAX_L), c: c * 0.9, h }), a: color.a };
  return { ...oklchToRgb({ l: mapLightness(l, role), c: mapChroma(l, c, role), h }), a: color.a };
}

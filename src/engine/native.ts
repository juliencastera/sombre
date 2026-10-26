import { perceivedLightness } from '../shared/color/oklab.ts';
import { compositeOver } from '../shared/color/srgb.ts';
import type { Rgb } from '../shared/color/types.ts';
import { resolveColorInBrowser } from './resolve-color.ts';

/** A background darker than this (OKLab L) counts as dark. */
const DARK_L = 0.4;
/**
 * Share of sampled points that must sit on a dark background. A real dark theme
 * is dark nearly everywhere; mixed pages (dark hero over white sections) are not.
 */
const DARK_SHARE = 0.85;

function parent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

function effectiveBackground(el: Element, canvas: Rgb): Rgb {
  const layers = [];
  for (let node: Element | null = el; node; node = parent(node)) {
    const color = resolveColorInBrowser(getComputedStyle(node).backgroundColor);
    if (color && color.a > 0) layers.push(color);
    if (color && color.a >= 1) break;
  }
  return layers.reduceRight<Rgb>((below, layer) => compositeOver(layer, below), canvas);
}

/**
 * What the canvas shows behind everything: the root's background, else the
 * body's (CSS propagates it to the canvas), else the browser default for the
 * page's color scheme.
 */
function canvasColor(root: HTMLElement, osDark: boolean): Rgb {
  for (const el of [root, document.body]) {
    if (!el) continue;
    const color = resolveColorInBrowser(getComputedStyle(el).backgroundColor);
    if (color && color.a > 0) return compositeOver(color, { r: 255, g: 255, b: 255 });
  }
  const meta = document.querySelector<HTMLMetaElement>('meta[name="color-scheme" i]')?.content ?? '';
  const darkScheme = osDark && (getComputedStyle(root).colorScheme.includes('dark') || meta.includes('dark'));
  return darkScheme ? { r: 18, g: 18, b: 18 } : { r: 255, g: 255, b: 255 };
}

/**
 * Whether the page, with Sombre switched off, already renders dark: its own
 * background, then the effective background under a 3×3 grid of the viewport. Must be called with
 * our styles disabled; it reads computed styles only, so no frame is painted
 * in between.
 */
export function pageLooksDark(osDark: boolean): boolean {
  const root = document.documentElement;
  const canvas = canvasColor(root, osDark);

  const isDark = (el: Element) => perceivedLightness(effectiveBackground(el, canvas)) < DARK_L;

  // The page itself must be dark: a dark header or hero on a light page is not a dark theme.
  if (!isDark(document.body ?? root)) return false;

  const points: Element[] = [];
  const w = innerWidth;
  const h = innerHeight;
  for (const x of [1 / 6, 1 / 2, 5 / 6]) {
    for (const y of [1 / 6, 1 / 2, 5 / 6]) {
      const el = w && h ? document.elementFromPoint(w * x, h * y) : null;
      if (el) points.push(el);
    }
  }
  if (!points.length) return true;
  return points.filter(isDark).length / points.length >= DARK_SHARE;
}

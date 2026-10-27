import { perceivedLightness } from '../shared/color/oklab.ts';
import { compositeOver } from '../shared/color/srgb.ts';
import type { Rgb } from '../shared/color/types.ts';
import type { NativeMarker } from '../shared/settings.ts';
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
export function canvasColor(root: HTMLElement, osDark: boolean): Rgb {
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
export function pageLooksDark(osDark: boolean, canvasOnly = false): boolean {
  const root = document.documentElement;
  const canvas = canvasColor(root, osDark);

  const isDark = (el: Element) => perceivedLightness(effectiveBackground(el, canvas)) < DARK_L;

  // The page itself must be dark: a dark header or hero on a light page is not a dark theme.
  if (!isDark(document.body ?? root)) return false;
  if (canvasOnly) return true;

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

/** Leading compound of a selector, optionally on html/:root/body: `html.dark`, `[data-theme="dark"]`, `.dark .x`. */
const ROOT_COMPOUND = /^(html|:root|body)?((?:\.[\w-]+|\[[^\]]+\])+)(?=$|[\s>+~:,])/i;
const CLASS_PART = /\.([\w-]*dark[\w-]*)/i;
const ATTR_PART = /\[\s*([\w-]+)\s*(?:=\s*(["']?)([^"'\]]*dark[^"'\]]*)\2)?\s*\]/i;
const MAX_RULES = 4000;
const MAX_CANDIDATES = 3;

function markerKey(marker: NativeMarker): string {
  return `${marker.target}|${marker.kind}|${marker.name}|${marker.value}`;
}

/**
 * Class or attribute switches for a dark theme the site ships but has not
 * turned on (Tailwind `.dark`, `html[dark]`, `[data-theme="dark"]`…), most
 * used first, read from the page's readable stylesheets.
 */
export function findNativeMarkers(): NativeMarker[] {
  const counts = new Map<string, { marker: NativeMarker; count: number }>();
  let budget = MAX_RULES;
  const visit = (rules: CSSRuleList, depth: number) => {
    for (let i = 0; i < rules.length && budget > 0; i++, budget--) {
      const rule = rules[i]!;
      if (rule instanceof CSSStyleRule) {
        for (const selector of rule.selectorText.split(',')) {
          const match = ROOT_COMPOUND.exec(selector.trim());
          if (!match) continue;
          const target = match[1]?.toLowerCase() === 'body' ? 'body' : 'html';
          const compound = match[2]!;
          const cls = CLASS_PART.exec(compound);
          const attr = cls ? null : ATTR_PART.exec(compound);
          let marker: NativeMarker | null = null;
          if (cls) marker = { target, kind: 'class', name: cls[1]!, value: '' };
          else if (attr && (attr[3] !== undefined || /dark/i.test(attr[1]!))) {
            marker = { target, kind: 'attr', name: attr[1]!, value: attr[3] ?? '' };
          }
          if (!marker) continue;
          const key = markerKey(marker);
          const entry = counts.get(key) ?? { marker, count: 0 };
          entry.count++;
          counts.set(key, entry);
        }
      } else if (depth < 2 && 'cssRules' in rule) {
        visit((rule as CSSGroupingRule).cssRules, depth + 1);
      }
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      visit(sheet.cssRules, 0);
    } catch {
      // Cross-origin: not readable synchronously.
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_CANDIDATES)
    .map((entry) => entry.marker);
}

/** Switch a marker on or off. Returns false when its target element does not exist yet. */
export function applyMarker(marker: NativeMarker, on: boolean): boolean {
  const el = marker.target === 'body' ? document.body : document.documentElement;
  if (!el) return false;
  if (marker.kind === 'class') el.classList.toggle(marker.name, on);
  else if (on) el.setAttribute(marker.name, marker.value);
  else el.removeAttribute(marker.name);
  return true;
}

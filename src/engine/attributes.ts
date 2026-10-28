import { rgbToOklch } from '../shared/color/oklab.ts';
import { formatColor, parseColor } from '../shared/color/parse.ts';
import { ART_PROPERTIES, declarations, type GenerateOptions } from './generate.ts';
import { resolveColorInBrowser } from './resolve-color.ts';
import { transformColor, type Role } from './transform.ts';

/** Color attributes that act as presentational hints: any CSS rule overrides them. */
const PRESENTATIONAL: { tag: string; attribute: string; property: string; role: Role }[] = [
  { tag: '', attribute: 'bgcolor', property: 'background-color', role: 'bg' },
  { tag: 'font', attribute: 'color', property: 'color', role: 'fg' },
  { tag: 'body', attribute: 'text', property: 'color', role: 'fg' },
  // SVG artwork: a fill can be a shape's background or its ink, so invert by lightness.
  { tag: '', attribute: 'fill', property: 'fill', role: 'invert' },
  { tag: '', attribute: 'stroke', property: 'stroke', role: 'invert' },
  { tag: '', attribute: 'stop-color', property: 'stop-color', role: 'invert' },
];

export const STYLE_ATTRIBUTES = ['style', ...new Set(PRESENTATIONAL.map(({ attribute }) => attribute))];
export const ATTRIBUTE_SELECTOR = `[style],${PRESENTATIONAL.map(({ tag, attribute }) => `${tag}[${attribute}]`).join(',')}`;

/** Cheap pre-filter: skip inline styles that cannot contain a color. */
const COLOR_HINT = /color|background|border|fill|stroke|shadow|outline|--/i;

/** Set on an `<svg>` drawn on its own colored backdrop: its paints stay as drawn (see markArtwork). */
const ART_ATTR = 'data-sombre-art';
/** Excludes the inside of such artwork from the rules below. */
const OUTSIDE_ART = `:not([${ART_ATTR}] *)`;

/**
 * Logos drawn on their own colored backdrop (lpo.fr's blue badge with white and
 * black birds) read on any page: their first opaque shape is a vivid color and
 * white is painted over it. Their colors stay as drawn. An illustration or a
 * chart whose first shape is a white background is still darkened.
 */
function markArtwork(svg: SVGSVGElement): void {
  let backdrop = false;
  for (const shape of svg.querySelectorAll('[fill],[style]')) {
    const color = parseColor((shape as SVGElement).style.fill || shape.getAttribute('fill') || '');
    if (!color || color.a < 1) continue;
    const { l, c } = rgbToOklch(color);
    if (!backdrop) {
      if (c < 0.06) return;
      backdrop = true;
    } else if (l > 0.97 && c < 0.02) {
      svg.setAttribute(ART_ATTR, '');
      return;
    }
  }
}

/** HTML accepts colors without the leading `#` in legacy attributes. */
function parseLegacyColor(value: string) {
  return parseColor(value) ?? (/^[0-9a-f]{3,6}$/i.test(value) ? parseColor(`#${value}`) : resolveColorInBrowser(value));
}

/** Split a style attribute into declarations, keeping each one's exact source text. */
function splitDeclarations(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = '';
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out;
}

/**
 * Dark rules for inline styles and color attributes of one scope, generated
 * incrementally as elements appear or change and never rewritten (stale rules
 * are harmless). The page's DOM is left untouched: rules select the exact
 * source text of each declaration, so identical declarations share one rule and
 * attributes that change every frame (transforms) never reach the generator.
 */
export class AttributeStyles {
  readonly sheet: CSSStyleSheet;
  readonly #seen = new Set<string>();
  readonly #artwork = new WeakSet<SVGSVGElement>();
  readonly #scratch = document.createElement('div');
  readonly #options: GenerateOptions;
  readonly #wrap: (rule: string) => string;

  constructor(sheet: CSSStyleSheet, options: GenerateOptions, wrap: (rule: string) => string) {
    this.sheet = sheet;
    this.#options = options;
    this.#wrap = wrap;
  }

  /** Drop every generated rule (colors changed) before rescanning. */
  reset(): void {
    this.#seen.clear();
    this.sheet.replaceSync('');
  }

  /** Process `root` (if an element) and every element below it carrying a color attribute. */
  scan(root: ParentNode): void {
    if (root instanceof Element && root.matches(ATTRIBUTE_SELECTOR)) this.process(root);
    for (const el of root.querySelectorAll(ATTRIBUTE_SELECTOR)) this.process(el);
  }

  process(el: Element): void {
    // Classified once, before any of its rules exists.
    const svg = el instanceof SVGElement ? el.closest('svg') : null;
    if (svg && !this.#artwork.has(svg)) {
      this.#artwork.add(svg);
      markArtwork(svg);
    }
    const style = el.getAttribute('style');
    if (style && COLOR_HINT.test(style)) this.#processStyle(style);
    for (const { tag, attribute, property, role } of PRESENTATIONAL) {
      const value = el.getAttribute(attribute);
      if (value === null || (tag && el.localName !== tag)) continue;
      const key = `${tag}[${attribute}=${value}`;
      if (this.#seen.has(key)) continue;
      this.#seen.add(key);
      const color = parseLegacyColor(value.trim());
      if (!color) continue;
      // :where(): like the hint it replaces, any page CSS rule still wins.
      this.#add(
        `:where(${tag}[${attribute}=${JSON.stringify(value)} i]${OUTSIDE_ART}){${property}:${formatColor(transformColor(color, role))}}`,
      );
    }
  }

  #processStyle(text: string): void {
    let first = true;
    for (const raw of splitDeclarations(text)) {
      const selector = first ? `[style^=${JSON.stringify(raw)}]` : `[style*=${JSON.stringify(`;${raw}`)}]`;
      first = false;
      if (!raw.trim() || !COLOR_HINT.test(raw) || this.#seen.has(selector)) continue;
      this.#seen.add(selector);
      this.#scratch.style.cssText = raw;
      // Inline paints are SVG artwork too (logos exported with `style="fill:…"`).
      const paint = ART_PROPERTIES.has(this.#scratch.style[0]!);
      const body = declarations(this.#scratch.style, { ...this.#options, art: 'ink' }, true);
      if (body) this.#add(`${selector}${paint ? OUTSIDE_ART : ''}{${body}}`);
    }
  }

  #add(rule: string): void {
    try {
      this.sheet.insertRule(this.#wrap(rule), this.sheet.cssRules.length);
    } catch {
      // Selector the parser rejects (exotic characters): nothing to mirror.
    }
  }
}

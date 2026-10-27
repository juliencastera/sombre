import { formatColor, parseColor } from '../shared/color/parse.ts';
import { declarations, type GenerateOptions } from './generate.ts';
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

/** HTML accepts colors without the leading `#` in legacy attributes. */
function parseLegacyColor(value: string) {
  return parseColor(value) ?? (/^[0-9a-f]{3,6}$/i.test(value) ? parseColor(`#${value}`) : null);
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
  private readonly seen = new Set<string>();
  private readonly scratch = document.createElement('div');
  private readonly options: GenerateOptions;

  constructor(sheet: CSSStyleSheet, options: GenerateOptions) {
    this.sheet = sheet;
    this.options = options;
  }

  /** Drop every generated rule (colors changed) before rescanning. */
  reset(): void {
    this.seen.clear();
    this.sheet.replaceSync('');
  }

  /** Process `root` (if an element) and every element below it carrying a color attribute. */
  scan(root: ParentNode): void {
    if (root instanceof Element && root.matches(ATTRIBUTE_SELECTOR)) this.process(root);
    for (const el of root.querySelectorAll(ATTRIBUTE_SELECTOR)) this.process(el);
  }

  process(el: Element): void {
    const style = el.getAttribute('style');
    if (style && COLOR_HINT.test(style)) this.processStyle(style);
    for (const { tag, attribute, property, role } of PRESENTATIONAL) {
      const value = el.getAttribute(attribute);
      if (value === null || (tag && el.localName !== tag)) continue;
      const key = `${tag}[${attribute}=${value}`;
      if (this.seen.has(key)) continue;
      this.seen.add(key);
      const color = parseLegacyColor(value.trim());
      if (!color) continue;
      // :where(): like the hint it replaces, any page CSS rule still wins.
      this.add(`:where(${tag}[${attribute}=${JSON.stringify(value)} i]){${property}:${formatColor(transformColor(color, role))}}`);
    }
  }

  private processStyle(text: string): void {
    let first = true;
    for (const raw of splitDeclarations(text)) {
      const selector = first ? `[style^=${JSON.stringify(raw)}]` : `[style*=${JSON.stringify(`;${raw}`)}]`;
      first = false;
      if (!raw.trim() || !COLOR_HINT.test(raw) || this.seen.has(selector)) continue;
      this.seen.add(selector);
      this.scratch.style.cssText = raw;
      const body = declarations(this.scratch.style, this.options, true);
      if (body) this.add(`${selector}{${body}}`);
    }
  }

  private add(rule: string): void {
    try {
      this.sheet.insertRule(rule, this.sheet.cssRules.length);
    } catch {
      // Selector the parser rejects (exotic characters): nothing to mirror.
    }
  }
}

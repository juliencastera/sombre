import { formatColor, parseColor } from '../shared/color/parse.ts';
import { transformColor, type Role } from './transform.ts';

/** Legacy HTML color attributes (`<table bgcolor>`, `<font color>`…), still common on older sites. */
const ATTRIBUTES: { tag: string; attribute: string; property: string; role: Role }[] = [
  { tag: '', attribute: 'bgcolor', property: 'background-color', role: 'bg' },
  { tag: 'font', attribute: 'color', property: 'color', role: 'fg' },
  { tag: 'body', attribute: 'text', property: 'color', role: 'fg' },
];

export const PRESENTATIONAL_SELECTOR = ATTRIBUTES.map(({ tag, attribute }) => `${tag}[${attribute}]`).join(',');
export const PRESENTATIONAL_ATTRIBUTES = ATTRIBUTES.map(({ attribute }) => attribute);

/** HTML accepts colors without the leading `#` in these attributes. */
function parseLegacyColor(value: string) {
  return parseColor(value) ?? (/^[0-9a-f]{3,6}$/i.test(value) ? parseColor(`#${value}`) : null);
}

/**
 * Rules for every distinct legacy color attribute value in the document. They
 * are wrapped in `:where()`: like the presentational hints they replace, any
 * page CSS rule still takes precedence.
 */
export function presentationalRules(root: ParentNode): string {
  let css = '';
  for (const { tag, attribute, property, role } of ATTRIBUTES) {
    const values = new Set<string>();
    for (const el of root.querySelectorAll(`${tag}[${attribute}]`)) values.add(el.getAttribute(attribute)!.trim());
    for (const value of values) {
      const color = parseLegacyColor(value);
      if (!color) continue;
      css += `:where(${tag}[${attribute}=${JSON.stringify(value)} i]){${property}:${formatColor(transformColor(color, role))}}`;
    }
  }
  return css;
}

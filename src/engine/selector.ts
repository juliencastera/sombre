/** Attributes that usually survive redeploys, most specific first. */
const STABLE_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa', 'data-id', 'aria-label', 'name', 'role'];
const MAX_DEPTH = 4;

/** Generated class names (CSS modules, styled-components, emotion…) change on every deploy. */
function stableClass(name: string): boolean {
  return (
    name.length <= 40 &&
    !/^(?:css|sc|jsx|emotion|styled|svelte|_)-?[\w-]*\d/i.test(name) &&
    !/[a-z][A-Z0-9][a-zA-Z0-9]{4,}$/.test(name) &&
    !/\d{3,}/.test(name) &&
    !/__[\w-]{5,}$/.test(name)
  );
}

function stableId(id: string): boolean {
  return /^[a-z][\w-]*$/i.test(id) && !/\d{3,}/.test(id) && id.length <= 40;
}

/**
 * A selector for `el` that is likely to keep matching after the site redeploys
 * (spec §8): id, then stable attributes, then non-generated classes, and only as
 * a last resort a position under a stable ancestor. It may match similar
 * elements too, which is usually what a fix wants (every logo, every card).
 */
export function selectorFor(el: Element, depth = 0): string {
  const tag = el.localName;
  if (el.id && stableId(el.id)) return `#${CSS.escape(el.id)}`;
  for (const attribute of STABLE_ATTRIBUTES) {
    const value = el.getAttribute(attribute);
    if (value && value.length <= 60) return `${tag}[${attribute}=${JSON.stringify(value)}]`;
  }
  const classes = [...el.classList].filter(stableClass).slice(0, 2);
  if (classes.length) return tag + classes.map((name) => `.${CSS.escape(name)}`).join('');

  const parent = el.parentElement;
  if (!parent || parent === document.documentElement || depth >= MAX_DEPTH) return tag;
  const index = [...parent.children].filter((child) => child.localName === tag).indexOf(el) + 1;
  return `${selectorFor(parent, depth + 1)} > ${tag}:nth-of-type(${index})`;
}

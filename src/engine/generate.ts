import { formatColor, parseColor } from '../shared/color/parse.ts';
import type { Rgba } from '../shared/color/types.ts';
import { fixTextColor } from './contrast-math.ts';
import { contrastTarget, ROLES, type Role } from './transform.ts';
import { channelTwins, mirrorValue, rewriteValue, roleVariable, type RewriteOptions } from './value.ts';

export interface GenerateOptions extends RewriteOptions {
  /** Generated CSS for an `@import`ed sheet the page cannot read (cross-origin), or null if not loaded yet. */
  resolveImport?: (url: string) => string | null;
  /** Custom property standing for the dark version of a background image (see DarkIcons), or null to leave it. */
  icon?: (url: string) => string | null;
}

/** A background image that is a single `url()`, with its URL. */
const SINGLE_URL = /^url\(\s*(['"]?)(.*?)\1\s*\)$/s;

/** The absolute URL of a background image, or null when it is not a single `url()`. */
function imageUrl(value: string, baseUrl: string | null | undefined): string | null {
  const url = SINGLE_URL.exec(value.trim())?.[2];
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  try {
    return new URL(url, baseUrl ?? document.baseURI).href;
  } catch {
    return null;
  }
}

const ROLE_BY_PROPERTY: Record<string, Role> = {
  color: 'fg',
  'caret-color': 'fg',
  'text-decoration-color': 'fg',
  'text-emphasis-color': 'fg',
  '-webkit-text-fill-color': 'fg',
  '-webkit-text-stroke-color': 'fg',
  // Focus rings are usually an accent color and must stay visible.
  'outline-color': 'fg',
  fill: 'fg',
  stroke: 'fg',
  'stop-color': 'fg',
  'flood-color': 'fg',
  'background-color': 'bg',
  'background-image': 'bg',
  'border-top-color': 'border',
  'border-right-color': 'border',
  'border-bottom-color': 'border',
  'border-left-color': 'border',
  'border-block-start-color': 'border',
  'border-block-end-color': 'border',
  'border-inline-start-color': 'border',
  'border-inline-end-color': 'border',
  'column-rule-color': 'border',
  'box-shadow': 'shadow',
  'text-shadow': 'shadow',
};

/**
 * Shorthands whose longhands read back empty when the shorthand uses `var()`
 * ("pending substitution"): the only way to see their colors is the shorthand.
 */
const VAR_SHORTHANDS: [string, Role][] = [
  ['background', 'bg'],
  ['border', 'border'],
  ['border-color', 'border'],
  ['border-top', 'border'],
  ['border-right', 'border'],
  ['border-bottom', 'border'],
  ['border-left', 'border'],
  ['border-block', 'border'],
  ['border-inline', 'border'],
  ['border-block-start', 'border'],
  ['border-block-end', 'border'],
  ['border-inline-start', 'border'],
  ['border-inline-end', 'border'],
  ['outline', 'fg'],
  ['text-decoration', 'fg'],
  ['column-rule', 'border'],
];

/**
 * Transformed color declarations of a style block. `forceImportant` is used for
 * inline styles, which only `!important` stylesheet rules can override.
 */
export function declarations(style: CSSStyleDeclaration, options: GenerateOptions, forceImportant = false): string {
  let out = '';
  let pendingShorthand = false;
  let text: { rewritten: string; important: string } | null = null;
  let background: Rgba | null = null;
  // A masked element's background color is the ink of an icon, not a surface.
  const masked = style.getPropertyValue('mask-image').includes('url(');
  for (let i = 0; i < style.length; i++) {
    const property = style[i]!;
    const value = style.getPropertyValue(property);
    const important = forceImportant || style.getPropertyPriority(property) ? '!important' : '';

    if (property.startsWith('--')) {
      for (const role of ROLES) {
        const rewritten = rewriteValue(value, role, options);
        if (rewritten !== null) out += `${roleVariable(role, property)}:${rewritten}${important};`;
      }
      out += channelTwins(property, value, ROLES, important);
      continue;
    }

    const role = masked && property === 'background-color' ? 'fg' : ROLE_BY_PROPERTY[property];
    if (!role) continue;
    if (!value) {
      pendingShorthand = true;
      continue;
    }
    // Inline styles only get the declarations that change: theirs already win, ours add !important.
    if (property === 'background-image' && !value.includes('gradient') && !value.includes('var(')) {
      const url = options.icon && imageUrl(value, options.baseUrl);
      const variable = url && options.icon!(url);
      if (variable) out += `background-image:var(${variable},url(${JSON.stringify(url)}))${important};`;
      else if (!forceImportant) out += `background-image:${mirrorValue(value, role, options)}${important};`;
      continue;
    }
    const rewritten = forceImportant ? rewriteValue(value, role, options) : mirrorValue(value, role, options);
    if (rewritten === null) continue;
    if (property === 'color') {
      // Emitted last, once the rule's own background is known (rule-level contrast pass).
      text = { rewritten, important };
      continue;
    }
    if (property === 'background-color' && !masked) background = parseColor(rewritten);
    out += `${property}:${rewritten}${important};`;
  }

  if (text) {
    let color = text.rewritten;
    const parsed = parseColor(color);
    if (parsed && parsed.a === 1 && background?.a === 1) {
      const fixed = fixTextColor(parsed, background, contrastTarget());
      if (fixed) color = formatColor({ ...fixed, a: 1 });
    }
    out += `color:${color}${text.important};`;
  }

  if (pendingShorthand) {
    for (const [shorthand, role] of VAR_SHORTHANDS) {
      const value = style.getPropertyValue(shorthand);
      if (!value.includes('var(')) continue;
      const rewritten = rewriteValue(value, role, options);
      const important = forceImportant || style.getPropertyPriority(shorthand) ? '!important' : '';
      if (rewritten !== null) out += `${shorthand}:${rewritten}${important};`;
    }
  }
  return out;
}

function wrap(prelude: string, body: string): string {
  return body ? `${prelude}{${body}}` : '';
}

function importRule(rule: CSSImportRule, options: GenerateOptions): string {
  let body: string | null;
  try {
    body = rule.styleSheet ? generateRules(rule.styleSheet.cssRules, { ...options, baseUrl: rule.styleSheet.href }) : '';
  } catch {
    // Cross-origin import: its rules are only readable after the background fetched it.
    body = options.resolveImport?.(rule.styleSheet?.href ?? rule.href) ?? '';
  }
  if (rule.media.mediaText) body = wrap(`@media ${rule.media.mediaText}`, body);
  if (rule.supportsText) body = wrap(`@supports ${rule.supportsText}`, body);
  if (rule.layerName !== null) body = wrap(`@layer ${rule.layerName}`, body);
  return body;
}

/** Prelude of a grouping at-rule without a dedicated CSSOM accessor (@container, @scope…). */
function prelude(rule: CSSRule): string {
  const text = rule.cssText;
  return text.slice(0, text.indexOf('{')).trim();
}

/**
 * Mirror a rule list, keeping only color declarations, transformed. The
 * structure (media, supports, layers, nesting, imports) is reproduced so every
 * mirrored rule applies exactly where the original does; selectors are kept as
 * is, so specificity is identical and our later sheet wins ties.
 */
export function generateRules(rules: CSSRuleList, options: GenerateOptions): string {
  let out = '';
  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i]!;
    if (rule instanceof CSSStyleRule) {
      const nested = rule.cssRules?.length ? generateRules(rule.cssRules, options) : '';
      out += wrap(rule.selectorText, declarations(rule.style, options) + nested);
    } else if (rule instanceof CSSMediaRule) {
      out += wrap(`@media ${rule.media.mediaText}`, generateRules(rule.cssRules, options));
    } else if (rule instanceof CSSSupportsRule) {
      out += wrap(`@supports ${rule.conditionText}`, generateRules(rule.cssRules, options));
    } else if (rule instanceof CSSLayerBlockRule) {
      out += wrap(`@layer ${rule.name}`, generateRules(rule.cssRules, options));
    } else if (rule instanceof CSSImportRule) {
      out += importRule(rule, options);
    } else if ('style' in rule && !('selectorText' in rule) && rule.constructor.name === 'CSSNestedDeclarations') {
      out += declarations((rule as CSSRule & { style: CSSStyleDeclaration }).style, options);
    } else if (rule instanceof CSSGroupingRule && /^@(?:container|scope|starting-style)\b/.test(rule.cssText)) {
      out += wrap(prelude(rule), generateRules(rule.cssRules, options));
    }
  }
  return out;
}

import { ROLES, type Role } from './transform.ts';
import { channelTwins, rewriteValue, roleVariable, type RewriteOptions } from './value.ts';

export interface GenerateOptions extends RewriteOptions {
  /** Generated CSS for an `@import`ed sheet the page cannot read (cross-origin), or null if not loaded yet. */
  resolveImport?: (url: string) => string | null;
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

    const role = ROLE_BY_PROPERTY[property];
    if (!role) continue;
    if (!value) {
      pendingShorthand = true;
      continue;
    }
    if (property === 'background-image' && !value.includes('gradient') && !value.includes('var(')) continue;
    const rewritten = rewriteValue(value, role, options);
    if (rewritten !== null) out += `${property}:${rewritten}${important};`;
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

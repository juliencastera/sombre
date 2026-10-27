import { perceivedLightness } from '../shared/color/oklab.ts';
import { compositeOver } from '../shared/color/srgb.ts';
import type { Rgb } from '../shared/color/types.ts';
import { formatColor } from '../shared/color/parse.ts';
import { fixTextColor, requiredLc } from './contrast-math.ts';
import { canvasColor } from './native.ts';
import { resolveColorInBrowser } from './resolve-color.ts';
import { contrastTarget } from './transform.ts';

/** Attribute carrying a contrast fix (`#rrggbb` without `#`); styled by one rule per color. */
export const FIX_ATTRIBUTE = 'data-sombre-fix';

function parent(el: Element): Element | null {
  if (el.parentElement) return el.parentElement;
  const root = el.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}

/**
 * DOM-level contrast pass (spec §3, pass 2): text that the stylesheet mirrors
 * leave under the level's APCA floor — because its background comes from
 * another rule, an inline style, an ancestor — gets a per-color fix rule.
 * Only text near the viewport is examined, during idle time.
 */
export class ContrastPass {
  readonly #io: IntersectionObserver;
  readonly #visible = new Set<Element>();
  readonly #watched = new WeakSet<Element>();
  readonly #addRule: (el: Element, hex: string) => void;
  readonly #active: () => boolean;
  readonly #ignored: (el: Element) => boolean;
  #queued = false;

  constructor(addRule: (el: Element, hex: string) => void, active: () => boolean, ignored: (el: Element) => boolean) {
    this.#addRule = addRule;
    this.#active = active;
    this.#ignored = ignored;
    this.#io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) this.#visible.add(entry.target);
          else this.#visible.delete(entry.target);
        }
        this.schedule();
      },
      { rootMargin: '300px 0px' },
    );
  }

  /** Watch every element directly holding text under `root`. */
  watch(root: Node): void {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const el = node.parentElement;
      if (!el || this.#watched.has(el) || !node.nodeValue?.trim()) continue;
      if (el.localName === 'script' || el.localName === 'style' || el.localName === 'noscript') continue;
      this.#watched.add(el);
      this.#io.observe(el);
    }
  }

  /** Styles changed: re-evaluate what is on screen. */
  schedule(): void {
    if (this.#queued) return;
    this.#queued = true;
    requestIdleCallback(
      () => {
        this.#queued = false;
        this.#run();
      },
      { timeout: 300 },
    );
  }

  #run(): void {
    if (!this.#active()) return;
    const elements = [...this.#visible].filter((el) => el.isConnected && !this.#ignored(el));
    const canvas = canvasColor(document.documentElement, true);
    const backgrounds = new Map<Element, Rgb | null>();

    // Effective background through ancestors; null when an image, gradient or
    // filter makes it unknowable from colors alone.
    const backgroundOf = (el: Element | null): Rgb | null => {
      if (!el) return canvas;
      const cached = backgrounds.get(el);
      if (cached !== undefined) return cached;
      const style = getComputedStyle(el);
      let result: Rgb | null;
      if (style.backgroundImage !== 'none' || style.filter !== 'none' || style.mixBlendMode !== 'normal') result = null;
      else {
        const color = resolveColorInBrowser(style.backgroundColor);
        const below = color && color.a >= 1 ? null : backgroundOf(parent(el));
        result = color && color.a >= 1 ? color : color && color.a > 0 ? below && compositeOver(color, below) : below;
      }
      backgrounds.set(el, result);
      return result;
    };

    // Measure without previous fixes and re-apply in the same task: no frame shows the unfixed color.
    for (const el of elements) el.removeAttribute(FIX_ATTRIBUTE);
    const target = contrastTarget();
    const fixes: [Element, string][] = [];
    for (const el of elements) {
      const style = getComputedStyle(el);
      if (style.visibility !== 'visible') continue;
      const text = resolveColorInBrowser(style.color);
      const background = backgroundOf(el);
      if (!text || text.a === 0 || !background) continue;
      const required = requiredLc(target, parseFloat(style.fontSize), Number(style.fontWeight) || 400);
      // Light text on a light background was a deliberate design in light mode too (white on yellow…).
      if (perceivedLightness(background) > 0.6 && perceivedLightness(text) > 0.6) continue;
      const fixed = fixTextColor(compositeOver(text, background), background, required);
      if (fixed) fixes.push([el, formatColor({ ...fixed, a: 1 }).slice(1)]);
    }
    for (const [el, hex] of fixes) {
      this.#addRule(el, hex);
      el.setAttribute(FIX_ATTRIBUTE, hex);
    }
  }
}

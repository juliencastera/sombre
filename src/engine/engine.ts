import { formatColor } from '../shared/color/parse.ts';
import { generateRules, type GenerateOptions } from './generate.ts';
import { pageLooksDark } from './native.ts';
import { PRESENTATIONAL_ATTRIBUTES, PRESENTATIONAL_SELECTOR, presentationalRules } from './presentational.ts';
import { RemoteSheets } from './remote.ts';
import { resolveColorInBrowser } from './resolve-color.ts';
import { transformColor } from './transform.ts';

/** `off` disables the base layer; anything else (or absent) keeps it. See public/base-*.css. */
const STATE_ATTR = 'data-sombre';
/** Set once the precise theme is in place: lifts the base layer's "nothing light" guard. */
const READY_ATTR = 'data-sombre-ready';

const LINK_TIMEOUT_MS = 2000;
const REMOTE_TIMEOUT_MS = 2500;
const DOM_READY_TIMEOUT_MS = 1000;

const CANVAS = formatColor(transformColor({ r: 255, g: 255, b: 255, a: 1 }, 'bg'));
const CANVAS_TEXT = formatColor(transformColor({ r: 0, g: 0, b: 0, a: 1 }, 'fg'));
/** Defaults for pages that style nothing; zero specificity so any mirrored page rule wins. */
const BASE_RULES = `:where(:root){background-color:${CANVAS};color:${CANVAS_TEXT}}:root{color-scheme:dark!important}`;

const timeout = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function domReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return Promise.race([
    new Promise<void>((resolve) => document.addEventListener('DOMContentLoaded', () => resolve(), { once: true })),
    timeout(DOM_READY_TIMEOUT_MS),
  ]);
}

function pendingLinks(): Promise<unknown> {
  const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="stylesheet" i]')].filter(
    (link) => !link.sheet && !link.disabled,
  );
  const loads = links.map(
    (link) =>
      new Promise<void>((resolve) => {
        link.addEventListener('load', () => resolve(), { once: true });
        link.addEventListener('error', () => resolve(), { once: true });
      }),
  );
  return Promise.race([Promise.all(loads), timeout(LINK_TIMEOUT_MS)]);
}

const STYLE_SOURCES = `style,link,${PRESENTATIONAL_SELECTOR}`;

/** Whether adding or removing this node can change the generated CSS. */
function affectsStyles(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return node.matches(STYLE_SOURCES) || (node.firstElementChild !== null && node.querySelector(STYLE_SOURCES) !== null);
}

export interface EnableOptions {
  /** Cross-fade with a View Transition (user-initiated toggles only). */
  animate: boolean;
  /** The user forced dark on this site: do not defer to its native theme. */
  ignoreNative: boolean;
}

/**
 * Generates and maintains one adopted stylesheet mirroring every page
 * stylesheet with dark colors. Toggling flips one attribute and the sheet's
 * `disabled` flag in the same frame: a single style recalc, no regeneration.
 */
export class Engine {
  /** The page ships its own dark theme; the engine stays out of the way. */
  native = false;

  private readonly sheet = new CSSStyleSheet();
  private readonly generated = new WeakMap<CSSStyleSheet, { count: number; css: string }>();
  private readonly options: GenerateOptions;
  private readonly remote: RemoteSheets;
  private lastText = '';
  private on = false;
  private started: Promise<void> | null = null;
  private ready = false;
  private rebuildQueued = false;
  private readonly osDark: () => boolean;
  /** Called when the page turns out to ship its own dark theme. */
  private readonly onNative: () => void;

  constructor(osDark: () => boolean, onNative: () => void) {
    this.osDark = osDark;
    this.onNative = onNative;
    this.options = {
      resolveColor: resolveColorInBrowser,
      resolveImport: (url) => this.remote.get(url),
    };
    this.remote = new RemoteSheets(this.options, () => this.scheduleRebuild());
  }

  async setEnabled(on: boolean, options: EnableOptions): Promise<void> {
    this.on = on;
    if (on) {
      this.started ??= this.start(options.ignoreNative);
      await this.started;
    }
    this.render(options.animate && this.ready);
  }

  private render(animate: boolean): void {
    const active = this.on && !this.native;
    const apply = () => {
      const root = document.documentElement;
      root.setAttribute(STATE_ATTR, active ? 'on' : 'off');
      if (this.ready) root.setAttribute(READY_ATTR, '');
      this.sheet.disabled = !active;
    };
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && !reducedMotion && document.visibilityState === 'visible' && 'startViewTransition' in document) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
  }

  private async start(ignoreNative: boolean): Promise<void> {
    await domReady();
    await pendingLinks();

    if (!ignoreNative && this.looksNative()) {
      this.native = true;
      this.onNative();
      return;
    }

    this.rebuild();
    await Promise.race([this.remote.settled(), timeout(REMOTE_TIMEOUT_MS)]);
    this.rebuild();
    this.adopt();
    this.observe();
    this.ready = true;

    if (!ignoreNative) this.recheckNativeAfterLoad();
  }

  /** Evaluate the page's own colors with every Sombre style disabled. Synchronous: nothing paints meanwhile. */
  private looksNative(): boolean {
    const root = document.documentElement;
    const previous = root.getAttribute(STATE_ATTR);
    const wasDisabled = this.sheet.disabled;
    root.setAttribute(STATE_ATTR, 'off');
    this.sheet.disabled = true;
    try {
      return pageLooksDark(this.osDark());
    } finally {
      if (previous === null) root.removeAttribute(STATE_ATTR);
      else root.setAttribute(STATE_ATTR, previous);
      this.sheet.disabled = wasDisabled;
    }
  }

  /** Some sites apply their dark theme from script after DOMContentLoaded. */
  private recheckNativeAfterLoad(): void {
    const check = () => {
      if (!this.native && this.looksNative()) {
        this.native = true;
        this.onNative();
        this.render(false);
      }
    };
    if (document.readyState === 'complete') check();
    else addEventListener('load', check, { once: true });
  }

  private cssFor(sheet: CSSStyleSheet): string {
    if (sheet.disabled) return '';
    const media = sheet.media?.mediaText;
    const withMedia = (css: string) => (media && css ? `@media ${media}{${css}}` : css);

    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return sheet.href ? withMedia(this.remote.get(sheet.href) ?? '') : '';
    }
    const cached = this.generated.get(sheet);
    if (cached && cached.count === rules.length) return cached.css;
    const css = withMedia(generateRules(rules, { ...this.options, baseUrl: sheet.href }));
    this.generated.set(sheet, { count: rules.length, css });
    return css;
  }

  private rebuild(): void {
    this.rebuildQueued = false;
    let text = BASE_RULES + presentationalRules(document);
    for (const sheet of document.styleSheets) text += this.cssFor(sheet);
    for (const sheet of document.adoptedStyleSheets) if (sheet !== this.sheet) text += this.cssFor(sheet);
    if (text !== this.lastText) {
      this.sheet.replaceSync(text);
      this.lastText = text;
    }
    if (this.ready) this.adopt();
  }

  private scheduleRebuild(): void {
    if (this.rebuildQueued || !this.started || this.native) return;
    this.rebuildQueued = true;
    queueMicrotask(() => this.rebuild());
  }

  /** Keep our sheet last so it wins specificity ties against every page sheet. */
  private adopt(): void {
    const sheets = document.adoptedStyleSheets;
    if (sheets[sheets.length - 1] !== this.sheet) {
      document.adoptedStyleSheets = [...sheets.filter((sheet) => sheet !== this.sheet), this.sheet];
    }
  }

  private observe(): void {
    new MutationObserver((records) => {
      const dirty = records.some((record) => {
        if (record.type === 'characterData') return record.target.parentNode?.nodeName === 'STYLE';
        if (record.type === 'attributes') {
          return PRESENTATIONAL_ATTRIBUTES.includes(record.attributeName!) || affectsStyles(record.target);
        }
        return [...record.addedNodes, ...record.removedNodes].some(affectsStyles) || record.target.nodeName === 'STYLE';
      });
      if (dirty) this.scheduleRebuild();
    }).observe(document, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['rel', 'href', 'media', 'disabled', ...PRESENTATIONAL_ATTRIBUTES],
    });

    // Stylesheets finish loading after their <link> is inserted.
    const onLoad = (event: Event) => {
      if ((event.target as Node | null)?.nodeName === 'LINK') this.scheduleRebuild();
    };
    document.addEventListener('load', onLoad, true);
    document.addEventListener('error', onLoad, true);
  }
}

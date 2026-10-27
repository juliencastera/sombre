import { formatColor } from '../shared/color/parse.ts';
import type { ContrastLevel, NativeMarker } from '../shared/settings.ts';
import { ContrastPass } from './contrast.ts';
import type { GenerateOptions } from './generate.ts';
import { MirrorStore } from './mirrors.ts';
import { applyMarker, findNativeMarkers, pageLooksDark } from './native.ts';
import { resolveColorInBrowser } from './resolve-color.ts';
import { Scope, type ScopeContext } from './scope.ts';
import { contrastLevel, setContrastLevel, setPreserveDark, transformColor } from './transform.ts';

/** `off` disables the base layer; anything else (or absent) keeps it. See public/base-*.css. */
const STATE_ATTR = 'data-sombre';
/** Set once the precise theme is in place: lifts the base layer's "nothing light" guard. */
const READY_ATTR = 'data-sombre-ready';
/** Custom property set by the base layer; tells whether it is injected and active on this page. */
const BASE_MARKER = '--sombre-base';

/** Events dispatched by the MAIN-world hooks (src/entrypoints/main-world.content.ts). */
export const EVENTS = { sheet: 'sombre:sheet', shadow: 'sombre:shadow', adopted: 'sombre:adopted' } as const;

const LINK_TIMEOUT_MS = 2000;
const REMOTE_TIMEOUT_MS = 2500;
const DOM_READY_TIMEOUT_MS = 1000;

const canvas = () => formatColor(transformColor({ r: 255, g: 255, b: 255, a: 1 }, 'bg'));
const canvasText = () => formatColor(transformColor({ r: 0, g: 0, b: 0, a: 1 }, 'fg'));
const border = () => formatColor(transformColor({ r: 221, g: 221, b: 221, a: 1 }, 'border'));
/** Defaults for pages that style nothing; zero specificity so any mirrored page rule wins. */
const baseRules = () =>
  `:where(:root){background-color:${canvas()};color:${canvasText()}}:root{color-scheme:dark!important}`;
/** Shadow-root counterpart of the base layer's pre-ready guard (the base layer cannot pierce shadow roots). */
const guardRules = () =>
  `*{background-color:${canvas()}!important;color:${canvasText()}!important;border-color:${border()}!important}`;

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

export interface EnableOptions {
  /** Cross-fade with a View Transition (user-initiated toggles only). */
  animate: boolean;
  /** The user forced dark on this site: do not defer to its native theme. */
  ignoreNative: boolean;
}

/**
 * Generates and maintains dark mirrors of every page stylesheet, in the
 * document and in open shadow roots. Toggling flips one attribute and the
 * mirrors' `disabled` flags in the same frame: a single style recalc, no
 * regeneration.
 */
export class Engine {
  /** The page ships its own dark theme: the engine only fixes its light leftovers (preserve mode). */
  native = false;

  private readonly store: MirrorStore;
  private readonly guard = new CSSStyleSheet();
  private readonly context: ScopeContext;
  private readonly documentScope: Scope;
  private readonly shadowScopes = new WeakMap<ShadowRoot, Scope>();
  private readonly allScopes = new Set<WeakRef<Scope>>();
  private readonly pending = new Set<Scope>();
  private readonly osDark: () => boolean;
  private readonly onNative: (marker: NativeMarker | null) => void;
  private readonly contrast: ContrastPass;
  /** Marker Sombre applied to switch the site's own dark theme on. */
  private marker: NativeMarker | null = null;
  private on = false;
  private starting: Promise<void> | null = null;
  private started = false;
  private ready = false;
  private flushQueued = false;

  constructor(osDark: () => boolean, onNative: (marker: NativeMarker | null) => void) {
    this.osDark = osDark;
    this.onNative = onNative;
    const options: GenerateOptions = { resolveColor: resolveColorInBrowser };
    this.store = new MirrorStore(options, () => this.scheduleAll());
    this.guard.replaceSync(guardRules());
    this.contrast = new ContrastPass(
      (el, hex) => this.scopeOf(el.getRootNode())?.addFix(hex),
      () => this.on && this.ready,
    );
    this.context = {
      store: this.store,
      options,
      guard: this.guard,
      schedule: (scope) => this.schedule(scope),
      discoverShadowRoots: (node) => this.discoverShadowRoots(node),
      watchText: (node) => this.contrast.watch(node),
      baseRules,
    };
    this.documentScope = this.register(new Scope(document, this.context));
    this.listen();
  }

  /** Apply a contrast level; regenerates every mirror when it changes after start. */
  setContrast(level: ContrastLevel): void {
    if (level === contrastLevel()) return;
    setContrastLevel(level);
    this.regenerate();
  }

  /** Colors changed (contrast level, native mode): rebuild every Sombre sheet. */
  private regenerate(): void {
    this.guard.replaceSync(guardRules());
    this.store.invalidateAll();
    this.forEachScope((scope) => scope.reset());
    this.scheduleAll();
  }

  /** Native dark theme: keep its dark parts as designed, only fix light leftovers. */
  private setNative(native: boolean): void {
    if (native === this.native) return;
    this.native = native;
    setPreserveDark(native);
    if (this.started) this.regenerate();
  }

  /** Re-apply a marker remembered from a previous visit, before first paint. */
  applyRememberedMarker(marker: NativeMarker): void {
    this.marker = marker;
    if (!applyMarker(marker, true)) {
      document.addEventListener('DOMContentLoaded', () => applyMarker(marker, true), { once: true });
    }
  }

  async setEnabled(on: boolean, options: EnableOptions): Promise<void> {
    this.on = on;
    if (on) {
      this.starting ??= this.start(options.ignoreNative);
      await this.starting;
    }
    this.render(options.animate && this.ready);
  }

  private render(animate: boolean): void {
    const active = this.on;
    const apply = () => {
      const root = document.documentElement;
      root.setAttribute(STATE_ATTR, active ? 'on' : 'off');
      if (this.ready) root.setAttribute(READY_ATTR, '');
      this.store.setDisabled(!active);
      this.guard.disabled = !active || this.ready;
      if (this.marker) applyMarker(this.marker, this.on);
    };
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (animate && !reducedMotion && document.visibilityState === 'visible' && 'startViewTransition' in document) {
      document.startViewTransition(apply);
    } else {
      apply();
    }
    if (active && this.ready) this.contrast.schedule();
  }

  private async start(ignoreNative: boolean): Promise<void> {
    await domReady();
    await pendingLinks();

    if (!ignoreNative && (this.looksNative() || this.activateNativeTheme())) {
      this.setNative(true);
      this.onNative(this.marker);
    } else if (this.marker) {
      // A remembered marker no longer yields a dark page, or the user forced the engine.
      applyMarker(this.marker, false);
      this.marker = null;
    }
    await this.startEngine();
    if (!ignoreNative) this.recheckNativeAfterLoad();
  }

  private async startEngine(): Promise<void> {
    this.started = true;
    this.forEachScope((scope) => scope.start());
    await Promise.race([this.store.settled(), timeout(REMOTE_TIMEOUT_MS)]);
    this.flush();
    this.ready = true;
  }

  /** Try the site's own dark theme switches (`.dark`, `[data-theme="dark"]`…); keep the first that works. */
  private activateNativeTheme(): boolean {
    for (const marker of findNativeMarkers()) {
      if (!applyMarker(marker, true)) continue;
      if (this.looksNative()) {
        this.marker = marker;
        return true;
      }
      applyMarker(marker, false);
    }
    return false;
  }

  // ── Scopes ────────────────────────────────────────────────────────────────

  private register(scope: Scope): Scope {
    this.allScopes.add(new WeakRef(scope));
    return scope;
  }

  private forEachScope(fn: (scope: Scope) => void): void {
    for (const ref of this.allScopes) {
      const scope = ref.deref();
      if (scope) fn(scope);
      else this.allScopes.delete(ref);
    }
  }

  private scopeOf(root: Node): Scope | undefined {
    return root instanceof ShadowRoot ? this.shadowScopes.get(root) : this.documentScope;
  }

  private addShadowRoot(root: ShadowRoot): void {
    if (this.shadowScopes.has(root)) return;
    const scope = this.register(new Scope(root, this.context));
    this.shadowScopes.set(root, scope);
    if (!this.ready && this.baseActive()) scope.adoptGuard();
    if (this.started) scope.start();
  }

  private discoverShadowRoots(node: Node): void {
    if (node instanceof Element && node.shadowRoot) this.addShadowRoot(node.shadowRoot);
    if (!(node instanceof Element || node instanceof Document || node instanceof ShadowRoot)) return;
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.nextNode() as Element | null; el; el = walker.nextNode() as Element | null) {
      if (el.shadowRoot) this.addShadowRoot(el.shadowRoot);
    }
  }

  /** Whether the base layer is injected and active (it sets a marker custom property). */
  private baseActive(): boolean {
    return getComputedStyle(document.documentElement).getPropertyValue(BASE_MARKER).trim() !== '';
  }

  // ── Rebuild scheduling ────────────────────────────────────────────────────

  private schedule(scope: Scope): void {
    if (!this.started) return;
    this.pending.add(scope);
    if (this.flushQueued) return;
    this.flushQueued = true;
    // Microtask: mutations from one task are mirrored before the next paint.
    queueMicrotask(() => this.flush());
  }

  private scheduleAll(): void {
    this.forEachScope((scope) => this.schedule(scope));
  }

  private flush(): void {
    this.flushQueued = false;
    const scopes = [...this.pending];
    this.pending.clear();
    for (const scope of scopes) scope.rebuild();
    if (this.ready) this.contrast.schedule();
  }

  /** Signals from the MAIN-world hooks, which see what the page does to the CSSOM. */
  private listen(): void {
    const origin = (event: Event) => event.composedPath()[0] as Node | undefined;
    document.addEventListener(
      EVENTS.sheet,
      (event) => {
        const target = origin(event);
        if (target instanceof HTMLStyleElement || target instanceof SVGStyleElement || target instanceof HTMLLinkElement) {
          this.store.markDirty(target.sheet);
          const scope = this.scopeOf(target.getRootNode());
          if (scope) this.schedule(scope);
        } else {
          this.store.markConstructedDirty();
          this.scheduleAll();
        }
      },
      true,
    );
    document.addEventListener(
      EVENTS.shadow,
      (event) => {
        const host = origin(event);
        if (host instanceof Element && host.shadowRoot) this.addShadowRoot(host.shadowRoot);
      },
      true,
    );
    document.addEventListener(
      EVENTS.adopted,
      (event) => {
        // The page reassigned adoptedStyleSheets: put our mirrors back last.
        const target = origin(event);
        const scope = target instanceof Element && target.shadowRoot ? this.shadowScopes.get(target.shadowRoot) : this.documentScope;
        if (scope) this.schedule(scope);
      },
      true,
    );
    // Stylesheets finish loading after their <link> is inserted.
    const onLinkLoad = (event: Event) => {
      const target = event.target as Node | null;
      if (target?.nodeName !== 'LINK') return;
      const scope = this.scopeOf(target.getRootNode());
      if (scope) this.schedule(scope);
    };
    document.addEventListener('load', onLinkLoad, true);
    document.addEventListener('error', onLinkLoad, true);
  }

  // ── Native dark themes ────────────────────────────────────────────────────

  /** Evaluate the page's own colors with every Sombre style disabled. Synchronous: nothing paints meanwhile. */
  private looksNative(canvasOnly = false): boolean {
    const root = document.documentElement;
    const previous = root.getAttribute(STATE_ATTR);
    const guardDisabled = this.guard.disabled;
    root.setAttribute(STATE_ATTR, 'off');
    this.store.setDisabled(true);
    this.guard.disabled = true;
    try {
      return pageLooksDark(this.osDark(), canvasOnly);
    } finally {
      if (previous === null) root.removeAttribute(STATE_ATTR);
      else root.setAttribute(STATE_ATTR, previous);
      this.store.setDisabled(!(this.on && this.ready));
      this.guard.disabled = guardDisabled;
    }
  }

  /**
   * After `load`: some sites apply their dark theme from script, and some reset
   * the class or attribute Sombre used to switch theirs on.
   */
  private recheckNativeAfterLoad(): void {
    const check = () => {
      if (!this.on) return;
      // While native, only the page canvas counts: a light overlay (consent wall) is not the site dropping its theme.
      const dark = this.looksNative(this.native);
      if (!this.native && dark) {
        this.setNative(true);
        this.onNative(null);
      } else if (this.native && !dark) {
        if (this.marker) applyMarker(this.marker, false);
        this.marker = null;
        this.setNative(false);
      }
    };
    if (document.readyState === 'complete') check();
    else addEventListener('load', check, { once: true });
  }
}

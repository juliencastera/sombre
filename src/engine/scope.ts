import { AttributeStyles, STYLE_ATTRIBUTES } from './attributes.ts';
import type { GenerateOptions } from './generate.ts';
import type { MirrorStore } from './mirrors.ts';

export interface ScopeContext {
  store: MirrorStore;
  options: GenerateOptions;
  /** Shared sheet forcing shadow content dark until the engine is ready. */
  guard: CSSStyleSheet;
  schedule(scope: Scope): void;
  /** Register open shadow roots found in `node`'s subtree (and `node` itself). */
  discoverShadowRoots(node: Node): void;
}

const SOURCE_SELECTOR = 'style,link';

function isStyleSource(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  return node.matches(SOURCE_SELECTOR) || (node.firstElementChild !== null && node.querySelector(SOURCE_SELECTOR) !== null);
}

function sameSheets(a: readonly CSSStyleSheet[], b: readonly CSSStyleSheet[]): boolean {
  return a.length === b.length && a.every((sheet, i) => sheet === b[i]);
}

/**
 * A style scope: the document or one open shadow root. Stylesheets do not cross
 * shadow boundaries, so each scope adopts its own mirrors, after the page's.
 */
export class Scope {
  readonly root: Document | ShadowRoot;
  private readonly context: ScopeContext;
  private readonly attributes: AttributeStyles;
  /** Document-only defaults for pages that style nothing. */
  private readonly base: CSSStyleSheet | null;
  private started = false;

  constructor(root: Document | ShadowRoot, context: ScopeContext, baseCss?: string) {
    this.root = root;
    this.context = context;
    this.base = baseCss ? context.store.create(baseCss) : null;
    this.attributes = new AttributeStyles(context.store.create(), context.options);
  }

  /** Adopt the pre-ready guard right away, before the page fills this shadow root. */
  adoptGuard(): void {
    const sheets = this.root.adoptedStyleSheets;
    if (!sheets.includes(this.context.guard)) this.root.adoptedStyleSheets = [...sheets, this.context.guard];
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.attributes.scan(this.root);
    this.context.discoverShadowRoots(this.root);
    new MutationObserver((records) => this.onMutations(records)).observe(this.root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...STYLE_ATTRIBUTES, 'rel', 'href', 'media', 'disabled'],
    });
    this.rebuild();
  }

  rebuild(): void {
    if (!this.started) return;
    const { store, guard } = this.context;
    const page = this.root.adoptedStyleSheets.filter((sheet) => !store.isOurs(sheet) && sheet !== guard);
    const ours: CSSStyleSheet[] = [];
    if (this.base) ours.push(this.base);
    ours.push(this.attributes.sheet);
    for (const source of [...this.root.styleSheets, ...page]) {
      const mirror = store.mirrorOf(source);
      if (mirror) ours.push(mirror);
    }
    const hasGuard = this.root.adoptedStyleSheets.includes(guard);
    // Ours last: mirrors win every specificity tie against the page.
    const next = [...page, ...(hasGuard ? [guard] : []), ...ours];
    if (!sameSheets(this.root.adoptedStyleSheets, next)) this.root.adoptedStyleSheets = next;
  }

  private onMutations(records: MutationRecord[]): void {
    let dirty = false;
    for (const record of records) {
      if (record.type === 'attributes') {
        const target = record.target as Element;
        if (STYLE_ATTRIBUTES.includes(record.attributeName!)) this.attributes.process(target);
        else if (target.localName === 'link' || target.localName === 'style') dirty = true;
      } else if (record.type === 'characterData') {
        if (record.target.parentNode?.nodeName === 'STYLE') dirty = true;
      } else {
        if (record.target.nodeName === 'STYLE') dirty = true;
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          this.attributes.scan(node);
          this.context.discoverShadowRoots(node);
          if (isStyleSource(node)) dirty = true;
        }
        for (const node of record.removedNodes) if (isStyleSource(node)) dirty = true;
      }
    }
    if (dirty) this.context.schedule(this);
  }
}

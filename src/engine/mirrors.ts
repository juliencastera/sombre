import { generateRules, type GenerateOptions } from './generate.ts';
import { RemoteSheets } from './remote.ts';

interface Entry {
  sheet: CSSStyleSheet;
  css: string;
  /** Rule count at generation: a cheap change signal when no mutation event arrived. */
  count: number;
  dirty: boolean;
  /** Constructed-sheet epoch at generation (see `markConstructedDirty`). */
  epoch: number;
}

/**
 * Owns every stylesheet Sombre creates. Each page stylesheet gets its own
 * mirror, so a change (a CSS-in-JS insertRule) regenerates only that mirror,
 * and a source shared by many shadow roots (Lit) shares one mirror too.
 */
export class MirrorStore {
  private readonly entries = new WeakMap<CSSStyleSheet, Entry>();
  private readonly ours = new WeakSet<CSSStyleSheet>();
  private readonly all = new Set<WeakRef<CSSStyleSheet>>();
  private readonly options: GenerateOptions;
  private readonly remote: RemoteSheets;
  private disabled = true;
  private epoch = 0;

  constructor(options: GenerateOptions, onRemoteLoaded: () => void) {
    this.remote = new RemoteSheets(options, () => {
      // Cross-origin mirrors were generated empty while their text was in flight.
      this.epoch++;
      onRemoteLoaded();
    });
    this.options = { ...options, resolveImport: (url) => this.remote.get(url) };
  }

  /** A new Sombre-owned sheet, enabled or disabled like all the others. */
  create(css = ''): CSSStyleSheet {
    const sheet = new CSSStyleSheet();
    if (css) sheet.replaceSync(css);
    sheet.disabled = this.disabled;
    this.ours.add(sheet);
    this.all.add(new WeakRef(sheet));
    return sheet;
  }

  isOurs(sheet: CSSStyleSheet): boolean {
    return this.ours.has(sheet);
  }

  /** Enable or disable every Sombre sheet at once (same task: one style recalc). */
  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
    for (const ref of this.all) {
      const sheet = ref.deref();
      if (sheet) sheet.disabled = disabled;
      else this.all.delete(ref);
    }
  }

  markDirty(source: CSSStyleSheet | null | undefined): void {
    const entry = source && this.entries.get(source);
    if (entry) entry.dirty = true;
  }

  /** A constructed sheet changed but its owner is unknown: regenerate constructed and remote mirrors. */
  markConstructedDirty(): void {
    this.epoch++;
  }

  settled(): Promise<void> {
    return this.remote.settled();
  }

  /** The up-to-date mirror of `source`, or null when it has no color rules. */
  mirrorOf(source: CSSStyleSheet): CSSStyleSheet | null {
    if (source.disabled) return null;
    const entry = this.entries.get(source);
    let rules: CSSRuleList | null = null;
    try {
      rules = source.cssRules;
    } catch {
      // Cross-origin: generated from text fetched by the background.
    }
    const constructed = !source.ownerNode && !source.href;
    const count = rules?.length ?? -1;
    const fresh =
      entry &&
      !entry.dirty &&
      entry.count === count &&
      (!(constructed || !rules) || entry.epoch === this.epoch);
    if (fresh) return entry.css ? entry.sheet : null;

    const media = source.media?.mediaText;
    let css = rules
      ? generateRules(rules, { ...this.options, baseUrl: source.href })
      : source.href
        ? (this.remote.get(source.href) ?? '')
        : '';
    if (media && css) css = `@media ${media}{${css}}`;

    const sheet = entry?.sheet ?? this.create();
    if (entry?.css !== css) sheet.replaceSync(css);
    this.entries.set(source, { sheet, css, count, dirty: false, epoch: this.epoch });
    return css ? sheet : null;
  }
}

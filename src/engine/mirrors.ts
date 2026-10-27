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
  /** Store generation at generation (see `invalidateAll`). */
  generation: number;
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
  /** Mirrors generated from fetched text for <link>s the browser has not applied yet. */
  private readonly early = new Map<string, CSSStyleSheet>();
  private readonly options: GenerateOptions;
  private readonly remote: RemoteSheets;
  private disabled = true;
  private epoch = 0;
  private generation = 0;

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

  /** Every mirror must be regenerated (the contrast level changed). */
  invalidateAll(): void {
    this.generation++;
    this.remote.reset();
    this.early.clear();
  }

  /**
   * Start fetching a stylesheet as soon as its <link> appears, in parallel with
   * the browser, so its mirror can be in place before the sheet applies.
   */
  prefetch(link: HTMLLinkElement): void {
    if (/\bstylesheet\b/i.test(link.rel) && link.href && !link.sheet) this.remote.get(link.href);
  }

  /**
   * Mirror of a <link> still loading, generated from its fetched text: adopted
   * ahead of time, it is already there in the frame where the page sheet first
   * applies, so late stylesheets (consent walls, lazy chunks) never flash.
   */
  earlyMirrorOf(link: HTMLLinkElement): CSSStyleSheet | null {
    if (!link.href || link.disabled || link.sheet) return null;
    const css = this.remote.get(link.href);
    if (!css) return null;
    const media = link.media && link.media !== 'all' ? link.media : '';
    const key = `${media}|${link.href}`;
    let sheet = this.early.get(key);
    if (!sheet) {
      sheet = this.create(media ? `@media ${media}{${css}}` : css);
      this.early.set(key, sheet);
    }
    return sheet;
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
      entry.generation === this.generation &&
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
    this.entries.set(source, { sheet, css, count, dirty: false, epoch: this.epoch, generation: this.generation });
    return css ? sheet : null;
  }
}

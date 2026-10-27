import { browser } from 'wxt/browser';
import type { FetchImageRequest, FetchResponse } from '../shared/messages.ts';

/**
 * Dark icons on transparent backgrounds (spec §4) vanish once the page around
 * them is dark. As in Dark Reader, CSS background images are analyzed and the
 * dark, partly transparent, not large ones are swapped for an inverted copy.
 * Mirrors reference each image through a custom property that is only defined
 * once its analysis says "invert": results never require regenerating a mirror.
 */

/** Side of the canvas an image is sampled on. */
const SAMPLE = 32;
/** Natural pixel count from which an image is a photo or a banner, never an icon. */
const LARGE = 480_000;
const INVERT = 'invert(1) hue-rotate(180deg)';
/** Analysis result: leave the image alone. */
const KEEP = '-';
/** Prefix of icon results in the per-site cache, next to stylesheet URLs. */
export const ICON_CACHE_PREFIX = 'icon:';

/** Custom property standing for the dark-mode version of the image at `url`. */
export function iconVariable(url: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) hash = Math.imul(hash ^ url.charCodeAt(i), 0x01000193);
  return `--sombre-icon-${(hash >>> 0).toString(36)}`;
}

/** Same thresholds as Dark Reader: mostly dark where opaque, and some transparency around. */
function isDarkIcon(img: HTMLImageElement): boolean {
  const context = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
  context.canvas.width = context.canvas.height = SAMPLE;
  context.drawImage(img, 0, 0, SAMPLE, SAMPLE);
  const { data } = context.getImageData(0, 0, SAMPLE, SAMPLE);
  let transparent = 0;
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 13) transparent++;
    else if (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]! < 102) dark++;
  }
  const opaque = SAMPLE * SAMPLE - transparent;
  return opaque > 0 && dark / opaque >= 0.7 && transparent / (SAMPLE * SAMPLE) >= 0.1;
}

/** The inverted copy, with the original's intrinsic size: an SVG stays vector. */
function invert(src: string, img: HTMLImageElement): string {
  const comma = src.indexOf(',');
  if (/^data:image\/svg\+xml/i.test(src)) {
    // Byte strings both ways, so any encoding of the source survives.
    const body = src.slice(comma + 1);
    const bytes = /;base64$/i.test(src.slice(0, comma)) ? atob(body) : unescape(body);
    return `data:image/svg+xml;base64,${btoa(bytes.replace(/<svg\b[^>]*>/, (tag) => `${tag}<style>:root{filter:${INVERT}}</style>`))}`;
  }
  const context = document.createElement('canvas').getContext('2d')!;
  context.canvas.width = img.naturalWidth;
  context.canvas.height = img.naturalHeight;
  context.filter = INVERT;
  context.drawImage(img, 0, 0);
  return context.canvas.toDataURL();
}

async function analyze(url: string): Promise<string> {
  let src = url;
  if (!url.startsWith('data:')) {
    // The page's images are cross-origin for a canvas: the background fetches them.
    const request: FetchImageRequest = { type: 'sombre:fetch-image', url };
    const response: FetchResponse = await browser.runtime.sendMessage(request);
    if (!response?.ok) return KEEP;
    src = response.text;
  }
  const img = new Image();
  img.src = src;
  await img.decode();
  const { naturalWidth: width, naturalHeight: height } = img;
  return width > 2 && height > 2 && width * height < LARGE && isDarkIcon(img) ? invert(src, img) : KEEP;
}

export class DarkIcons {
  /** Defines the custom property of every image to invert; adopted by the document. */
  readonly sheet: CSSStyleSheet;
  /** Result by custom property: an inverted data URL, or KEEP. */
  readonly #done = new Map<string, string>();
  readonly #pending = new Map<string, Promise<void>>();

  constructor(sheet: CSSStyleSheet) {
    this.sheet = sheet;
  }

  /** Custom property to use for the image at `url` (its analysis starts on first call), or null to leave it. */
  use(url: string): string | null {
    // JPEGs have no transparency, other schemes (blob:…) cannot be fetched.
    if (!/^(?:https?|data):/i.test(url) || /^data:image\/jpe?g|\.jpe?g(?:[?#]|$)/i.test(url)) return null;
    const key = iconVariable(url);
    const done = this.#done.get(key);
    if (done === undefined && !this.#pending.has(key)) {
      const task = analyze(url)
        .catch(() => KEEP)
        .then((result) => {
          this.#pending.delete(key);
          this.#set(key, result);
        });
      this.#pending.set(key, task);
    }
    return done === KEEP ? null : key;
  }

  /** Resolves once every analysis started so far is done. */
  async settled(): Promise<void> {
    while (this.#pending.size) await Promise.all(this.#pending.values());
  }

  /** Results from a previous visit (see snapshot). */
  seed(cached: Record<string, string>): void {
    for (const [key, result] of Object.entries(cached)) {
      if (key.startsWith(ICON_CACHE_PREFIX) && !this.#done.has(key.slice(ICON_CACHE_PREFIX.length))) {
        this.#set(key.slice(ICON_CACHE_PREFIX.length), result);
      }
    }
  }

  /** Results for the per-site cache, keyed apart from stylesheet URLs. */
  snapshot(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, result] of this.#done) out[ICON_CACHE_PREFIX + key] = result;
    return out;
  }

  #set(key: string, result: string): void {
    this.#done.set(key, result);
    if (result !== KEEP) this.sheet.insertRule(`:root{${key}:url(${JSON.stringify(result)})}`, this.sheet.cssRules.length);
  }
}

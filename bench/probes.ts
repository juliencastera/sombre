/**
 * Functions evaluated inside the page via `page.evaluate`. Playwright serializes
 * them with `toString()`, so each one must be fully self-contained: no imports,
 * no references to module scope.
 */

export type RgbaTuple = [number, number, number, number];
export type RgbTuple = [number, number, number];

export interface TextSample {
  text: RgbaTuple;
  /** Effective opaque background behind the text, resolved through ancestors. */
  background: RgbTuple;
  fontSize: number;
  fontWeight: number;
  chars: number;
  /** Background could not be resolved from colors alone (image, gradient, filter, blend). */
  uncertain: boolean;
  label: string;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Sample visible text elements in the top document (and open shadow roots) with their effective backgrounds. */
export function collectTextSamples(maxSamples: number): TextSample[] {
  const ctx = new OffscreenCanvas(1, 1).getContext('2d', { willReadFrequently: true })!;
  const colorCache = new Map<string, RgbaTuple>();

  function toRgba(value: string): RgbaTuple {
    const cached = colorCache.get(value);
    if (cached) return cached;
    let result: RgbaTuple;
    const match = /^rgba?\(([^)]+)\)$/.exec(value);
    if (match) {
      const parts = match[1]!
        .split(/[\s,/]+/)
        .filter(Boolean)
        .map(parseFloat);
      result = [parts[0]!, parts[1]!, parts[2]!, parts[3] ?? 1];
    } else {
      // Any other color syntax (oklch(), color(), system colors): let the canvas resolve it.
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = '#000';
      ctx.fillStyle = value;
      ctx.fillRect(0, 0, 1, 1);
      const data = ctx.getImageData(0, 0, 1, 1).data;
      result = [data[0]!, data[1]!, data[2]!, data[3]! / 255];
    }
    colorCache.set(value, result);
    return result;
  }

  function over(top: RgbaTuple, below: RgbTuple): RgbTuple {
    const a = top[3];
    return [top[0] * a + below[0] * (1 - a), top[1] * a + below[1] * (1 - a), top[2] * a + below[2] * (1 - a)];
  }

  function parentOf(el: Element): Element | null {
    if (el.parentElement) return el.parentElement;
    const root = el.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }

  // The canvas color shown when nothing on the ancestor chain paints a background.
  const canvasProbe = document.createElement('div');
  canvasProbe.style.cssText = 'position:absolute;width:0;height:0;background-color:Canvas';
  document.documentElement.appendChild(canvasProbe);
  const canvasColor = toRgba(getComputedStyle(canvasProbe).backgroundColor);
  canvasProbe.remove();
  const canvasRgb: RgbTuple = [canvasColor[0], canvasColor[1], canvasColor[2]];

  function effectiveBackground(el: Element): { color: RgbTuple; uncertain: boolean } {
    const layers: RgbaTuple[] = [];
    let uncertain = false;
    for (let node: Element | null = el; node; node = parentOf(node)) {
      const style = getComputedStyle(node);
      if (style.filter !== 'none' || style.mixBlendMode !== 'normal' || style.backdropFilter !== 'none') {
        uncertain = true;
      }
      const color = toRgba(style.backgroundColor);
      if (style.backgroundImage !== 'none' && color[3] < 1) uncertain = true;
      if (color[3] > 0) layers.push(color);
      if (color[3] >= 1) break;
    }
    let result = canvasRgb;
    for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i]!, result);
    return { color: result, uncertain };
  }

  function label(el: Element): string {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 40);
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''} "${text}"`;
  }

  const vw = innerWidth;
  const vh = innerHeight;
  const seen = new Set<Element>();
  const samples: TextSample[] = [];
  const roots: (Document | ShadowRoot)[] = [document];

  for (let r = 0; r < roots.length; r++) {
    const root = roots[r]!;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node instanceof Element) {
        if (node.shadowRoot) roots.push(node.shadowRoot);
        continue;
      }
      const el = node.parentElement;
      if (!el || seen.has(el) || !node.textContent?.trim()) continue;
      if (el.closest('script, style, noscript, template, title')) continue;

      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) continue;
      if (rect.bottom <= 0 || rect.right <= 0 || rect.top >= vh || rect.left >= vw) continue;

      const style = getComputedStyle(el);
      if (style.visibility !== 'visible' || style.opacity === '0') continue;
      const text = toRgba(style.color);
      if (text[3] === 0) continue;

      // Skip text covered by something else (cookie banners, modals, sticky headers).
      const cx = Math.min(Math.max(rect.left + rect.width / 2, 0), vw - 1);
      const cy = Math.min(Math.max(rect.top + rect.height / 2, 0), vh - 1);
      const hit = (el.getRootNode() as Document | ShadowRoot).elementFromPoint(cx, cy);
      if (!hit || !(hit === el || el.contains(hit) || hit.contains(el))) continue;

      seen.add(el);
      const bg = effectiveBackground(el);
      samples.push({
        text,
        background: bg.color,
        fontSize: parseFloat(style.fontSize),
        fontWeight: Number(style.fontWeight) || 400,
        chars: node.textContent.trim().length,
        uncertain: bg.uncertain,
        label: label(el),
      });
      if (samples.length >= maxSamples) return samples;
    }
  }
  return samples;
}

/** Viewport rects of media and background images, excluded from bright-area measurement. */
export function collectMediaRects(): Rect[] {
  const rects: Rect[] = [];
  const add = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth) {
      rects.push({ x: r.left, y: r.top, width: r.width, height: r.height });
    }
  };
  document.querySelectorAll('img, video, canvas, picture, embed, object, svg image').forEach(add);
  document.querySelectorAll('body *').forEach((el) => {
    if (getComputedStyle(el).backgroundImage.includes('url(')) add(el);
  });
  return rects;
}

/**
 * Track computed colors of a fixed set of elements (a viewport grid + root/body) on
 * every animation frame and record when they last changed. Used to time toggles.
 */
export function installStabilityWatcher(): void {
  const els = new Set<Element>([document.documentElement]);
  if (document.body) els.add(document.body);
  for (let gx = 0; gx < 8; gx++) {
    for (let gy = 0; gy < 5; gy++) {
      const el = document.elementFromPoint(((gx + 0.5) * innerWidth) / 8, ((gy + 0.5) * innerHeight) / 5);
      if (el) els.add(el);
    }
  }
  const tracked = [...els];
  const fingerprint = () =>
    tracked
      .map((el) => {
        const s = getComputedStyle(el);
        return `${s.color}|${s.backgroundColor}|${s.borderTopColor}`;
      })
      .join(';');

  const state = { lastChange: 0, running: true };
  (window as unknown as { __sombreBench: typeof state }).__sombreBench = state;
  let previous = fingerprint();
  const tick = () => {
    if (!state.running) return;
    const current = fingerprint();
    if (current !== previous) {
      state.lastChange = Date.now();
      previous = current;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function readStabilityWatcher(): number {
  return (window as unknown as { __sombreBench: { lastChange: number } }).__sombreBench.lastChange;
}

export function resetStabilityWatcher(): void {
  (window as unknown as { __sombreBench: { lastChange: number } }).__sombreBench.lastChange = 0;
}

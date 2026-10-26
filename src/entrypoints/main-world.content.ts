/**
 * Runs in the page's own JavaScript world, before page scripts, to see CSSOM
 * changes no MutationObserver reports: CSS-in-JS `insertRule`, constructed
 * sheets, shadow roots, `adoptedStyleSheets` reassignments. It only notifies
 * the engine (isolated world) through DOM events; it never reads page data.
 * Event names must match EVENTS in src/engine/engine.ts (no shared import: this
 * bundle must stay tiny).
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchOriginAsFallback: true,
  world: 'MAIN',

  main() {
    const notify = (target: EventTarget, type: string) => {
      target.dispatchEvent(new CustomEvent(type, { bubbles: true, composed: true }));
    };
    const sheetChanged = (sheet: CSSStyleSheet | null | undefined) => {
      if (sheet) notify(sheet.ownerNode ?? document, 'sombre:sheet');
    };

    /** Call `after` once the original method returned; keeps the original's name and arity. */
    const hook = (proto: object, name: string, after: (self: any, result: unknown) => void) => {
      const descriptor = Object.getOwnPropertyDescriptor(proto, name);
      if (typeof descriptor?.value !== 'function') return;
      const original = descriptor.value as (...args: unknown[]) => unknown;
      const wrapped = {
        [name](this: unknown, ...args: unknown[]) {
          const result = original.apply(this, args);
          try {
            after(this, result);
          } catch {
            // Never break the page because of a notification.
          }
          return result;
        },
      }[name]!;
      Object.defineProperty(wrapped, 'length', { value: original.length });
      Object.defineProperty(proto, name, { ...descriptor, value: wrapped });
    };

    for (const name of ['insertRule', 'deleteRule', 'replaceSync', 'addRule', 'removeRule']) {
      hook(CSSStyleSheet.prototype, name, (sheet) => sheetChanged(sheet));
    }
    hook(CSSStyleSheet.prototype, 'replace', (sheet, result) => {
      (result as Promise<unknown>).then(() => sheetChanged(sheet), () => {});
    });
    for (const name of ['insertRule', 'deleteRule']) {
      hook(CSSGroupingRule.prototype, name, (rule) => sheetChanged(rule.parentStyleSheet));
    }
    hook(Element.prototype, 'attachShadow', (host) => notify(host, 'sombre:shadow'));

    for (const proto of [Document.prototype, ShadowRoot.prototype]) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, 'adoptedStyleSheets');
      const set = descriptor?.set;
      if (!descriptor || !set) continue;
      Object.defineProperty(proto, 'adoptedStyleSheets', {
        ...descriptor,
        set(this: Document | ShadowRoot, value: CSSStyleSheet[]) {
          set.call(this, value);
          notify(this instanceof ShadowRoot ? this.host : this, 'sombre:adopted');
        },
      });
    }
  },
});

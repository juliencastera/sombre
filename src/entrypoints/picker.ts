import { selectorFor } from '../engine/selector.ts';
import { LOCAL_FIXES_KEY, validateFix, validateSites, type FixAction } from '../shared/fixes.ts';
import { t } from '../shared/i18n.ts';
import { siteKey } from '../shared/settings.ts';

const STYLE = `
:host { all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; }
* { box-sizing: border-box; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
.box { position: fixed; display: none; border: 2px solid #8fb3ff; background: rgb(143 179 255 / 0.14); border-radius: 3px; }
.hint, .panel { position: fixed; pointer-events: auto; background: #1b1c20; color: #ececef;
  border: 1px solid #33353c; border-radius: 10px; box-shadow: 0 8px 24px rgb(0 0 0 / 0.45); }
.hint { left: 50%; bottom: 20px; transform: translateX(-50%); padding: 8px 14px; color: #a4a6ae; }
.panel { display: none; gap: 4px; padding: 6px; }
.panel.open { display: flex; }
button { border: 0; border-radius: 7px; padding: 7px 10px; background: #232429; color: #ececef; cursor: pointer; }
button:hover, button:focus-visible { background: #33353c; outline: none; }
button.cancel { background: transparent; color: #a4a6ae; }
`;

/**
 * Element picker (spec §8), injected on demand by the popup: hover outlines an
 * element, a click selects it, and one of three actions saves a fix for this
 * site — three clicks from the popup. The engine applies it as soon as it is
 * stored.
 */
export default defineUnlistedScript(() => {
  const state = globalThis as { sombrePicking?: boolean };
  if (state.sombrePicking) return;
  state.sombrePicking = true;

  const host = document.createElement('sombre-picker');
  host.setAttribute('data-sombre-ui', '');
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>${STYLE}</style><div class="box"></div><div class="panel" role="toolbar"></div><div class="hint"></div>`;
  const box = root.querySelector<HTMLElement>('.box')!;
  const panel = root.querySelector<HTMLElement>('.panel')!;
  root.querySelector('.hint')!.textContent = t('pickerHint');
  document.documentElement.append(host);

  let hovered: Element | null = null;
  let selected: Element | null = null;

  const outline = (el: Element) => {
    const r = el.getBoundingClientRect();
    Object.assign(box.style, { display: 'block', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
  };

  const inUi = (event: Event) => event.composedPath().includes(host);

  const actions: [FixAction | null, string][] = [
    ['ignore', t('fixIgnore')],
    ['invert', t('fixInvert')],
    ['force-dark', t('fixForceDark')],
    [null, t('cancel')],
  ];
  for (const [action, label] of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (!action) button.className = 'cancel';
    button.addEventListener('click', () => (action && selected ? void save(selected, action) : stop()));
    panel.append(button);
  }

  const openPanel = (el: Element) => {
    selected = el;
    outline(el);
    panel.classList.add('open');
    const r = el.getBoundingClientRect();
    const { width, height } = panel.getBoundingClientRect();
    const top = r.bottom + 8 + height < innerHeight ? r.bottom + 8 : Math.max(8, r.top - height - 8);
    const left = Math.min(Math.max(8, r.left), innerWidth - width - 8);
    Object.assign(panel.style, { top: `${top}px`, left: `${left}px` });
    panel.querySelector('button')?.focus();
  };

  const onMove = (event: PointerEvent) => {
    if (selected || inUi(event)) return;
    const el = document.elementFromPoint(event.clientX, event.clientY);
    if (!el || el === host || el === document.documentElement) return;
    hovered = el;
    outline(el);
  };

  // Clicks and presses on the page select instead of reaching the site.
  const onPress = (event: Event) => {
    if (inUi(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type !== 'click') return;
    if (selected) {
      // A click elsewhere drops the selection and resumes hovering.
      selected = null;
      panel.classList.remove('open');
    } else if (hovered) {
      openPanel(hovered);
    }
  };

  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stop();
  };

  const pressEvents = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'auxclick', 'contextmenu'];
  addEventListener('pointermove', onMove, true);
  for (const type of pressEvents) addEventListener(type, onPress, true);
  addEventListener('keydown', onKey, true);

  function stop() {
    removeEventListener('pointermove', onMove, true);
    for (const type of pressEvents) removeEventListener(type, onPress, true);
    removeEventListener('keydown', onKey, true);
    host.remove();
    state.sombrePicking = false;
  }

  async function save(el: Element, action: FixAction) {
    const fix = validateFix({ selector: selectorFor(el), action });
    stop();
    if (!fix) return;
    const key = siteKey(location.hostname);
    const sites = validateSites((await browser.storage.local.get(LOCAL_FIXES_KEY))[LOCAL_FIXES_KEY]);
    // One fix per selector: picking again replaces the action.
    sites[key] = [...(sites[key] ?? []).filter((existing) => existing.selector !== fix.selector), fix];
    await browser.storage.local.set({ [LOCAL_FIXES_KEY]: sites });
  }
});

import { formatColor } from '../shared/color/parse.ts';
import { TONES, type Tone } from '../shared/settings.ts';
import { setTone, transformColor } from './transform.ts';

/** Published path of a base layer: dark, or dark only while the OS is (`auto`). */
export const baseLayerFile = (tone: Tone, auto: boolean) => `base/${tone}${auto ? '-auto' : ''}.css`;

/**
 * Sombre base layer (spec §2, layer 1), generated at build time for each tone
 * (wxt.config.ts) and injected by the browser before first paint on every page
 * where dark mode applies; see src/entrypoints/background.ts. Its colors are
 * transformColor()'s for a white page, black text and #ddd borders, so the
 * precise theme takes over without a shift.
 */
function baseLayer(tone: Tone): string {
  setTone(tone);
  const bg = formatColor(transformColor({ r: 255, g: 255, b: 255, a: 1 }, 'bg'));
  const text = formatColor(transformColor({ r: 0, g: 0, b: 0, a: 1 }, 'fg'));
  const border = formatColor(transformColor({ r: 221, g: 221, b: 221, a: 1 }, 'border'));
  return `:root:not([data-sombre="off"]) {
  --sombre-base: 1;
  color-scheme: dark !important;
}

:where(:root:not([data-sombre="off"])) {
  color: ${text};
}

/*
 * Until the engine is ready, which then colors the root only if the page leaves <body> unpainted.
 * Frames keep a transparent canvas: overlays over a video or a page must stay see-through.
 */
:where(:root:not([data-sombre="off"]):not([data-sombre-frame]):not([data-sombre-ready])) {
  background-color: ${bg};
}

/* Until the engine has generated the precise theme, nothing may paint light. */
:root:not([data-sombre="off"]):not([data-sombre-ready]),
:root:not([data-sombre="off"]):not([data-sombre-ready]) * {
  background-color: ${bg} !important;
  color: ${text} !important;
  border-color: ${border} !important;
}
`;
}

/** Every base layer file, by published path. */
export function baseLayers(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const tone of TONES) {
    const css = baseLayer(tone);
    files[baseLayerFile(tone, false)] = css;
    // Auto mode: applied only while the OS is dark, so no script has to decide before first paint.
    files[baseLayerFile(tone, true)] = `@media (prefers-color-scheme: dark) {\n${css}}\n`;
  }
  setTone('neutral');
  return files;
}

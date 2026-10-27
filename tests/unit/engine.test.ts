import { describe, expect, it } from 'vitest';
import { apcaContrast } from '../../src/shared/color/apca.ts';
import { oklchToRgb, perceivedLightness, rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseNamedColor } from '../../src/shared/color/named.ts';
import { formatColor, parseColor } from '../../src/shared/color/parse.ts';
import { PAGE_BG_L, transformColor } from '../../src/engine/transform.ts';
import { channelTwins, channelVariable, rewriteValue, roleVariable } from '../../src/engine/value.ts';

const rgba = (value: string) => parseColor(value)!;
const L = (value: string, role: Parameters<typeof transformColor>[1]) => perceivedLightness(transformColor(rgba(value), role));

describe('parseColor', () => {
  it.each([
    ['#fff', { r: 255, g: 255, b: 255, a: 1 }],
    ['#0b5fff', { r: 11, g: 95, b: 255, a: 1 }],
    ['#00000080', { r: 0, g: 0, b: 0, a: 128 / 255 }],
    ['rgb(10, 20, 30)', { r: 10, g: 20, b: 30, a: 1 }],
    ['rgba(0,0,0,.05)', { r: 0, g: 0, b: 0, a: 0.05 }],
    ['rgb(10 20 30 / 50%)', { r: 10, g: 20, b: 30, a: 0.5 }],
    ['hsl(0 100% 50%)', { r: 255, g: 0, b: 0, a: 1 }],
    ['hsla(120, 100%, 25%, 0.5)', { r: 0, g: 127.5, b: 0, a: 0.5 }],
    ['transparent', { r: 0, g: 0, b: 0, a: 0 }],
  ])('%s', (input, expected) => {
    expect(parseColor(input)).toEqual(expected);
  });

  it.each(['oklch(0.5 0.1 120)', 'white', 'currentcolor', 'Canvas', 'rgb(from red r g b)', 'rgb(var(--x))', '#ggg'])(
    'leaves %s to the browser',
    (input) => expect(parseColor(input)).toBeNull(),
  );

  it('formats opaque colors as hex and translucent ones as rgb()', () => {
    expect(formatColor({ r: 255, g: 0, b: 16, a: 1 })).toBe('#ff0010');
    expect(formatColor({ r: 1, g: 2, b: 3, a: 0.5 })).toBe('rgb(1 2 3 / 0.5)');
  });
});

describe('parseNamedColor', () => {
  it('knows CSS named colors, case-insensitively', () => {
    expect(parseNamedColor('RebeccaPurple')).toEqual({ r: 0x66, g: 0x33, b: 0x99, a: 1 });
    expect(parseNamedColor('solid')).toBeNull();
  });
});

describe('oklch round trip', () => {
  it.each(['#ffffff', '#000000', '#0b5fff', '#e60023', '#fff3cd'])('%s', (hex) => {
    const back = formatColor({ ...oklchToRgb(rgbToOklch(rgba(hex))), a: 1 });
    expect(back).toBe(hex);
  });

  it('maps out-of-gamut chroma back into sRGB at the requested lightness', () => {
    const rgb = oklchToRgb({ l: 0.3, c: 0.4, h: 30 });
    for (const channel of [rgb.r, rgb.g, rgb.b]) expect(channel).toBeGreaterThanOrEqual(0);
    expect(perceivedLightness(rgb)).toBeCloseTo(0.3, 2);
  });
});

describe('transformColor', () => {
  it('turns a white background into the page background', () => {
    expect(L('#ffffff', 'bg')).toBeCloseTo(PAGE_BG_L, 2);
  });

  it('keeps light backgrounds ordered (lighter source → darker result)', () => {
    expect(L('#ffffff', 'bg')).toBeLessThan(L('#f0f0f0', 'bg'));
    expect(L('#f0f0f0', 'bg')).toBeLessThan(L('#cccccc', 'bg'));
  });

  it('keeps dark backgrounds dark', () => {
    expect(L('#222222', 'bg')).toBeLessThan(PAGE_BG_L);
  });

  it('keeps vivid fills and borders vivid, light enough to stand out', () => {
    const C = (value: string, role: 'bg' | 'border') => rgbToOklch(transformColor(rgba(value), role)).c;
    // Accord bars and rating bars (Fragrantica): orange-red, deep red, coral.
    for (const value of ['#cc3300', '#ac2005', '#ff766f', '#3b82f6']) {
      expect(L(value, 'bg')).toBeGreaterThan(0.45);
      expect(L(value, 'bg')).toBeLessThanOrEqual(0.6 + 1e-3);
      expect(C(value, 'bg')).toBeGreaterThan(rgbToOklch(rgba(value)).c * 0.85);
    }
    expect(L('#14b8a6', 'border')).toBeGreaterThan(0.55);
    // White text on them stays readable.
    expect(Math.abs(apcaContrast(rgba('#ffffff'), transformColor(rgba('#ff9900'), 'bg')))).toBeGreaterThan(70);
  });

  it('turns faint neutral overlays into light overlays', () => {
    // GitHub's glassy "Sign up" button, and a typical hover tint.
    expect(transformColor(rgba('rgba(255, 255, 255, 0.12)'), 'bg')).toEqual({ r: 255, g: 255, b: 255, a: 0.12 });
    expect(transformColor(rgba('rgba(0, 0, 0, 0.05)'), 'bg')).toEqual({ r: 255, g: 255, b: 255, a: 0.05 });
    expect(transformColor(rgba('rgba(0, 0, 0, 0.06)'), 'border')).toEqual({ r: 255, g: 255, b: 255, a: 0.06 });
    // Modal backdrops stay dark.
    expect(L('rgba(0, 0, 0, 0.5)', 'bg')).toBeLessThan(PAGE_BG_L);
  });

  it('darkens pastel tints like surfaces, keeping the tint visible', () => {
    expect(L('#fef08a', 'bg')).toBeLessThan(0.35);
    const mint = rgbToOklch(transformColor(rgba('#ecfdf5'), 'bg'));
    expect(mint.l).toBeLessThan(0.25);
    expect(mint.c).toBeGreaterThan(0.025);
    expect(rgbToOklch(transformColor(rgba('#f4f4f5'), 'bg')).c).toBeLessThan(0.01);
  });

  it('inverts dark text and keeps light text light', () => {
    expect(L('#000000', 'fg')).toBeGreaterThan(0.9);
    expect(L('#ffffff', 'fg')).toBeCloseTo(1, 2);
    expect(L('#999999', 'fg')).toBeGreaterThanOrEqual(0.63);
  });

  it('keeps hue for colored text', () => {
    const before = rgbToOklch(rgba('#0645ad'));
    const after = rgbToOklch(transformColor(rgba('#0645ad'), 'fg'));
    expect(Math.abs(after.h - before.h)).toBeLessThan(6);
  });

  it('preserves alpha', () => {
    expect(transformColor(rgba('rgba(0,0,0,.1)'), 'shadow').a).toBe(0.1);
  });

  it('keeps default text readable on the default background', () => {
    const text = transformColor(rgba('#222222'), 'fg');
    const bg = transformColor(rgba('#ffffff'), 'bg');
    expect(Math.abs(apcaContrast(text, bg))).toBeGreaterThan(75);
  });
});

describe('rewriteValue', () => {
  // Outside a browser, named colors come from the table the content script leaves to the browser.
  const resolveColor = (text: string) => parseNamedColor(text);
  const bg = (value: string, options = {}) => rewriteValue(value, 'bg', { resolveColor, ...options });

  it('returns null when there is nothing to rewrite', () => {
    expect(bg('none')).toBeNull();
    expect(bg('url(a.png) no-repeat')).toBeNull();
    expect(bg('transparent')).toBeNull();
    expect(bg('currentcolor')).toBeNull();
    expect(rewriteValue('currentcolor', 'bg', { resolveColor: () => ({ r: 0, g: 0, b: 0, a: 1 }) })).toBeNull();
  });

  it('rewrites hex, functional and named colors', () => {
    const white = formatColor(transformColor(rgba('#fff'), 'bg'));
    expect(bg('#fff')).toBe(white);
    expect(bg('rgb(255, 255, 255)')).toBe(white);
    expect(bg('white')).toBe(white);
  });

  it('rewrites every stop of a gradient and leaves the rest intact', () => {
    const out = bg('linear-gradient(to right, #fff 0%, rgba(0, 0, 0, 0.5) 100%)')!;
    expect(out).toMatch(/^linear-gradient\(to right, #[0-9a-f]{6} 0%, rgb\(\d+ \d+ \d+ \/ 0\.5\) 100%\)$/);
  });

  it('rewrites variables to their role twin with the original as fallback', () => {
    expect(bg('var(--surface)')).toBe(`var(${roleVariable('bg', '--surface')},var(--surface))`);
    const withFallback = bg('var(--surface, #fff)')!;
    expect(withFallback.startsWith(`var(${roleVariable('bg', '--surface')},var(--surface,`)).toBe(true);
    expect(withFallback).not.toContain('#fff');
  });

  it('does not touch url() contents or quoted strings', () => {
    expect(bg('url("white.png"), linear-gradient(white, black)')).toContain('url("white.png")');
  });

  it('absolutizes relative urls when a base is given', () => {
    const out = bg('url(img/a.png), linear-gradient(white, black)', { baseUrl: 'https://cdn.example.com/css/site.css' })!;
    expect(out).toContain('url("https://cdn.example.com/css/img/a.png")');
  });

  it('does not mistake units or identifiers for colors', () => {
    expect(rewriteValue('1px solid', 'border')).toBeNull();
    expect(rewriteValue('0 0 0 1px', 'shadow')).toBeNull();
  });

  it('transforms channels and keeps a variable alpha (Tailwind v3)', () => {
    const white = transformColor(rgba('#fff'), 'bg');
    const expected = `rgb(${Math.round(white.r)} ${Math.round(white.g)} ${Math.round(white.b)} / var(--tw-bg-opacity))`;
    expect(bg('rgb(255 255 255 / var(--tw-bg-opacity))')).toBe(expected);
    expect(bg('rgba(255, 255, 255, var(--tw-bg-opacity))')).toBe(expected);
  });

  it('routes channel variables to channel twins (shadcn/ui)', () => {
    expect(bg('hsl(var(--background))')).toBe(`hsl(var(${channelVariable('bg', 'hsl', '--background')},var(--background)))`);
    expect(bg('rgb(var(--primary) / 0.5)')).toBe(`rgb(var(${channelVariable('bg', 'rgb', '--primary')},var(--primary)) / 0.5)`);
  });

  it('generates channel twins in the same format as the source', () => {
    const twins = channelTwins('--background', '0 0% 100%', ['bg'], '');
    const white = transformColor(rgba('#fff'), 'bg');
    const l = Math.round((white.r / 255) * 1000) / 10;
    expect(twins).toBe(`${channelVariable('bg', 'hsl', '--background')}:0 0% ${l}%;`);
    expect(channelTwins('--primary', '59 130 246', ['fg'], '')).toMatch(/^--sombre-fg-rgb--primary:\d+ \d+ \d+;$/);
    expect(channelTwins('--gap', '4px', ['bg'], '')).toBe('');
  });

  it('leaves light-dark() alone: the site already provides its dark color', () => {
    expect(bg('light-dark(#fff, #111)')).toBeNull();
  });

  it('uses the fallback resolver for syntaxes it does not parse', () => {
    const out = bg('oklch(1 0 0)', { resolveColor: () => ({ r: 255, g: 255, b: 255, a: 1 }) });
    expect(out).toBe(formatColor(transformColor(rgba('#fff'), 'bg')));
  });
});

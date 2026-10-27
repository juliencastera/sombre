import { afterEach, describe, expect, it } from 'vitest';
import { apcaContrast } from '../../src/shared/color/apca.ts';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { formatColor, parseColor } from '../../src/shared/color/parse.ts';
import type { Rgb } from '../../src/shared/color/types.ts';
import { fixTextColor, requiredLc } from '../../src/engine/contrast-math.ts';
import { contrastTarget, setContrastLevel, transformColor } from '../../src/engine/transform.ts';

const rgb = (value: string) => parseColor(value)!;
const lc = (text: string | Rgb, bg: string) =>
  Math.abs(apcaContrast(typeof text === 'string' ? rgb(text) : text, rgb(bg)));

afterEach(() => setContrastLevel('standard'));

describe('requiredLc', () => {
  it('lowers the floor by 15 for large or large bold text', () => {
    expect(requiredLc(75, 16, 400)).toBe(75);
    expect(requiredLc(75, 24, 400)).toBe(60);
    expect(requiredLc(75, 19, 700)).toBe(60);
    expect(requiredLc(75, 19, 400)).toBe(75);
  });

  it('raises the floor for small, tiny and thin text', () => {
    expect(requiredLc(60, 14, 400)).toBe(65);
    expect(requiredLc(60, 14, 700)).toBe(60);
    expect(requiredLc(60, 13, 700)).toBe(65);
    expect(requiredLc(60, 12, 400)).toBe(70);
    expect(requiredLc(60, 16, 300)).toBe(65);
    expect(requiredLc(60, 14, 300)).toBe(70);
  });
});

describe('a mail list (Gmail colors, 14px)', () => {
  const page = '#ffffff';
  const readRow = '#f2f6fc';
  const map = (value: string, role: 'bg' | 'fg') => transformColor({ ...rgb(value), a: 1 }, role);

  it('keeps read and unread rows apart', () => {
    const delta = rgbToOklch(map(readRow, 'bg')).l - rgbToOklch(map(page, 'bg')).l;
    expect(delta).toBeGreaterThan(0.02);
  });

  it.each(['soft', 'standard', 'high'] as const)('makes grey snippets readable at the %s level', (level) => {
    setContrastLevel(level);
    const background = map(readRow, 'bg');
    const required = requiredLc(contrastTarget(), 14, 400);
    const snippet = map('#5f6368', 'fg');
    const fixed = fixTextColor(snippet, background, required) ?? snippet;
    const hex = formatColor({ ...background, a: 1 });
    expect(lc(fixed, hex)).toBeGreaterThanOrEqual(required);
    // The hierarchy survives: titles stay brighter than snippets (High trades it for contrast).
    if (level !== 'high') expect(lc(map('#1f1f1f', 'fg'), hex)).toBeGreaterThan(lc(fixed, hex) + 5);
  });

  it('never asks for more than white text can give', () => {
    expect(requiredLc(90, 11, 300)).toBe(100);
  });
});

describe('fixTextColor', () => {
  it('returns null when the text already passes', () => {
    expect(fixTextColor(rgb('#eeeeee'), rgb('#161616'), 75)).toBeNull();
  });

  it('lightens text on a dark background just enough to pass', () => {
    const fixed = fixTextColor(rgb('#777777'), rgb('#161616'), 75)!;
    expect(lc(fixed, '#161616')).toBeGreaterThanOrEqual(75);
    expect(lc(fixed, '#161616')).toBeLessThan(78);
  });

  it('darkens text on a light background', () => {
    const fixed = fixTextColor(rgb('#aaaaaa'), rgb('#ffffff'), 75)!;
    expect(rgbToOklch(fixed).l).toBeLessThan(rgbToOklch(rgb('#aaaaaa')).l);
    expect(lc(fixed, '#ffffff')).toBeGreaterThanOrEqual(75);
  });

  it('keeps the hue of colored text', () => {
    const fixed = fixTextColor(rgb('#3b5bdb'), rgb('#161616'), 75)!;
    expect(Math.abs(rgbToOklch(fixed).h - rgbToOklch(rgb('#3b5bdb')).h)).toBeLessThan(8);
  });

  it('returns the extreme with the most contrast when the floor is unreachable', () => {
    // On #888 neither reaches 90; white text beats black (APCA, reverse polarity).
    const fixed = fixTextColor(rgb('#777777'), rgb('#888888'), 90)!;
    expect(rgbToOklch(fixed).l).toBeCloseTo(1, 2);
    expect(lc(fixed, '#888888')).toBeGreaterThan(lc('#000000', '#888888'));
  });

  it('never lowers contrast: white on a mid-tone button stays white', () => {
    // GitHub's green "Code" button: white text below the small-text floor, black far worse.
    expect(fixTextColor(rgb('#ffffff'), rgb('#31843e'), 80)).toBeNull();
  });

  it('switches direction when only the other one reaches the floor', () => {
    // #888 counts as light, but darker text tops out near Lc 47: lighter text reaches 60.
    const fixed = fixTextColor(rgb('#777777'), rgb('#888888'), 60)!;
    expect(lc(fixed, '#888888')).toBeGreaterThanOrEqual(60);
    expect(rgbToOklch(fixed).l).toBeGreaterThan(0.9);
  });
});

describe('contrast levels', () => {
  it('maps to the spec floors', () => {
    setContrastLevel('soft');
    expect(contrastTarget()).toBe(60);
    setContrastLevel('high');
    expect(contrastTarget()).toBe(90);
  });

  it('brightens text at higher levels', () => {
    const at = (level: 'soft' | 'standard' | 'high') => {
      setContrastLevel(level);
      return rgbToOklch(transformColor(rgb('#666666'), 'fg')).l;
    };
    expect(at('soft')).toBeLessThan(at('standard'));
    expect(at('standard')).toBeLessThan(at('high'));
  });
});

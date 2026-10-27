import { afterEach, describe, expect, it } from 'vitest';
import { apcaContrast } from '../../src/shared/color/apca.ts';
import { rgbToOklch } from '../../src/shared/color/oklab.ts';
import { parseColor } from '../../src/shared/color/parse.ts';
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

  it('returns the extreme when the floor is unreachable', () => {
    // #888 counts as a light background: the fix darkens, down to black.
    const fixed = fixTextColor(rgb('#777777'), rgb('#888888'), 90)!;
    expect(rgbToOklch(fixed).l).toBeCloseTo(0, 2);
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

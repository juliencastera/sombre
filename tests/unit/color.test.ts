import { describe, expect, it } from 'vitest';
import { apcaContrast } from '../../src/shared/color/apca.ts';
import { perceivedLightness, rgbToOklab } from '../../src/shared/color/oklab.ts';
import { compositeOver, parseRgbString } from '../../src/shared/color/srgb.ts';

const hex = (value: string) => ({
  r: parseInt(value.slice(1, 3), 16),
  g: parseInt(value.slice(3, 5), 16),
  b: parseInt(value.slice(5, 7), 16),
});

describe('apcaContrast', () => {
  // Reference values from the APCA-W3 0.0.98G-4g test suite.
  it.each([
    ['#000000', '#ffffff', 106.04],
    ['#ffffff', '#000000', -107.88],
    ['#888888', '#ffffff', 63.06],
    ['#ffffff', '#888888', -68.54],
  ])('text %s on %s → Lc %d', (text, bg, expected) => {
    expect(apcaContrast(hex(text), hex(bg))).toBeCloseTo(expected, 1);
  });

  it('returns 0 for identical colors', () => {
    expect(apcaContrast(hex('#777777'), hex('#777777'))).toBe(0);
  });
});

describe('rgbToOklab', () => {
  it('maps white and black to the ends of L', () => {
    expect(perceivedLightness(hex('#ffffff'))).toBeCloseTo(1, 3);
    expect(perceivedLightness(hex('#000000'))).toBeCloseTo(0, 6);
  });

  it('matches the reference value for pure red', () => {
    const { l, a, b } = rgbToOklab(hex('#ff0000'));
    expect(l).toBeCloseTo(0.62796, 4);
    expect(a).toBeCloseTo(0.22486, 4);
    expect(b).toBeCloseTo(0.12585, 4);
  });
});

describe('parseRgbString', () => {
  it.each([
    ['rgb(10, 20, 30)', { r: 10, g: 20, b: 30, a: 1 }],
    ['rgba(10, 20, 30, 0.5)', { r: 10, g: 20, b: 30, a: 0.5 }],
    ['rgb(10 20 30 / 50%)', { r: 10, g: 20, b: 30, a: 0.5 }],
  ])('parses %s', (input, expected) => {
    expect(parseRgbString(input)).toEqual(expected);
  });

  it.each(['oklch(0.5 0.1 120)', 'red', 'rgb(1, 2)', ''])('rejects %s', (input) => {
    expect(parseRgbString(input)).toBeNull();
  });
});

describe('compositeOver', () => {
  it('blends half-transparent black over white to mid grey', () => {
    expect(compositeOver({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 })).toEqual({
      r: 127.5,
      g: 127.5,
      b: 127.5,
    });
  });
});

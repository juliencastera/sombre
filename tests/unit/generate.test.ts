import { describe, expect, it } from 'vitest';
import { selectsMedia } from '../../src/engine/generate.ts';

describe('selectsMedia', () => {
  it('recognizes rules that style pictures', () => {
    expect(selectsMedia('.img-transparent img')).toBe(true);
    expect(selectsMedia('.card > picture.photo')).toBe(true);
    expect(selectsMedia('img, .gallery video')).toBe(true);
    expect(selectsMedia('a[title="x y"] img:hover')).toBe(true);
  });

  it('leaves out overlays, text and lists mixing both', () => {
    expect(selectsMedia('.hero::after')).toBe(false);
    expect(selectsMedia('.tint')).toBe(false);
    expect(selectsMedia('img + .caption')).toBe(false);
    expect(selectsMedia('.logo, .logo img')).toBe(false);
    expect(selectsMedia('.imgbox')).toBe(false);
    expect(selectsMedia('svg::before')).toBe(false);
  });
});

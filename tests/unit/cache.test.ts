import { describe, expect, it } from 'vitest';
import {
  CACHE_MAX_BYTES,
  CACHE_MAX_SITE_BYTES,
  CACHE_MAX_SITES,
  cacheVersion,
  evictions,
  mergeSheets,
} from '../../src/shared/cache.ts';

describe('cache helpers', () => {
  it('keys entries by extension version, contrast level and native mode', () => {
    expect(cacheVersion('1.0.0', 'standard', false)).not.toBe(cacheVersion('1.0.0', 'high', false));
    expect(cacheVersion('1.0.0', 'standard', false)).not.toBe(cacheVersion('1.0.0', 'standard', true));
    expect(cacheVersion('1.0.0', 'standard', false)).not.toBe(cacheVersion('1.0.1', 'standard', false));
  });

  it('merges a page into the site cache, or reports no change', () => {
    expect(mergeSheets({ a: '1', b: '2' }, { b: '2', c: '3' })).toEqual({ a: '1', b: '2', c: '3' });
    expect(mergeSheets({ a: '1' }, { a: '1' })).toBeNull();
    expect(mergeSheets(undefined, { a: '1' })).toEqual({ a: '1' });
  });

  it('drops the least recently seen stylesheets beyond the site budget', () => {
    const half = 'x'.repeat(CACHE_MAX_SITE_BYTES / 2);
    const merged = mergeSheets({ old: half, kept: half }, { kept: half, fresh: 'y' })!;
    expect(Object.keys(merged)).toEqual(['kept', 'fresh']);
  });

  it('evicts the least recently used sites beyond the count limit', () => {
    const index = Object.fromEntries(
      Array.from({ length: CACHE_MAX_SITES + 2 }, (_, i) => [`site${i}.com`, { at: i, size: 10 }]),
    );
    expect(evictions(index).sort()).toEqual(['site0.com', 'site1.com']);
  });

  it('evicts beyond the byte limit, oldest first', () => {
    const index = {
      'old.com': { at: 1, size: CACHE_MAX_BYTES / 2 },
      'mid.com': { at: 2, size: CACHE_MAX_BYTES / 2 },
      'new.com': { at: 3, size: CACHE_MAX_BYTES / 2 },
    };
    expect(evictions(index)).toEqual(['old.com']);
  });
});

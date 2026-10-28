import { describe, expect, it } from 'vitest';
import { usedScheme } from '../../src/engine/frames.ts';

describe('usedScheme', () => {
  it('reads a single scheme as is, and normal as light', () => {
    expect(usedScheme('normal', true)).toBe('light');
    expect(usedScheme('light', true)).toBe('light');
    expect(usedScheme('dark', false)).toBe('dark');
    expect(usedScheme('only dark', false)).toBe('dark');
  });

  it('follows the OS preference when both schemes are allowed', () => {
    expect(usedScheme('light dark', true)).toBe('dark');
    expect(usedScheme('light dark', false)).toBe('light');
  });
});

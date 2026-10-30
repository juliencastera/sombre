import { describe, expect, it } from 'vitest';
import { REVIEW_DELAY, reviewDue, reviewUrl } from '../../src/shared/review.ts';

describe('reviewDue', () => {
  const since = 1_000_000;

  it('waits two weeks after install', () => {
    expect(reviewDue({ since }, since + REVIEW_DELAY - 1)).toBe(false);
    expect(reviewDue({ since }, since + REVIEW_DELAY)).toBe(true);
  });

  it('never asks again once rated or dismissed, nor without a start date', () => {
    expect(reviewDue({ since, done: true }, since + 2 * REVIEW_DELAY)).toBe(false);
    expect(reviewDue(undefined, since)).toBe(false);
  });
});

describe('reviewUrl', () => {
  it('points at the item reviews on the Chrome Web Store', () => {
    expect(reviewUrl('abc')).toBe('https://chromewebstore.google.com/detail/abc/reviews');
  });
});

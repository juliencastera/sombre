/** When the popup may ask for a store review: once, after two weeks of use. */
export const REVIEW_KEY = 'sombre:review';
export const REVIEW_DELAY = 14 * 24 * 60 * 60 * 1000;

export interface ReviewState {
  /** First install, or the first update that knew about reviews. */
  since: number;
  /** Rated or dismissed: never asked again. */
  done?: boolean;
}

export function reviewDue(state: ReviewState | undefined, now: number): boolean {
  return Boolean(state && !state.done && now - state.since >= REVIEW_DELAY);
}

/** The item's reviews on the Chrome Web Store (a store install's ID is its item ID). */
export function reviewUrl(extensionId: string): string {
  return `https://chromewebstore.google.com/detail/${extensionId}/reviews`;
}

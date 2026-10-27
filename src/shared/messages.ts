import type { Effective, SiteState } from './settings.ts';

/** Content script → background: fetch a stylesheet the page cannot read (cross-origin). */
export interface FetchCssRequest {
  type: 'sombre:fetch-css';
  url: string;
}

/** Content script → background: fetch an image to analyze as a data URL (a canvas cannot read cross-origin images). */
export interface FetchImageRequest {
  type: 'sombre:fetch-image';
  url: string;
}

/** The stylesheet's text, or the image as a data URL. */
export type FetchResponse = { ok: true; text: string } | { ok: false; error: string };

/** Background → content script (top frame): the keyboard shortcut was pressed. */
export interface ToggleSiteRequest {
  type: 'sombre:toggle-site';
}

/** Popup → content script (top frame): describe the current page. */
export interface GetStateRequest {
  type: 'sombre:get-state';
}

export interface PageState {
  hostname: string;
  effective: Effective;
  siteState: SiteState | null;
  /** The site ships its own dark theme, so the engine leaves it alone. */
  native: boolean;
}

export type ContentRequest = ToggleSiteRequest | GetStateRequest;

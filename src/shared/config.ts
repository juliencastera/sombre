/**
 * Build-time configuration, from `.env` (see README):
 * - WXT_REPO_URL: the project's GitHub repository, for "Report this site".
 * - WXT_FIXES_URL: where the signed shared fix list is served (fixes/fixes.signed.json).
 * Features depending on an unset value stay hidden; the bundled list still applies.
 */
export const REPO_URL: string = import.meta.env.WXT_REPO_URL ?? '';
export const SHARED_FIXES_URL: string = import.meta.env.WXT_FIXES_URL ?? '';

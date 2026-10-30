/**
 * Build-time configuration, overridable from `.env` (see README):
 * - WXT_REPO_URL: the project's GitHub repository, for "Report this site".
 * - WXT_FIXES_URL: where the signed shared fix list is served (fixes/fixes.signed.json).
 * - WXT_UNINSTALL_URL: the feedback form Chrome opens after Sombre is removed.
 * All default to this project; a fork sets its own, or an empty value to hide the
 * feature (the bundled list still applies).
 */
export const REPO_URL: string = import.meta.env.WXT_REPO_URL ?? 'https://github.com/juliencastera/sombre';
export const SHARED_FIXES_URL: string =
  import.meta.env.WXT_FIXES_URL ?? 'https://raw.githubusercontent.com/juliencastera/sombre/main/fixes/fixes.signed.json';
export const UNINSTALL_URL: string =
  import.meta.env.WXT_UNINSTALL_URL ??
  'https://docs.google.com/forms/d/e/1FAIpQLSfomaUOyfv2LxCSxzVnviWg7TvIJmuinimHjWyoI1sZJDYcvQ/viewform';

/** Build identifier, set by wxt.config.ts. */
declare const __SOMBRE_BUILD__: string;

interface ImportMetaEnv {
  readonly WXT_REPO_URL?: string;
  readonly WXT_FIXES_URL?: string;
  readonly WXT_UNINSTALL_URL?: string;
}

import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: '__MSG_extName__',
    description: '__MSG_extDescription__',
    default_locale: 'en',
    action: { default_title: '__MSG_extName__' },
    homepage_url: 'https://github.com/juliencastera/sombre',
    // Ed25519 in WebCrypto (verifying the shared fix list) ships in Chrome 137.
    minimum_chrome_version: '137',
    permissions: ['storage', 'scripting', 'unlimitedStorage', 'alarms'],
    // Every site may need the base layer, and cross-origin stylesheets must be fetched by the background.
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-site': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: '__MSG_commandToggleSite__',
      },
    },
  },
  // Cached stylesheet mirrors are only valid for the build that generated them,
  // even when the version number does not change (local builds).
  vite: () => ({ define: { __SOMBRE_BUILD__: JSON.stringify(Date.now().toString(36)) } }),
  hooks: {
    'build:manifestGenerated': (_, manifest) => {
      // The engine is an unlisted script (src/entrypoints/sombre.ts) to avoid WXT's content script runtime.
      manifest.content_scripts ??= [];
      manifest.content_scripts.push({
        matches: ['<all_urls>'],
        js: ['sombre.js'],
        run_at: 'document_start',
        all_frames: true,
        match_origin_as_fallback: true,
      });
    },
  },
});

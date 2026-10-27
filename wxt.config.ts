import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Sombre',
    description: 'Dark mode for every website: no white flash, guaranteed text contrast, instant toggle.',
    permissions: ['storage', 'scripting', 'unlimitedStorage'],
    // Every site may need the base layer, and cross-origin stylesheets must be fetched by the background.
    host_permissions: ['<all_urls>'],
    commands: {
      'toggle-site': {
        suggested_key: { default: 'Alt+Shift+D' },
        description: 'Toggle dark mode on the current site',
      },
    },
  },
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

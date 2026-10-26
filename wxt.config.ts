import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-svelte'],
  manifest: {
    name: 'Sombre',
    description: 'Dark mode for every website: no white flash, guaranteed text contrast, instant toggle.',
    permissions: ['storage'],
  },
});

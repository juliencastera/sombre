import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import svelte from 'eslint-plugin-svelte';
import globals from 'globals';
import ts from 'typescript-eslint';

export default defineConfig(
  { ignores: ['.output/', '.wxt/', 'bench/vendor/', 'bench/results/', 'bench/profiles/', 'bench/.cache/', 'test-results/'] },
  js.configs.recommended,
  ts.configs.recommended,
  svelte.configs.recommended,
  prettier,
  svelte.configs.prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: { parserOptions: { parser: ts.parser } },
    // TypeScript (svelte-check) resolves names, WXT auto-imports included.
    rules: { 'no-undef': 'off' },
  },
);

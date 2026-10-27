import { defineConfig } from '@playwright/test';

/** End-to-end tests of the built extension (`npm run test:e2e` builds first). */
export default defineConfig({
  testDir: 'tests/e2e',
  // Each test launches its own browser with the extension; parallel runs fight over the fixture ports.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list']],
});

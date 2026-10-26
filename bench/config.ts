import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BENCH_DIR = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(BENCH_DIR, '..');

export const PATHS = {
  vendor: path.join(BENCH_DIR, 'vendor'),
  darkReader: path.join(BENCH_DIR, 'vendor', 'darkreader'),
  sombre: path.join(ROOT_DIR, '.output', 'chrome-mv3'),
  fixtures: path.join(BENCH_DIR, 'fixtures'),
  har: path.join(BENCH_DIR, '.cache', 'har'),
  tls: path.join(BENCH_DIR, '.cache', 'tls'),
  authState: path.join(BENCH_DIR, 'profiles', 'auth.json'),
  results: path.join(BENCH_DIR, 'results'),
};

/** Pinned so baselines stay comparable across runs. */
export const DARK_READER_VERSION = '4.9.133';

export const VIEWPORT = { width: 1280, height: 800 };

/**
 * Two HTTPS origins with public-looking hostnames, so fixtures load genuinely
 * cross-origin stylesheets. Extensions treat `http:`, explicit ports, IPs and
 * local hostnames specially (Dark Reader refuses to fetch them), so Chromium's
 * resolver maps these names to local servers instead.
 */
export const FIXTURE_ORIGIN = 'https://sombre-bench.dev';
export const CDN_ORIGIN = 'https://cdn.sombre-assets.dev';
export const FIXTURE_PORTS = { site: 4443, cdn: 4444 };

export const THRESHOLDS = {
  /** A screencast frame whose mean OKLab L exceeds this counts as a "light" (flash) frame. */
  lightFrameMeanL: 0.5,
  /** A pixel above this OKLab L counts as a bright area. */
  brightPixelL: 0.8,
  /** Spec §11: no visible text below this |Lc|. */
  minTextLc: 45,
  /** Toggle is "stable" once nothing changed for this long. */
  toggleQuietMs: 1000,
  toggleTimeoutMs: 10_000,
};

/** Sample every Nth pixel on both axes when analyzing screenshots. */
export const PIXEL_STRIDE = 4;

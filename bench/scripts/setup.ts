/**
 * Download the pinned Dark Reader build used as the baseline, and install
 * Playwright's Chromium. Safe to re-run.
 */
import { execSync } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { DARK_READER_VERSION, PATHS } from '../config.ts';

const url = `https://github.com/darkreader/darkreader/releases/download/v${DARK_READER_VERSION}/darkreader-chrome-mv3.zip`;

console.log(`Downloading Dark Reader ${DARK_READER_VERSION}…`);
const response = await fetch(url);
if (!response.ok) throw new Error(`Download failed: ${response.status} ${url}`);
const files = unzipSync(new Uint8Array(await response.arrayBuffer()));

await rm(PATHS.darkReader, { recursive: true, force: true });
for (const [name, data] of Object.entries(files)) {
  if (name.endsWith('/')) continue;
  const target = path.join(PATHS.darkReader, name);
  if (!target.startsWith(PATHS.darkReader + path.sep)) throw new Error(`Unsafe path in archive: ${name}`);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}
console.log(`Extracted to ${PATHS.darkReader}`);

console.log('Installing Playwright Chromium…');
execSync('npx playwright install chromium', { stdio: 'inherit' });

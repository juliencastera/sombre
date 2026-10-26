/**
 * Archive real corpus sites as HAR files for reproducible runs, or save a
 * logged-in session for the sites that need one.
 *
 *   npm run bench:record                     # record every real site
 *   npm run bench:record -- --sites github   # record selected sites
 *   npm run bench:record -- --login          # log into test accounts, save cookies
 *
 * Archives and auth state stay local (gitignored): they can contain cookies.
 */
import { access, mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { launchContext } from '../browser.ts';
import { PATHS } from '../config.ts';
import { CORPUS, selectSites } from '../corpus.ts';

const { values: args } = parseArgs({
  options: {
    sites: { type: 'string', default: 'real' },
    login: { type: 'boolean', default: false },
    scheme: { type: 'string', default: 'dark' },
  },
});
const scheme = args.scheme === 'light' ? 'light' : 'dark';
const hasAuth = await access(PATHS.authState).then(
  () => true,
  () => false,
);

if (args.login) {
  const context = await launchContext({ headed: true, scheme });
  const authSites = CORPUS.filter((site) => site.auth);
  for (const site of authSites) await (await context.newPage()).goto(site.url);
  console.log(`Log into the TEST accounts for: ${authSites.map((s) => s.id).join(', ')}.`);
  console.log('Close the browser window when done.');
  await mkdir(path.dirname(PATHS.authState), { recursive: true });
  // The context is unreadable once the window closes, so snapshot the state while it is open.
  const snapshot = setInterval(() => {
    context.storageState({ path: PATHS.authState }).catch(() => {});
  }, 2000);
  await new Promise<void>((resolve) => context.on('close', () => resolve()));
  clearInterval(snapshot);
  console.log(`Saved session to ${PATHS.authState}`);
  process.exit(0);
}

const sites = selectSites(args.sites).filter((site) => site.kind !== 'fixture');
await mkdir(PATHS.har, { recursive: true });

for (const site of sites) {
  if (site.auth && !hasAuth) {
    console.log(`${site.id}: skipped (needs --login first)`);
    continue;
  }
  const file = path.join(PATHS.har, `${site.id}.har`);
  await rm(file, { force: true });
  const context = await launchContext({ headed: true, scheme });
  try {
    if (site.auth) await context.addCookies(JSON.parse(await readFile(PATHS.authState, 'utf8')).cookies);
    await context.routeFromHAR(file, { update: true, updateContent: 'embed' });
    const page = await context.newPage();
    await page.goto(site.url, { waitUntil: 'load', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(site.settleMs ?? 4000);
    console.log(`${site.id}: recorded`);
  } catch (error) {
    console.log(`${site.id}: failed — ${error instanceof Error ? error.message.split('\n')[0] : error}`);
  } finally {
    await context.close();
  }
}

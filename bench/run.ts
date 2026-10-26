import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { BrowserContext, CDPSession, Page } from '@playwright/test';
import { launchContext, type ColorScheme } from './browser.ts';
import { DARK_READER_VERSION, PATHS, PIXEL_STRIDE, THRESHOLDS } from './config.ts';
import { selectSites, type Site } from './corpus.ts';
import { analyzeContrast } from './metrics/contrast.ts';
import { navigateAndCaptureFlash } from './metrics/flash.ts';
import { brightFraction, decodePng } from './metrics/image.ts';
import {
  collectMediaRects,
  collectTextSamples,
  installStabilityWatcher,
  readStabilityWatcher,
  resetStabilityWatcher,
} from './probes.ts';
import { writeReports } from './report.ts';
import type { CostStats, RunMeta, RunResult, ToggleStats } from './results.ts';
import { selectTargets, type Target, type TargetSession } from './targets.ts';
import { startFixtureServers } from './server.ts';

const MAX_TEXT_SAMPLES = 1500;
const DEFAULT_SETTLE_MS = 4000;

const { values: args } = parseArgs({
  options: {
    sites: { type: 'string', default: 'fixtures' },
    targets: { type: 'string', default: 'control,darkreader,sombre' },
    scheme: { type: 'string', default: 'dark' },
    har: { type: 'string', default: 'replay' },
    headed: { type: 'boolean', default: false },
  },
});

const scheme = args.scheme as ColorScheme;
if (scheme !== 'dark' && scheme !== 'light') throw new Error('--scheme must be dark or light');
const harMode = args.har as 'replay' | 'live';
if (harMode !== 'replay' && harMode !== 'live') throw new Error('--har must be replay or live');

const exists = (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const harFile = (site: Site) => path.join(PATHS.har, `${site.id}.har`);

async function readCost(cdp: CDPSession): Promise<CostStats> {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const get = (name: string) => metrics.find((metric) => metric.name === name)?.value ?? 0;
  const ms = (seconds: number) => Math.round(seconds * 1000);
  return {
    scriptMs: ms(get('ScriptDuration')),
    taskMs: ms(get('TaskDuration')),
    recalcStyleMs: ms(get('RecalcStyleDuration')),
    layoutMs: ms(get('LayoutDuration')),
    heapMb: Math.round((get('JSHeapUsedSize') / 1024 / 1024) * 10) / 10,
  };
}

/** Time from sending the toggle command to the last computed-style change on the page. */
async function timeToggle(page: Page, trigger: () => Promise<number>): Promise<number | null> {
  await page.evaluate(resetStabilityWatcher);
  const sentAt = await trigger();
  const startedAt = Date.now();
  for (;;) {
    await sleep(100);
    const lastChange = await page.evaluate(readStabilityWatcher);
    const quiet = lastChange > 0 && Date.now() - lastChange >= THRESHOLDS.toggleQuietMs;
    const timedOut = Date.now() - startedAt >= THRESHOLDS.toggleTimeoutMs;
    if (quiet || timedOut) return lastChange > 0 ? lastChange - sentAt : null;
  }
}

async function measureToggle(page: Page, session: TargetSession): Promise<ToggleStats | null> {
  const toggle = session.toggle;
  if (!toggle) return null;
  await page.evaluate(installStabilityWatcher);
  const offMs = await timeToggle(page, () => toggle(false, page.url()));
  const onMs = await timeToggle(page, () => toggle(true, page.url()));
  return { offMs, onMs };
}

async function applyNetwork(context: BrowserContext, site: Site): Promise<RunResult['network']> {
  if (site.kind === 'fixture') return 'local';
  if (harMode === 'replay' && (await exists(harFile(site)))) {
    // Unmatched requests (cache-busting params, beacons) fall through to the network.
    await context.routeFromHAR(harFile(site), { notFound: 'fallback' });
    return 'har';
  }
  return 'live';
}

async function runOne(site: Site, target: Target, runDir: string): Promise<RunResult> {
  const base = { site: site.id, kind: site.kind, url: site.url, target: target.id };
  if (site.auth && !(await exists(PATHS.authState))) {
    return { ...base, status: 'skipped', reason: 'needs login, run `npm run bench:record -- --login`' };
  }

  const startedAt = Date.now();
  const context = await launchContext({ extensionPath: target.extensionPath, headed: args.headed, scheme });
  try {
    if (site.auth) {
      const state = JSON.parse(await readFile(PATHS.authState, 'utf8'));
      await context.addCookies(state.cookies);
    }
    const network = await applyNetwork(context, site);
    const session = await target.prepare(context);
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Performance.enable');
    const settle = () => sleep(site.settleMs ?? DEFAULT_SETTLE_MS);

    const firstVisit = await navigateAndCaptureFlash(page, cdp, site.url, settle);
    const cost = await readCost(cdp);
    const secondVisit = await navigateAndCaptureFlash(page, cdp, site.url, settle);

    const screenshot = path.join('shots', `${site.id}--${target.id}.png`);
    const shot = await page.screenshot({ path: path.join(runDir, screenshot) });
    const media = await page.evaluate(collectMediaRects);
    const bright = brightFraction(decodePng(shot), PIXEL_STRIDE, THRESHOLDS.brightPixelL, media);
    const contrast = analyzeContrast(await page.evaluate(collectTextSamples, MAX_TEXT_SAMPLES));
    const toggle = await measureToggle(page, session);

    return {
      ...base,
      status: 'ok',
      network,
      durationMs: Date.now() - startedAt,
      flash: { firstVisit, secondVisit },
      cost,
      brightFraction: Math.round(bright * 1000) / 1000,
      contrast,
      toggle,
      screenshot,
    };
  } finally {
    await context.close();
  }
}

async function browserVersion(): Promise<string | null> {
  const context = await launchContext({ headed: false, scheme });
  try {
    const page = context.pages()[0] ?? (await context.newPage());
    const cdp = await context.newCDPSession(page);
    const { product } = await cdp.send('Browser.getVersion');
    return product;
  } catch {
    return null;
  } finally {
    await context.close();
  }
}

async function sombreVersion(): Promise<string | undefined> {
  const manifest = path.join(PATHS.sombre, 'manifest.json');
  if (!(await exists(manifest))) return undefined;
  return JSON.parse(await readFile(manifest, 'utf8')).version;
}

async function main(): Promise<void> {
  const sites = selectSites(args.sites);
  const targets: Target[] = [];
  for (const target of selectTargets(args.targets)) {
    const reason = await target.unavailableReason();
    if (reason) console.warn(`⚠ Skipping ${target.label}: ${reason}`);
    else targets.push(target);
  }
  if (!targets.length) throw new Error('No runnable target.');

  const runDir = path.join(PATHS.results, new Date().toISOString().replace(/[:.]/g, '-'));
  await mkdir(path.join(runDir, 'shots'), { recursive: true });

  const meta: RunMeta = {
    startedAt: new Date().toISOString(),
    browser: await browserVersion(),
    scheme,
    harMode,
    versions: {
      ...(targets.some((t) => t.id === 'darkreader') && { darkreader: DARK_READER_VERSION }),
      ...(targets.some((t) => t.id === 'sombre') && { sombre: await sombreVersion() }),
    },
  };

  const stopServers = sites.some((site) => site.kind === 'fixture') ? await startFixtureServers() : null;
  const results: RunResult[] = [];
  const total = sites.length * targets.length;
  try {
    for (const site of sites) {
      for (const target of targets) {
        const label = `[${results.length + 1}/${total}] ${site.id} × ${target.id}`;
        let result: RunResult;
        try {
          result = await runOne(site, target, runDir);
        } catch (error) {
          result = {
            site: site.id,
            kind: site.kind,
            url: site.url,
            target: target.id,
            status: 'error',
            reason: error instanceof Error ? error.message.split('\n')[0] : String(error),
          };
        }
        results.push(result);
        const detail = result.status === 'ok' ? `${((result.durationMs ?? 0) / 1000).toFixed(1)}s, ${result.network}` : result.reason;
        console.log(`${label} → ${result.status} (${detail})`);
      }
    }
  } finally {
    await stopServers?.();
  }

  const report = { meta, results };
  await writeFile(path.join(runDir, 'results.json'), JSON.stringify(report, null, 2));
  await writeReports(report, runDir);
  console.log(`\nReport: ${path.join(runDir, 'report.html')}`);
}

await main();

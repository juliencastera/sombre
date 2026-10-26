import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { THRESHOLDS } from './config.ts';
import type { RunReport, RunResult } from './results.ts';
import { TARGETS, type TargetId } from './targets.ts';

interface Metric {
  title: string;
  better: 'lower' | 'higher';
  value: (result: RunResult) => number | null | undefined;
  format: (value: number) => string;
}

const ms = (value: number) => `${Math.round(value)} ms`;
const int = (value: number) => String(Math.round(value));

const METRICS: Metric[] = [
  { title: 'Light frames — 1st visit', better: 'lower', value: (r) => r.flash?.firstVisit.lightFrames, format: int },
  { title: 'Light frames — 2nd visit', better: 'lower', value: (r) => r.flash?.secondVisit.lightFrames, format: int },
  { title: 'Toggle dark → light', better: 'lower', value: (r) => r.toggle?.offMs, format: ms },
  { title: 'Toggle light → dark', better: 'lower', value: (r) => r.toggle?.onMs, format: ms },
  {
    title: `Visible texts below Lc ${THRESHOLDS.minTextLc}`,
    better: 'lower',
    value: (r) => r.contrast?.belowMin,
    format: int,
  },
  { title: 'Median text contrast |Lc|', better: 'higher', value: (r) => r.contrast?.medianLc, format: (v) => v.toFixed(1) },
  {
    title: `Bright area (L > ${THRESHOLDS.brightPixelL}, excl. media)`,
    better: 'lower',
    value: (r) => (r.brightFraction === undefined ? undefined : r.brightFraction * 100),
    format: (v) => `${v.toFixed(1)} %`,
  },
  { title: 'Main-thread script time (1st visit)', better: 'lower', value: (r) => r.cost?.scriptMs, format: ms },
  { title: 'JS heap (1st visit)', better: 'lower', value: (r) => r.cost?.heapMb, format: (v) => `${v.toFixed(1)} MB` },
];

function index(report: RunReport) {
  const sites = [...new Set(report.results.map((r) => r.site))];
  const targets = [...new Set(report.results.map((r) => r.target))] as TargetId[];
  const find = (site: string, target: TargetId) => report.results.find((r) => r.site === site && r.target === target);
  return { sites, targets, find };
}

function cell(result: RunResult | undefined, metric: Metric): string {
  if (!result) return '';
  if (result.status !== 'ok') return result.status;
  const value = metric.value(result);
  return value === null || value === undefined ? 'n/a' : metric.format(value);
}

/** Sombre vs Dark Reader on one metric: sites where Sombre is better / worse / equal. */
function headToHead(report: RunReport, metric: Metric) {
  const { sites, find } = index(report);
  const tally = { better: 0, worse: 0, equal: 0 };
  for (const site of sites) {
    const a = find(site, 'sombre');
    const b = find(site, 'darkreader');
    const va = a?.status === 'ok' ? metric.value(a) : null;
    const vb = b?.status === 'ok' ? metric.value(b) : null;
    if (va == null || vb == null) continue;
    if (va === vb) tally.equal++;
    else if ((va < vb) === (metric.better === 'lower')) tally.better++;
    else tally.worse++;
  }
  return tally;
}

const escapeHtml = (text: string) =>
  text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function markdown(report: RunReport): string {
  const { sites, targets, find } = index(report);
  const { meta } = report;
  const compare = targets.includes('sombre') && targets.includes('darkreader');
  const lines = [
    '# Sombre benchmark',
    '',
    `- Started: ${meta.startedAt}`,
    `- Browser: ${meta.browser ?? 'unknown'} · OS scheme: ${meta.scheme} · Network: ${meta.harMode}`,
    `- Versions: ${Object.entries(meta.versions).map(([id, v]) => `${id} ${v}`).join(', ') || 'n/a'}`,
    '',
  ];
  for (const metric of METRICS) {
    lines.push(`## ${metric.title} (${metric.better} is better)`, '');
    lines.push(`| Site | ${targets.map((t) => TARGETS[t].label).join(' | ')} |`);
    lines.push(`|---|${targets.map(() => '---:').join('|')}|`);
    for (const site of sites) lines.push(`| ${site} | ${targets.map((t) => cell(find(site, t), metric)).join(' | ')} |`);
    if (compare) {
      const { better, worse, equal } = headToHead(report, metric);
      lines.push('', `Sombre vs Dark Reader: better on ${better}, worse on ${worse}, equal on ${equal}.`);
    }
    lines.push('');
  }
  const problems = report.results.filter((r) => r.status !== 'ok');
  if (problems.length) {
    lines.push('## Skipped / errors', '');
    for (const r of problems) lines.push(`- ${r.site} × ${r.target}: ${r.status} — ${r.reason ?? ''}`);
  }
  return lines.join('\n');
}

function html(report: RunReport): string {
  const { sites, targets, find } = index(report);
  const { meta } = report;
  const compare = targets.includes('sombre') && targets.includes('darkreader');

  const tables = METRICS.map((metric) => {
    const rows = sites
      .map(
        (site) =>
          `<tr><th scope="row">${escapeHtml(site)}</th>${targets
            .map((t) => `<td>${escapeHtml(cell(find(site, t), metric))}</td>`)
            .join('')}</tr>`,
      )
      .join('');
    const verdict = compare
      ? (() => {
          const { better, worse, equal } = headToHead(report, metric);
          return `<p class="verdict">Sombre vs Dark Reader — better: ${better} · worse: ${worse} · equal: ${equal}</p>`;
        })()
      : '';
    return `<section><h2>${escapeHtml(metric.title)} <small>${metric.better} is better</small></h2>
      <table><thead><tr><th>Site</th>${targets.map((t) => `<th>${TARGETS[t].label}</th>`).join('')}</tr></thead>
      <tbody>${rows}</tbody></table>${verdict}</section>`;
  }).join('');

  const shots = sites
    .map((site) => {
      const figures = targets
        .map((t) => {
          const r = find(site, t);
          const body = r?.screenshot
            ? `<img src="${escapeHtml(r.screenshot.split(path.sep).join('/'))}" loading="lazy" alt="">`
            : `<div class="missing">${escapeHtml(r?.reason ?? r?.status ?? '')}</div>`;
          const worst = r?.contrast?.worst.length
            ? `<ul>${r.contrast.worst.map((w) => `<li>Lc ${w.lc} — ${escapeHtml(w.label)}</li>`).join('')}</ul>`
            : '';
          return `<figure><figcaption>${TARGETS[t].label}</figcaption>${body}${worst}</figure>`;
        })
        .join('');
      return `<section class="site"><h3>${escapeHtml(site)}</h3><div class="row">${figures}</div></section>`;
    })
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Sombre benchmark</title>
<style>
  :root { color-scheme: dark; --bg: #131416; --fg: #e8e8ea; --muted: #9a9ca3; --line: #2b2d31; }
  body { margin: 0; padding: 24px; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, sans-serif; }
  h1 { margin: 0 0 4px; } h2 { font-size: 16px; margin: 32px 0 8px; } h2 small { color: var(--muted); font-weight: 400; }
  .meta { color: var(--muted); }
  table { border-collapse: collapse; min-width: 480px; }
  th, td { padding: 4px 12px; border-bottom: 1px solid var(--line); text-align: right; }
  th:first-child { text-align: left; }
  .verdict { color: var(--muted); }
  .row { display: grid; grid-template-columns: repeat(${targets.length}, minmax(0, 1fr)); gap: 12px; }
  figure { margin: 0; } img { width: 100%; border: 1px solid var(--line); }
  figcaption { color: var(--muted); margin-bottom: 4px; }
  figure ul { margin: 4px 0 0; padding-left: 16px; color: var(--muted); font-size: 12px; }
  .missing { aspect-ratio: 16 / 10; display: grid; place-items: center; border: 1px dashed var(--line); color: var(--muted); }
</style></head><body>
<h1>Sombre benchmark</h1>
<p class="meta">${escapeHtml(meta.startedAt)} · ${escapeHtml(meta.browser ?? 'unknown browser')} · OS scheme ${meta.scheme} · network ${meta.harMode}
 · ${escapeHtml(Object.entries(meta.versions).map(([id, v]) => `${id} ${v}`).join(', '))}</p>
${tables}
<h2>Screenshots after second visit</h2>
${shots}
</body></html>`;
}

export async function writeReports(report: RunReport, runDir: string): Promise<void> {
  await writeFile(path.join(runDir, 'report.md'), markdown(report));
  await writeFile(path.join(runDir, 'report.html'), html(report));
}

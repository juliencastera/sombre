export interface ReportInfo {
  /** Hostname only: paths and queries can carry personal data. */
  hostname: string;
  version: string;
  contrast: string;
  /** Site state and why (e.g. "Dark — global default (Auto)"). */
  state: string;
  native: boolean;
  browser: string;
}

/**
 * A pre-filled GitHub issue for a broken site (spec §9). Opened in a tab: the
 * user sees everything before submitting, and nothing is sent by Sombre itself.
 */
export function issueUrl(repo: string, info: ReportInfo): string {
  const body = [
    '**What looks wrong?** (a screenshot helps)',
    '',
    '',
    '| | |',
    '|---|---|',
    `| Site | ${info.hostname} |`,
    `| State | ${info.state} |`,
    `| Site's own dark theme | ${info.native ? 'yes' : 'no'} |`,
    `| Contrast | ${info.contrast} |`,
    `| Sombre | ${info.version} |`,
    `| Browser | ${info.browser} |`,
  ].join('\n');
  const query = new URLSearchParams({ title: `Site: ${info.hostname}`, body, labels: 'site' });
  return `${repo.replace(/\/+$/, '')}/issues/new?${query}`;
}

/** Browser name and version, e.g. "Chrome/156.0.0.0". */
export function browserName(userAgent: string): string {
  // Chromium derivatives also advertise "Chrome/": check them first.
  for (const name of ['Edg', 'OPR', 'Vivaldi', 'Brave', 'Chrome']) {
    const match = new RegExp(`${name}/[\\d.]+`).exec(userAgent);
    if (match) return match[0];
  }
  return 'unknown';
}

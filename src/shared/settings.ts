/** Global default (spec §7). `auto` follows the OS color scheme, `schedule` the clock. */
export type Mode = 'auto' | 'dark' | 'light' | 'schedule';

/** Dark from `from` to `to`, in minutes after local midnight; spans midnight when `from` > `to`. */
export interface Schedule {
  from: number;
  to: number;
}

/** Per-site exception. Absent = follow the global default. */
export type SiteState = 'dark' | 'never';

/** Global contrast floor (spec §3), replacing brightness/contrast/sepia sliders. */
export type ContrastLevel = 'soft' | 'standard' | 'high';

/** Minimum APCA |Lc| for body-size text at each level; large text gets 15 less. */
export const CONTRAST_TARGETS: Record<ContrastLevel, number> = { soft: 60, standard: 75, high: 90 };

export interface Settings {
  mode: Mode;
  /** Keyed by site key (hostname without `www.`); applies to subdomains too. */
  sites: Record<string, SiteState>;
  contrast: ContrastLevel;
  /** Apply the shared, signed fix list on top of the user's own fixes. */
  sharedFixes: boolean;
  schedule: Schedule;
}

export const SETTINGS_KEY = 'sombre:settings';
/** Site keys detected as shipping their own dark theme. */
export const NATIVE_KEY = 'sombre:native';

/** A class or attribute that switches a site's own dark theme on (`html.dark`, `html[dark]`…). */
export interface NativeMarker {
  target: 'html' | 'body';
  kind: 'class' | 'attr';
  name: string;
  value: string;
}

export interface NativeVerdict {
  /** Detection time (epoch ms). */
  at: number;
  /** Present when Sombre switched the theme on itself; re-applied at document start. */
  marker?: NativeMarker;
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'auto',
  sites: {},
  contrast: 'standard',
  sharedFixes: true,
  schedule: { from: 20 * 60, to: 7 * 60 },
};

export type Reason =
  'site-dark' | 'site-never' | 'mode-dark' | 'mode-light' | 'auto-dark' | 'auto-light' | 'schedule-dark' | 'schedule-light';

export interface Effective {
  on: boolean;
  reason: Reason;
}

export function siteKey(hostname: string): string {
  return hostname
    .toLowerCase()
    .replace(/^www\./, '')
    .replace(/\.$/, '');
}

/** The most specific site key in `keys` covering `hostname` (exact host or a parent domain). */
export function findSiteKey(keys: Iterable<string>, hostname: string): string | undefined {
  const host = siteKey(hostname);
  let best: string | undefined;
  for (const key of keys) {
    if ((host === key || host.endsWith(`.${key}`)) && (!best || key.length > best.length)) best = key;
  }
  return best;
}

const DAY = 24 * 60;
const minutes = (date: Date) => date.getHours() * 60 + date.getMinutes();

/** Whether the schedule is dark at `date` (local time). */
export function inSchedule({ from, to }: Schedule, date = new Date()): boolean {
  const m = minutes(date);
  return from <= to ? m >= from && m < to : m >= from || m < to;
}

/** Milliseconds from `date` until the schedule next switches. */
export function nextSwitch({ from, to }: Schedule, date = new Date()): number {
  const elapsed = (date.getSeconds() * 1000 + date.getMilliseconds()) / 60_000;
  const wait = (target: number) => (((target - minutes(date) + DAY - 1) % DAY) + 1 - elapsed) * 60_000;
  return Math.min(wait(from), wait(to));
}

export function resolveEffective(settings: Settings, hostname: string, osDark: boolean, now = new Date()): Effective {
  const key = findSiteKey(Object.keys(settings.sites), hostname);
  const state = key ? settings.sites[key] : undefined;
  if (state === 'dark') return { on: true, reason: 'site-dark' };
  if (state === 'never') return { on: false, reason: 'site-never' };
  if (settings.mode === 'dark') return { on: true, reason: 'mode-dark' };
  if (settings.mode === 'light') return { on: false, reason: 'mode-light' };
  if (settings.mode === 'schedule') {
    return inSchedule(settings.schedule, now) ? { on: true, reason: 'schedule-dark' } : { on: false, reason: 'schedule-light' };
  }
  return osDark ? { on: true, reason: 'auto-dark' } : { on: false, reason: 'auto-light' };
}

/** Whether the global default (ignoring site exceptions) is dark. */
export function defaultIsOn(settings: Settings, osDark: boolean): boolean {
  return (
    settings.mode === 'dark' ||
    (settings.mode === 'auto' && osDark) ||
    (settings.mode === 'schedule' && inSchedule(settings.schedule))
  );
}

/**
 * New settings after the user flips the current site. Flipping back to what the
 * default would give removes the exception instead of stacking one.
 */
export function toggleSite(settings: Settings, hostname: string, osDark: boolean): Settings {
  const key = siteKey(hostname);
  const sites = { ...settings.sites };
  const target = !resolveEffective(settings, hostname, osDark).on;
  // Only this host's own exception is removed; a parent domain's exception keeps covering its other subdomains.
  delete sites[key];
  const next = { ...settings, sites };
  if (resolveEffective(next, hostname, osDark).on !== target) sites[key] = target ? 'dark' : 'never';
  return next;
}

/** Match patterns covering a site key and its subdomains, any scheme and port. */
export function sitePatterns(key: string): string[] {
  if (!/^[a-z0-9.-]+$/.test(key)) return [];
  return [`*://${key}/*`, `*://*.${key}/*`];
}

export function normalizeSettings(value: unknown): Settings {
  const raw = (value ?? {}) as Partial<Settings>;
  const mode = ['auto', 'dark', 'light', 'schedule'].includes(raw.mode as string) ? raw.mode! : DEFAULT_SETTINGS.mode;
  const sites: Record<string, SiteState> = {};
  for (const [key, state] of Object.entries(raw.sites ?? {})) {
    if (state === 'dark' || state === 'never') sites[key] = state;
  }
  const contrast = raw.contrast && raw.contrast in CONTRAST_TARGETS ? raw.contrast : DEFAULT_SETTINGS.contrast;
  const sharedFixes = typeof raw.sharedFixes === 'boolean' ? raw.sharedFixes : DEFAULT_SETTINGS.sharedFixes;
  const minute = (value: unknown, fallback: number) =>
    Number.isInteger(value) && (value as number) >= 0 && (value as number) < DAY ? (value as number) : fallback;
  const schedule = {
    from: minute(raw.schedule?.from, DEFAULT_SETTINGS.schedule.from),
    to: minute(raw.schedule?.to, DEFAULT_SETTINGS.schedule.to),
  };
  return { mode, sites, contrast, sharedFixes, schedule };
}

export function normalizeNative(value: unknown): Record<string, NativeVerdict> {
  const out: Record<string, NativeVerdict> = {};
  for (const [key, verdict] of Object.entries((value ?? {}) as Record<string, unknown>)) {
    // M1 stored a bare timestamp.
    if (typeof verdict === 'number') out[key] = { at: verdict };
    else if (verdict && typeof verdict === 'object' && typeof (verdict as NativeVerdict).at === 'number') {
      out[key] = verdict as NativeVerdict;
    }
  }
  return out;
}

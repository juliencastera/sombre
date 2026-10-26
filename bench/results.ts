import type { ContrastStats } from './metrics/contrast.ts';
import type { FlashStats } from './metrics/flash.ts';
import type { ColorScheme } from './browser.ts';
import type { SiteKind } from './corpus.ts';
import type { TargetId } from './targets.ts';

export interface CostStats {
  scriptMs: number;
  taskMs: number;
  recalcStyleMs: number;
  layoutMs: number;
  heapMb: number;
}

export interface ToggleStats {
  /** Command → last computed-style change, dark → light. Null if nothing changed. */
  offMs: number | null;
  /** Command → last computed-style change, light → dark. */
  onMs: number | null;
}

export interface RunResult {
  site: string;
  kind: SiteKind;
  url: string;
  target: TargetId;
  status: 'ok' | 'skipped' | 'error';
  reason?: string;
  /** Whether the run replayed an archived HAR or hit the live site. */
  network?: 'local' | 'har' | 'live';
  durationMs?: number;
  flash?: { firstVisit: FlashStats; secondVisit: FlashStats };
  cost?: CostStats;
  brightFraction?: number;
  contrast?: ContrastStats;
  toggle?: ToggleStats | null;
  /** Path relative to the run directory. */
  screenshot?: string;
}

export interface RunMeta {
  startedAt: string;
  browser: string | null;
  scheme: ColorScheme;
  harMode: 'replay' | 'live';
  versions: Partial<Record<TargetId, string>>;
}

export interface RunReport {
  meta: RunMeta;
  results: RunResult[];
}

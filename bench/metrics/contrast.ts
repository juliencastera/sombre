import { apcaContrast } from '../../src/shared/color/apca.ts';
import { compositeOver } from '../../src/shared/color/srgb.ts';
import { THRESHOLDS } from '../config.ts';
import type { TextSample } from '../probes.ts';

export interface ContrastStats {
  samples: number;
  /** Samples whose background could not be resolved from colors (excluded from the stats below). */
  uncertain: number;
  /** Measured samples with |Lc| below the spec floor. */
  belowMin: number;
  medianLc: number | null;
  p10Lc: number | null;
  worst: { lc: number; label: string }[];
}

function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;
}

export function analyzeContrast(samples: TextSample[]): ContrastStats {
  const measured = samples
    .filter((sample) => !sample.uncertain)
    .map((sample) => {
      const [r, g, b] = sample.background;
      const background = { r, g, b };
      const [tr, tg, tb, ta] = sample.text;
      const text = compositeOver({ r: tr, g: tg, b: tb, a: ta }, background);
      return { lc: Math.abs(apcaContrast(text, background)), label: sample.label };
    })
    .sort((a, b) => a.lc - b.lc);

  const values = measured.map((m) => m.lc);
  const round = (value: number | null) => (value === null ? null : Math.round(value * 10) / 10);
  return {
    samples: samples.length,
    uncertain: samples.length - measured.length,
    belowMin: values.filter((lc) => lc < THRESHOLDS.minTextLc).length,
    medianLc: round(percentile(values, 0.5)),
    p10Lc: round(percentile(values, 0.1)),
    worst: measured.slice(0, 5).map((m) => ({ lc: Math.round(m.lc * 10) / 10, label: m.label })),
  };
}

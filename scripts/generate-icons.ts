/**
 * Render the extension icons (public/icon/*.png): a crescent on a dark rounded
 * square. Supersampled for clean edges at 16px. Run with `node scripts/generate-icons.ts`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icon');
const SIZES = [16, 32, 48, 128];
const SAMPLES = 4;

const BACKGROUND = [27, 28, 32];
const MOON = [236, 236, 239];

/** Coverage of the shapes at a point in unit coordinates: [tile, moon]. */
function shapes(x: number, y: number): [number, number] {
  // Rounded square, radius 22 %.
  const r = 0.22;
  const dx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  const tile = dx * dx + dy * dy <= r * r ? 1 : 0;
  // Crescent: a disc minus an offset disc.
  const inDisc = (cx: number, cy: number, radius: number) => (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
  const moon = inDisc(0.5, 0.5, 0.3) && !inDisc(0.64, 0.38, 0.25) ? 1 : 0;
  return [tile, moon];
}

mkdirSync(OUT, { recursive: true });
for (const size of SIZES) {
  const png = new PNG({ width: size, height: size });
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let tile = 0;
      let moon = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const [t, m] = shapes((px + (sx + 0.5) / SAMPLES) / size, (py + (sy + 0.5) / SAMPLES) / size);
          tile += t;
          moon += m;
        }
      }
      tile /= SAMPLES * SAMPLES;
      moon /= SAMPLES * SAMPLES;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) png.data[i + c] = Math.round(BACKGROUND[c]! * (1 - moon) + MOON[c]! * moon);
      png.data[i + 3] = Math.round(255 * Math.max(tile, moon));
    }
  }
  writeFileSync(path.join(OUT, `${size}.png`), PNG.sync.write(png));
  console.log(`icon/${size}.png`);
}

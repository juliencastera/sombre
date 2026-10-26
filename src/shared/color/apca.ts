import type { Rgb } from './types.ts';

// APCA-W3 0.0.98G-4g constants (https://github.com/Myndex/apca-w3).
const MAIN_TRC = 2.4;
const R_CO = 0.2126729;
const G_CO = 0.7151522;
const B_CO = 0.072175;

const NORM_BG = 0.56;
const NORM_TXT = 0.57;
const REV_TXT = 0.62;
const REV_BG = 0.65;

const BLK_THRS = 0.022;
const BLK_CLMP = 1.414;
const SCALE = 1.14;
const LO_OFFSET = 0.027;
const LO_CLIP = 0.1;
const DELTA_Y_MIN = 0.0005;

/** APCA screen luminance (simple 2.4 exponent, not the piecewise sRGB curve). */
export function apcaLuminance({ r, g, b }: Rgb): number {
  return R_CO * (r / 255) ** MAIN_TRC + G_CO * (g / 255) ** MAIN_TRC + B_CO * (b / 255) ** MAIN_TRC;
}

function clampBlack(y: number): number {
  return y > BLK_THRS ? y : y + (BLK_THRS - y) ** BLK_CLMP;
}

/**
 * APCA lightness contrast (Lc). Positive for dark text on light background,
 * negative for light text on dark background. Magnitude ≈ 0–108.
 */
export function apcaContrast(text: Rgb, background: Rgb): number {
  const txtY = clampBlack(apcaLuminance(text));
  const bgY = clampBlack(apcaLuminance(background));
  if (Math.abs(bgY - txtY) < DELTA_Y_MIN) return 0;

  if (bgY > txtY) {
    const sapc = (bgY ** NORM_BG - txtY ** NORM_TXT) * SCALE;
    return sapc < LO_CLIP ? 0 : (sapc - LO_OFFSET) * 100;
  }
  const sapc = (bgY ** REV_BG - txtY ** REV_TXT) * SCALE;
  return sapc > -LO_CLIP ? 0 : (sapc + LO_OFFSET) * 100;
}

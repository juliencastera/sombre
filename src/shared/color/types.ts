/** sRGB color, channels in 0–255. */
export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** sRGB color with alpha in 0–1. */
export interface Rgba extends Rgb {
  a: number;
}

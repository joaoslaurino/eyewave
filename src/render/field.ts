/**
 * Painting a scalar field onto a canvas.
 *
 * Values arrive as a `size * size` row-major Float64Array with NaN outside the
 * pupil, which is what `expandToImage` produces. NaN is painted transparent, so
 * the pupil edge comes out of the data rather than being drawn separately.
 */

import type { Colormap } from './colormap';

export interface FieldRange {
  readonly min: number;
  readonly max: number;
}

/**
 * Symmetric range about zero, sized by the largest magnitude present.
 *
 * Signed fields must be scaled symmetrically or the colour map lies: with an
 * asymmetric range, zero stops being the neutral midpoint and the sign of a
 * region can no longer be read from its colour.
 */
export function symmetricRange(image: Float64Array, floor = 1e-12): FieldRange {
  let largest = 0;
  for (let i = 0; i < image.length; i++) {
    const v = image[i]!;
    if (!Number.isFinite(v)) continue;
    const magnitude = Math.abs(v);
    if (magnitude > largest) largest = magnitude;
  }
  const extent = Math.max(largest, floor);
  return { min: -extent, max: extent };
}

/** Range spanning the finite values present, for non-negative fields. */
export function dataRange(image: Float64Array, floor = 1e-12): FieldRange {
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < image.length; i++) {
    const v = image[i]!;
    if (!Number.isFinite(v)) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (!Number.isFinite(min)) return { min: 0, max: floor };
  return { min, max: max - min < floor ? min + floor : max };
}

/**
 * Converts a scalar field to RGBA bytes.
 *
 * Kept separate from {@link toImageData} so the mapping can be tested without a
 * DOM: `ImageData` exists only in a browser, `Uint8ClampedArray` everywhere.
 * Non-finite samples become fully transparent.
 */
export function toPixels(
  image: Float64Array,
  size: number,
  colormap: Colormap,
  range: FieldRange,
  // Explicitly over ArrayBuffer, not ArrayBufferLike: ImageData rejects a
  // SharedArrayBuffer-backed view, so the narrower type belongs in the signature.
  out?: Uint8ClampedArray<ArrayBuffer>,
): Uint8ClampedArray<ArrayBuffer> {
  if (image.length !== size * size) {
    throw new RangeError(`Expected ${size * size} samples, got ${image.length}.`);
  }

  const pixels = out ?? new Uint8ClampedArray(size * size * 4);
  if (pixels.length !== size * size * 4) {
    throw new RangeError(`Pixel buffer must have length ${size * size * 4}.`);
  }

  const span = range.max - range.min;
  const scale = span === 0 ? 0 : 1 / span;

  for (let i = 0; i < image.length; i++) {
    const value = image[i]!;
    const offset = i * 4;

    if (!Number.isFinite(value)) {
      pixels[offset] = 0;
      pixels[offset + 1] = 0;
      pixels[offset + 2] = 0;
      pixels[offset + 3] = 0; // outside the pupil
      continue;
    }

    const [r, g, b] = colormap((value - range.min) * scale);
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = 255;
  }

  return pixels;
}

/** Wraps {@link toPixels} in the browser's ImageData container. */
export function toImageData(
  image: Float64Array,
  size: number,
  colormap: Colormap,
  range: FieldRange,
): ImageData {
  return new ImageData(toPixels(image, size, colormap, range), size, size);
}

/**
 * Paints a scalar field onto a canvas, resizing the backing store to match.
 *
 * The canvas is kept at the data resolution and scaled by CSS, so the browser
 * does the interpolation and no pixels are invented here.
 */
export function paintField(
  canvas: HTMLCanvasElement,
  image: Float64Array,
  size: number,
  colormap: Colormap,
  range: FieldRange,
): void {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not acquire a 2D canvas context.');

  if (canvas.width !== size || canvas.height !== size) {
    canvas.width = size;
    canvas.height = size;
  }

  context.clearRect(0, 0, size, size);
  context.putImageData(toImageData(image, size, colormap, range), 0, 0);
}

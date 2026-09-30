/**
 * Colour maps for scalar fields.
 *
 * Two families, chosen for what they encode rather than for looks:
 *
 * - Diverging, for signed quantities such as wavefront error, where zero is
 *   meaningful and the sign matters. A neutral midpoint makes the sign visible
 *   at a glance and keeps the zero contour readable.
 * - Sequential, for non-negative quantities such as PSF intensity, where only
 *   magnitude matters and the map must be monotonic in perceived lightness so
 *   that ordering is not invented by the colours.
 *
 * A rainbow map would be wrong for both: it is not monotonic in lightness, so it
 * manufactures visual boundaries where the data is smooth.
 */

export type Rgb = readonly [number, number, number];
export type Colormap = (t: number) => Rgb;

interface ColorStop {
  readonly t: number;
  readonly rgb: Rgb;
}

/** Builds a colour map by linear interpolation between stops. */
function interpolate(stops: readonly ColorStop[]): Colormap {
  return (t: number): Rgb => {
    if (!Number.isFinite(t)) return [0, 0, 0];
    const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;

    let upper = 1;
    while (upper < stops.length - 1 && stops[upper]!.t < clamped) upper++;

    const a = stops[upper - 1]!;
    const b = stops[upper]!;
    const span = b.t - a.t;
    const f = span === 0 ? 0 : (clamped - a.t) / span;

    return [
      a.rgb[0] + f * (b.rgb[0] - a.rgb[0]),
      a.rgb[1] + f * (b.rgb[1] - a.rgb[1]),
      a.rgb[2] + f * (b.rgb[2] - a.rgb[2]),
    ];
  };
}

/** Blue to grey to red. For wavefront error and other signed fields. */
export const coolWarm: Colormap = interpolate([
  { t: 0.0, rgb: [59, 76, 192] },
  { t: 0.25, rgb: [122, 158, 239] },
  { t: 0.5, rgb: [221, 221, 221] },
  { t: 0.75, rgb: [236, 152, 124] },
  { t: 1.0, rgb: [180, 4, 38] },
]);

/** Perceptually uniform, dark to bright. For intensity fields such as the PSF. */
export const viridis: Colormap = interpolate([
  { t: 0.0, rgb: [68, 1, 84] },
  { t: 0.25, rgb: [59, 82, 139] },
  { t: 0.5, rgb: [33, 145, 140] },
  { t: 0.75, rgb: [94, 201, 98] },
  { t: 1.0, rgb: [253, 231, 37] },
]);

/** Formats a colour map sample as a CSS colour, for legends and swatches. */
export function toCss(rgb: Rgb): string {
  return `rgb(${Math.round(rgb[0])} ${Math.round(rgb[1])} ${Math.round(rgb[2])})`;
}

/** A CSS linear-gradient spanning a colour map, for legend bars. */
export function toCssGradient(colormap: Colormap, steps = 16): string {
  const parts: string[] = [];
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    parts.push(`${toCss(colormap(t))} ${(t * 100).toFixed(1)}%`);
  }
  return `linear-gradient(to right, ${parts.join(', ')})`;
}

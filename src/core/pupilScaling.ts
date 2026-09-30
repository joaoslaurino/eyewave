/**
 * Rescaling a Zernike coefficient set to a different concentric pupil.
 *
 * Coefficients live on the normalised disc, so changing the pupil radius is not
 * a simple rescaling: modes of the same azimuthal frequency mix. See
 * docs/pupil-scaling.md.
 */

import {
  modeCount,
  normalization,
  osaIndex,
  radialCoefficients,
} from './zernike';
import type { CoefficientSet } from './wavefront';
import type { Millimeters } from './units';

/** The modes sharing one azimuthal frequency, ordered by radial order. */
interface ModeFamily {
  readonly absM: number;
  /** Radial orders |m|, |m|+2, ... up to the maximum. */
  readonly orders: readonly number[];
  /** OSA indices of those modes, in the same order. */
  readonly indices: readonly number[];
}

function familiesUpTo(maxRadialOrder: number): ModeFamily[] {
  const families: ModeFamily[] = [];

  for (let m = -maxRadialOrder; m <= maxRadialOrder; m++) {
    const absM = Math.abs(m);
    const orders: number[] = [];
    const indices: number[] = [];
    for (let n = absM; n <= maxRadialOrder; n += 2) {
      orders.push(n);
      indices.push(osaIndex(n, m));
    }
    if (orders.length > 0) families.push({ absM, orders, indices });
  }

  return families;
}

/**
 * Rescales `set` to a concentric pupil of radius `targetRadius`.
 *
 * Shrinking the pupil is exact. Enlarging it is mathematically well defined but
 * physically an extrapolation: it invents wavefront outside the region the
 * original coefficients described.
 */
export function scaleCoefficients(
  set: CoefficientSet,
  targetRadius: Millimeters,
): CoefficientSet {
  if (!(targetRadius > 0) || !Number.isFinite(targetRadius)) {
    throw new RangeError(`Target pupil radius must be positive and finite, got ${targetRadius}.`);
  }
  if (!(set.pupilRadius > 0)) {
    throw new RangeError(`Source pupil radius must be positive, got ${set.pupilRadius}.`);
  }

  const epsilon = targetRadius / set.pupilRadius;
  const scaled = new Float64Array(modeCount(set.maxRadialOrder));

  if (epsilon === 1) {
    scaled.set(set.coefficients.subarray(0, scaled.length));
    return { ...set, coefficients: scaled, pupilRadius: targetRadius };
  }

  for (const { absM, orders, indices } of familiesUpTo(set.maxRadialOrder)) {
    const count = orders.length;

    // Radial polynomials of this family, expressed over the power basis
    // rho^|m|, rho^(|m|+2), ...  radialCoefficients already returns exactly
    // these, so `matrix[t][u]` is lower-triangular in (t, u).
    const matrix = orders.map((n) => radialCoefficients(n, absM));
    const norms = orders.map((n) => normalization(n, absM));

    // Forward: Zernike coefficients -> power basis.
    const power = new Float64Array(count);
    for (let t = 0; t < count; t++) {
      const c = set.coefficients[indices[t]!] ?? 0;
      if (c === 0) continue;
      const weighted = c * norms[t]!;
      const row = matrix[t]!;
      for (let u = 0; u <= t; u++) power[u]! += weighted * row[u]!;
    }

    // The substitution rho -> epsilon * rho acts term by term in this basis.
    for (let u = 0; u < count; u++) {
      power[u]! *= Math.pow(epsilon, absM + 2 * u);
    }

    // Backward: power basis -> Zernike coefficients, by back-substitution.
    // Equation u reads  power[u] = sum_{t >= u} c'[t] * norms[t] * matrix[t][u].
    const rescaled = new Float64Array(count);
    for (let t = count - 1; t >= 0; t--) {
      let residual = power[t]!;
      for (let higher = t + 1; higher < count; higher++) {
        residual -= rescaled[higher]! * norms[higher]! * matrix[higher]![t]!;
      }
      rescaled[t] = residual / (norms[t]! * matrix[t]![t]!);
    }

    for (let t = 0; t < count; t++) scaled[indices[t]!] = rescaled[t]!;
  }

  return { ...set, coefficients: scaled, pupilRadius: targetRadius };
}

/**
 * Sampling the wavefront error map over the pupil.
 *
 * The expensive part of evaluating W = sum_j c_j Z_j is the Zernike basis, and
 * the basis does not change when a coefficient changes. So it is sampled once
 * into a matrix and each frame is a linear combination. See docs/wavefront.md.
 */

import { modeCount, modesUpTo, osaIndex, zernike, type ZernikeMode } from './zernike';
import { refractionToZernike, type SpheroCylinder } from './refraction';
import { um, type Micrometers, type Millimeters } from './units';

/**
 * The sample points of a square grid that fall inside the unit pupil.
 *
 * Only the interior points are stored, packed into dense arrays. `pixelIndex`
 * maps a packed sample back to its position in a `size * size` row-major image.
 *
 * Row 0 is the top of the image and corresponds to positive y, matching how a
 * canvas is drawn. Getting this flip wrong mirrors every aberration map
 * vertically while leaving the maths self-consistent, so it is fixed here once.
 */
export interface PupilGrid {
  /** Samples across the full width of the bounding square. */
  readonly size: number;
  /** Number of samples inside the pupil. */
  readonly insideCount: number;
  /** Row-major image index of each packed sample. Length `insideCount`. */
  readonly pixelIndex: Int32Array;
  /** Normalised radius of each packed sample, in [0, 1]. */
  readonly rho: Float64Array;
  /** Azimuth of each packed sample, in radians. */
  readonly theta: Float64Array;
  /** 1 where the image pixel is inside the pupil. Length `size * size`. */
  readonly inside: Uint8Array;
}

/**
 * Builds the sample grid for a pupil inscribed in a `size` by `size` image.
 *
 * Samples are taken at pixel centres, so the grid is symmetric and no sample
 * sits exactly at rho = 0 for even sizes.
 */
export function createPupilGrid(size: number): PupilGrid {
  if (!Number.isInteger(size) || size < 2) {
    throw new RangeError(`Grid size must be an integer of at least 2, got ${size}.`);
  }

  const inside = new Uint8Array(size * size);
  const pixelIndex: number[] = [];
  const rhoValues: number[] = [];
  const thetaValues: number[] = [];

  for (let row = 0; row < size; row++) {
    // Row 0 is the top of the image, so y decreases as row increases.
    const y = 1 - (2 * row + 1) / size;
    for (let column = 0; column < size; column++) {
      const x = (2 * column + 1) / size - 1;
      const rho = Math.hypot(x, y);
      if (rho > 1) continue;

      const index = row * size + column;
      inside[index] = 1;
      pixelIndex.push(index);
      rhoValues.push(rho);
      thetaValues.push(Math.atan2(y, x));
    }
  }

  return {
    size,
    insideCount: pixelIndex.length,
    pixelIndex: Int32Array.from(pixelIndex),
    rho: Float64Array.from(rhoValues),
    theta: Float64Array.from(thetaValues),
    inside,
  };
}

/**
 * The Zernike modes sampled on a pupil grid.
 *
 * `values[j]` holds mode j evaluated at every interior sample, in the same
 * packed order as the grid. Building this is the only place trigonometry is
 * evaluated per sample.
 */
export interface ZernikeBasis {
  readonly grid: PupilGrid;
  readonly maxRadialOrder: number;
  readonly modes: readonly ZernikeMode[];
  readonly values: readonly Float64Array[];
}

/** Samples every mode up to `maxRadialOrder` on `grid`. */
export function createZernikeBasis(grid: PupilGrid, maxRadialOrder: number): ZernikeBasis {
  const modes = modesUpTo(maxRadialOrder);
  const values = modes.map(({ n, m }) => {
    const sampled = new Float64Array(grid.insideCount);
    for (let k = 0; k < grid.insideCount; k++) {
      sampled[k] = zernike(n, m, grid.rho[k]!, grid.theta[k]!);
    }
    return sampled;
  });

  return { grid, maxRadialOrder, modes, values };
}

/* -------------------------------------------------------------------------- */
/* Coefficient sets                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Zernike coefficients in micrometres, indexed by OSA index.
 *
 * The pupil radius travels with the coefficients because they scale with its
 * square; a coefficient set alone is not interpretable.
 */
export interface CoefficientSet {
  readonly coefficients: Float64Array;
  readonly pupilRadius: Millimeters;
  readonly maxRadialOrder: number;
}

/** An all-zero coefficient set, which is a perfect diffraction-limited eye. */
export function createCoefficientSet(
  maxRadialOrder: number,
  pupilRadius: Millimeters,
): CoefficientSet {
  return {
    coefficients: new Float64Array(modeCount(maxRadialOrder)),
    pupilRadius,
    maxRadialOrder,
  };
}

/** Reads coefficient j, or 0 if the set does not extend that far. */
export function getCoefficient(set: CoefficientSet, j: number): Micrometers {
  return um(j >= 0 && j < set.coefficients.length ? set.coefficients[j]! : 0);
}

/** Returns a copy of `set` with coefficient j replaced. */
export function withCoefficient(
  set: CoefficientSet,
  j: number,
  value: Micrometers,
): CoefficientSet {
  if (j < 0 || j >= set.coefficients.length) {
    throw new RangeError(`OSA index ${j} is outside this coefficient set.`);
  }
  const coefficients = Float64Array.from(set.coefficients);
  coefficients[j] = value;
  return { ...set, coefficients };
}

/** Returns a copy of `set` with a new pupil radius, leaving coefficients alone. */
export function withPupilRadius(set: CoefficientSet, pupilRadius: Millimeters): CoefficientSet {
  return { ...set, pupilRadius };
}

/**
 * Writes a prescription into the second-order coefficients of `set`.
 *
 * Higher-order terms are untouched, which is what lets the interface hold a
 * measured aberration profile fixed while the refraction is varied.
 */
export function withRefraction(set: CoefficientSet, rx: SpheroCylinder): CoefficientSet {
  const second = refractionToZernike(rx, set.pupilRadius);
  const coefficients = Float64Array.from(set.coefficients);
  coefficients[osaIndex(2, -2)] = second.obliqueAstigmatism;
  coefficients[osaIndex(2, 0)] = second.defocus;
  coefficients[osaIndex(2, 2)] = second.verticalAstigmatism;
  return { ...set, coefficients };
}

/**
 * Adds a prescription to the second-order coefficients of `set`.
 *
 * Use this rather than {@link withRefraction} whenever the set already carries
 * second-order content that must survive — in particular after pupil rescaling,
 * which converts part of the spherical aberration into defocus.
 */
export function withAddedRefraction(set: CoefficientSet, rx: SpheroCylinder): CoefficientSet {
  const second = refractionToZernike(rx, set.pupilRadius);
  const coefficients = Float64Array.from(set.coefficients);
  coefficients[osaIndex(2, -2)]! += second.obliqueAstigmatism;
  coefficients[osaIndex(2, 0)]! += second.defocus;
  coefficients[osaIndex(2, 2)]! += second.verticalAstigmatism;
  return { ...set, coefficients };
}

/* -------------------------------------------------------------------------- */
/* Evaluation                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Evaluates W over the pupil as a linear combination of the sampled basis.
 *
 * Returns values in micrometres, packed in grid order. Pass `out` to reuse a
 * buffer across frames and avoid allocating. Modes beyond the basis are ignored.
 */
export function evaluateWavefront(
  basis: ZernikeBasis,
  set: CoefficientSet,
  out?: Float64Array,
): Float64Array {
  const count = basis.grid.insideCount;
  const result = out ?? new Float64Array(count);
  if (result.length !== count) {
    throw new RangeError(`Output buffer must have length ${count}, got ${result.length}.`);
  }
  result.fill(0);

  const modes = Math.min(basis.values.length, set.coefficients.length);
  for (let j = 0; j < modes; j++) {
    const c = set.coefficients[j]!;
    if (c === 0) continue;
    const mode = basis.values[j]!;
    for (let k = 0; k < count; k++) result[k]! += c * mode[k]!;
  }

  return result;
}

/**
 * Expands a packed pupil array into a full `size * size` image.
 *
 * Pixels outside the pupil are set to `fill`, which defaults to NaN so that a
 * renderer cannot silently treat the outside as a valid zero.
 */
export function expandToImage(
  grid: PupilGrid,
  packed: Float64Array,
  fill = Number.NaN,
  out?: Float64Array,
): Float64Array {
  const pixels = grid.size * grid.size;
  const image = out ?? new Float64Array(pixels);
  if (image.length !== pixels) {
    throw new RangeError(`Output buffer must have length ${pixels}, got ${image.length}.`);
  }

  image.fill(fill);
  for (let k = 0; k < grid.insideCount; k++) {
    image[grid.pixelIndex[k]!] = packed[k]!;
  }
  return image;
}

/* -------------------------------------------------------------------------- */
/* Metrics                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * RMS wavefront error from the coefficients alone, in micrometres.
 *
 * Orthonormality makes this the root of the sum of squares. Piston is excluded
 * because RMS is measured about the mean and piston only shifts it.
 */
export function rmsFromCoefficients(set: CoefficientSet): Micrometers {
  let sum = 0;
  for (let j = 1; j < set.coefficients.length; j++) {
    sum += set.coefficients[j]! ** 2;
  }
  return um(Math.sqrt(sum));
}

/**
 * RMS of the aberrations a spectacle lens cannot correct, in micrometres.
 *
 * Excludes every mode of radial order 2 or below, so piston, tilt, defocus and
 * astigmatism are removed and coma, trefoil and spherical aberration remain.
 */
export function higherOrderRms(set: CoefficientSet): Micrometers {
  // Modes of order 2 and below occupy indices 0 to modeCount(2) - 1.
  const firstHigherOrder = modeCount(2);
  let sum = 0;
  for (let j = firstHigherOrder; j < set.coefficients.length; j++) {
    sum += set.coefficients[j]! ** 2;
  }
  return um(Math.sqrt(sum));
}

/** RMS of a sampled wavefront about its mean, in micrometres. */
export function sampledRms(packed: Float64Array): Micrometers {
  const count = packed.length;
  if (count === 0) return um(0);

  let mean = 0;
  for (let k = 0; k < count; k++) mean += packed[k]!;
  mean /= count;

  let sum = 0;
  for (let k = 0; k < count; k++) sum += (packed[k]! - mean) ** 2;
  return um(Math.sqrt(sum / count));
}

/** Peak-to-valley range of a sampled wavefront, in micrometres. */
export function peakToValley(packed: Float64Array): Micrometers {
  if (packed.length === 0) return um(0);
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < packed.length; k++) {
    const v = packed[k]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return um(max - min);
}

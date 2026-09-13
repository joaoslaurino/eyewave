/**
 * Zernike polynomials on the unit disc, in the OSA/ANSI convention.
 *
 * See docs/zernike.md for the definitions, the indexing table, the competing
 * conventions and the numerical reasoning behind this implementation.
 */

/** A Zernike mode. `m` negative selects the sine variant. */
export interface ZernikeMode {
  /** Radial order, n >= 0. */
  readonly n: number;
  /** Azimuthal frequency, |m| <= n with n - |m| even. */
  readonly m: number;
}

/* -------------------------------------------------------------------------- */
/* Indexing                                                                   */
/* -------------------------------------------------------------------------- */

/** True when (n, m) is a valid Zernike mode. */
export function isValidMode(n: number, m: number): boolean {
  return (
    Number.isInteger(n) &&
    Number.isInteger(m) &&
    n >= 0 &&
    Math.abs(m) <= n &&
    (n - Math.abs(m)) % 2 === 0
  );
}

function assertValidMode(n: number, m: number): void {
  if (!isValidMode(n, m)) {
    throw new RangeError(
      `Invalid Zernike mode (n=${n}, m=${m}): require n >= 0, |m| <= n, and n - |m| even.`,
    );
  }
}

/** OSA/ANSI single index: j = (n(n + 2) + m) / 2. */
export function osaIndex(n: number, m: number): number {
  assertValidMode(n, m);
  return (n * (n + 2) + m) / 2;
}

/** Inverse of {@link osaIndex}; recovers n from the quadratic, then m. */
export function fromOsaIndex(j: number): ZernikeMode {
  if (!Number.isInteger(j) || j < 0) {
    throw new RangeError(`Invalid OSA index ${j}: must be a non-negative integer.`);
  }
  const n = Math.ceil((-3 + Math.sqrt(9 + 8 * j)) / 2);
  const m = 2 * j - n * (n + 2);
  return { n, m };
}

/** Number of modes up to and including `maxRadialOrder`: (n + 1)(n + 2) / 2. */
export function modeCount(maxRadialOrder: number): number {
  if (!Number.isInteger(maxRadialOrder) || maxRadialOrder < 0) {
    throw new RangeError(`maxRadialOrder must be a non-negative integer, got ${maxRadialOrder}.`);
  }
  return ((maxRadialOrder + 1) * (maxRadialOrder + 2)) / 2;
}

/** Every mode up to and including `maxRadialOrder`, in OSA index order. */
export function modesUpTo(maxRadialOrder: number): ZernikeMode[] {
  const total = modeCount(maxRadialOrder);
  const modes: ZernikeMode[] = new Array(total);
  for (let j = 0; j < total; j++) modes[j] = fromOsaIndex(j);
  return modes;
}

/* -------------------------------------------------------------------------- */
/* Radial polynomial                                                          */
/* -------------------------------------------------------------------------- */

const factorialCache: bigint[] = [1n];

function factorial(k: number): bigint {
  for (let i = factorialCache.length; i <= k; i++) {
    factorialCache[i] = factorialCache[i - 1]! * BigInt(i);
  }
  return factorialCache[k]!;
}

const radialCoefficientCache = new Map<string, Float64Array>();

/**
 * Coefficients [a_0, ..., a_s] of the radial polynomial written as
 *
 *   R_n^|m|(rho) = rho^|m| * sum_t a_t u^t,   u = rho^2,  s = (n - |m|) / 2
 *
 * The a_t are integers, built with BigInt so they are exact before the single
 * rounding to double. Cached per (n, |m|).
 */
export function radialCoefficients(n: number, absM: number): Float64Array {
  assertValidMode(n, absM);
  if (absM < 0) throw new RangeError(`absM must be non-negative, got ${absM}.`);

  const key = `${n},${absM}`;
  const cached = radialCoefficientCache.get(key);
  if (cached) return cached;

  const s = (n - absM) / 2;
  const coefficients = new Float64Array(s + 1);

  for (let k = 0; k <= s; k++) {
    const numerator = factorial(n - k);
    const denominator =
      factorial(k) * factorial((n + absM) / 2 - k) * factorial((n - absM) / 2 - k);

    // The ratio is an integer identity; a non-zero remainder means the formula
    // is wrong, so fail loudly rather than return a plausible number.
    if (numerator % denominator !== 0n) {
      throw new Error(
        `Non-integer radial coefficient for (n=${n}, m=${absM}, k=${k}); the formula is wrong.`,
      );
    }

    const magnitude = numerator / denominator;
    if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new RangeError(
        `Radial coefficient for (n=${n}, m=${absM}) exceeds exact double precision. ` +
          `Orders this high need a recurrence relation instead of the direct sum.`,
      );
    }

    // Term k carries rho^(n - 2k) = rho^|m| * u^(s - k).
    coefficients[s - k] = (k % 2 === 0 ? 1 : -1) * Number(magnitude);
  }

  radialCoefficientCache.set(key, coefficients);
  return coefficients;
}

/**
 * Radial polynomial R_n^|m|(rho), by Horner's method in u = rho^2.
 *
 * Defined for rho in [0, 1]; the pupil mask is applied elsewhere.
 */
export function radial(n: number, absM: number, rho: number): number {
  const a = radialCoefficients(n, absM);
  const u = rho * rho;

  let sum = a[a.length - 1]!;
  for (let t = a.length - 2; t >= 0; t--) {
    sum = sum * u + a[t]!;
  }

  return absM === 0 ? sum : Math.pow(rho, absM) * sum;
}

/* -------------------------------------------------------------------------- */
/* Normalisation                                                              */
/* -------------------------------------------------------------------------- */

/**
 * N_n^m = sqrt( 2(n + 1) / (1 + delta_{m,0}) ).
 *
 * Scales each mode to unit RMS over the pupil, which is what lets a coefficient
 * be read directly as micrometres of RMS wavefront error.
 */
export function normalization(n: number, m: number): number {
  assertValidMode(n, m);
  return Math.sqrt((2 * (n + 1)) / (m === 0 ? 2 : 1));
}

/* -------------------------------------------------------------------------- */
/* Full polynomial                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Z_n^m(rho, theta), normalised to unit RMS over the pupil.
 *
 * `theta` is in radians, counter-clockwise from the positive x axis.
 */
export function zernike(n: number, m: number, rho: number, theta: number): number {
  assertValidMode(n, m);
  const absM = Math.abs(m);
  const value = normalization(n, m) * radial(n, absM, rho);

  if (m === 0) return value;
  return m > 0 ? value * Math.cos(m * theta) : value * Math.sin(absM * theta);
}

/** {@link zernike}, addressed by OSA index. */
export function zernikeByIndex(j: number, rho: number, theta: number): number {
  const { n, m } = fromOsaIndex(j);
  return zernike(n, m, rho, theta);
}

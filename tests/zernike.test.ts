import { describe, it, expect } from 'vitest';
import {
  isValidMode,
  osaIndex,
  fromOsaIndex,
  modeCount,
  modesUpTo,
  radial,
  radialCoefficients,
  normalization,
  zernike,
  zernikeByIndex,
} from '../src/core/zernike';
import { gaussLegendreOn, periodicRule } from './helpers/quadrature';

const SQRT3 = Math.sqrt(3);
const SQRT5 = Math.sqrt(5);
const SQRT6 = Math.sqrt(6);
const SQRT8 = Math.sqrt(8);

describe('mode validity', () => {
  it('accepts valid modes', () => {
    expect(isValidMode(0, 0)).toBe(true);
    expect(isValidMode(2, 0)).toBe(true);
    expect(isValidMode(2, -2)).toBe(true);
    expect(isValidMode(4, 4)).toBe(true);
  });

  it('rejects |m| > n', () => {
    expect(isValidMode(1, 2)).toBe(false);
    expect(isValidMode(2, -3)).toBe(false);
  });

  it('rejects modes where n - |m| is odd', () => {
    // There is no Z_2^1: the radial polynomial would need half-integer powers.
    expect(isValidMode(2, 1)).toBe(false);
    expect(isValidMode(3, 0)).toBe(false);
  });

  it('throws rather than returning nonsense', () => {
    expect(() => zernike(2, 1, 0.5, 0)).toThrow(RangeError);
    expect(() => osaIndex(1, 3)).toThrow(RangeError);
  });
});

describe('OSA/ANSI indexing', () => {
  it('places the clinically important modes at their standard indices', () => {
    expect(osaIndex(0, 0)).toBe(0); // piston
    expect(osaIndex(1, -1)).toBe(1); // vertical tilt
    expect(osaIndex(1, 1)).toBe(2); // horizontal tilt
    expect(osaIndex(2, -2)).toBe(3); // oblique astigmatism
    expect(osaIndex(2, 0)).toBe(4); // defocus
    expect(osaIndex(2, 2)).toBe(5); // vertical astigmatism
    expect(osaIndex(3, -3)).toBe(6); // oblique trefoil
    expect(osaIndex(3, -1)).toBe(7); // vertical coma
    expect(osaIndex(3, 1)).toBe(8); // horizontal coma
    expect(osaIndex(4, 0)).toBe(12); // primary spherical aberration
  });

  it('round-trips index to mode and back through the sixth order', () => {
    const total = modeCount(6);
    expect(total).toBe(28);

    for (let j = 0; j < total; j++) {
      const mode = fromOsaIndex(j);
      expect(isValidMode(mode.n, mode.m)).toBe(true);
      expect(osaIndex(mode.n, mode.m)).toBe(j);
    }
  });

  it('enumerates modes in ascending index order', () => {
    const modes = modesUpTo(4);
    expect(modes).toHaveLength(15);
    expect(modes[0]).toEqual({ n: 0, m: 0 });
    expect(modes[14]).toEqual({ n: 4, m: 4 });

    // Radial order must be non-decreasing along the sequence.
    for (let j = 1; j < modes.length; j++) {
      expect(modes[j]!.n).toBeGreaterThanOrEqual(modes[j - 1]!.n);
    }
  });

  it('counts modes as (n + 1)(n + 2) / 2', () => {
    expect(modeCount(0)).toBe(1);
    expect(modeCount(2)).toBe(6);
    expect(modeCount(4)).toBe(15);
    expect(modeCount(8)).toBe(45);
  });
});

describe('radial polynomials', () => {
  it('reproduces the textbook closed forms', () => {
    for (const rho of [0, 0.1, 0.37, 0.5, 0.83, 1]) {
      // R_2^0 = 2r^2 - 1  (defocus)
      expect(radial(2, 0, rho)).toBeCloseTo(2 * rho ** 2 - 1, 12);

      // R_3^1 = 3r^3 - 2r  (coma)
      expect(radial(3, 1, rho)).toBeCloseTo(3 * rho ** 3 - 2 * rho, 12);

      // R_4^0 = 6r^4 - 6r^2 + 1  (spherical aberration)
      expect(radial(4, 0, rho)).toBeCloseTo(6 * rho ** 4 - 6 * rho ** 2 + 1, 12);

      // R_4^2 = 4r^4 - 3r^2  (secondary astigmatism)
      expect(radial(4, 2, rho)).toBeCloseTo(4 * rho ** 4 - 3 * rho ** 2, 12);

      // R_6^0 = 20r^6 - 30r^4 + 12r^2 - 1
      expect(radial(6, 0, rho)).toBeCloseTo(
        20 * rho ** 6 - 30 * rho ** 4 + 12 * rho ** 2 - 1,
        12,
      );
    }
  });

  it('satisfies R_n^n = r^n', () => {
    for (let n = 0; n <= 8; n++) {
      for (const rho of [0.2, 0.55, 0.9]) {
        expect(radial(n, n, rho)).toBeCloseTo(rho ** n, 12);
      }
    }
  });

  it('satisfies R_n^m(1) = 1 for every mode', () => {
    // A defining property of the basis, and a sharp test: it only holds if the
    // alternating coefficients are exactly right, since at rho = 1 they sum
    // directly with no attenuation.
    for (const { n, m } of modesUpTo(10)) {
      expect(radial(n, Math.abs(m), 1)).toBeCloseTo(1, 11);
    }
  });

  it('produces exactly integer coefficients', () => {
    for (const { n, m } of modesUpTo(10)) {
      for (const coefficient of radialCoefficients(n, Math.abs(m))) {
        expect(Number.isInteger(coefficient)).toBe(true);
      }
    }
  });

  it('factors the polynomial as r^|m| times a series in u = r^2', () => {
    // R_4^2 = 4r^4 - 3r^2 = r^2 * (-3 + 4u), so the stored array is [-3, 4].
    expect(Array.from(radialCoefficients(4, 2))).toEqual([-3, 4]);
    // R_4^0 = 1 - 6u + 6u^2.
    expect(Array.from(radialCoefficients(4, 0))).toEqual([1, -6, 6]);
  });

  it('caches coefficient arrays instead of recomputing them', () => {
    expect(radialCoefficients(6, 2)).toBe(radialCoefficients(6, 2));
  });
});

describe('normalisation', () => {
  it('applies sqrt(n + 1) to rotationally symmetric modes', () => {
    expect(normalization(0, 0)).toBeCloseTo(1, 12);
    expect(normalization(2, 0)).toBeCloseTo(SQRT3, 12);
    expect(normalization(4, 0)).toBeCloseTo(SQRT5, 12);
  });

  it('applies sqrt(2(n + 1)) to modes with angular dependence', () => {
    expect(normalization(1, 1)).toBeCloseTo(2, 12);
    expect(normalization(2, 2)).toBeCloseTo(SQRT6, 12);
    expect(normalization(3, -1)).toBeCloseTo(SQRT8, 12);
  });

  it('is independent of the sign of m', () => {
    expect(normalization(3, -3)).toBeCloseTo(normalization(3, 3), 12);
  });
});

describe('full Zernike polynomials', () => {
  it('reproduces the standard normalised forms', () => {
    const rho = 0.6;
    const theta = 0.7;

    expect(zernike(0, 0, rho, theta)).toBeCloseTo(1, 12);
    expect(zernike(1, -1, rho, theta)).toBeCloseTo(2 * rho * Math.sin(theta), 12);
    expect(zernike(1, 1, rho, theta)).toBeCloseTo(2 * rho * Math.cos(theta), 12);
    expect(zernike(2, -2, rho, theta)).toBeCloseTo(SQRT6 * rho ** 2 * Math.sin(2 * theta), 12);
    expect(zernike(2, 0, rho, theta)).toBeCloseTo(SQRT3 * (2 * rho ** 2 - 1), 12);
    expect(zernike(2, 2, rho, theta)).toBeCloseTo(SQRT6 * rho ** 2 * Math.cos(2 * theta), 12);
    expect(zernike(3, -1, rho, theta)).toBeCloseTo(
      SQRT8 * (3 * rho ** 3 - 2 * rho) * Math.sin(theta),
      12,
    );
    expect(zernike(4, 0, rho, theta)).toBeCloseTo(
      SQRT5 * (6 * rho ** 4 - 6 * rho ** 2 + 1),
      12,
    );
  });

  it('gives sine modes the same profile as cosine modes, rotated', () => {
    // Z_n^-m(rho, theta) equals Z_n^m(rho, theta - pi/(2m)).
    const rho = 0.44;
    for (const [n, m] of [
      [2, 2],
      [3, 3],
      [4, 2],
    ] as const) {
      for (const theta of [0.1, 1.2, 2.9, 5.5]) {
        expect(zernike(n, -m, rho, theta)).toBeCloseTo(
          zernike(n, m, rho, theta - Math.PI / (2 * m)),
          12,
        );
      }
    }
  });

  it('addresses modes by OSA index consistently', () => {
    for (let j = 0; j < 28; j++) {
      const { n, m } = fromOsaIndex(j);
      expect(zernikeByIndex(j, 0.5, 1.1)).toBeCloseTo(zernike(n, m, 0.5, 1.1), 12);
    }
  });

  it('leaves the pupil centre free of every mode except piston and defocus-like terms', () => {
    // At rho = 0 only modes with m = 0 can be non-zero, because every other
    // mode carries a factor rho^|m|.
    for (const { n, m } of modesUpTo(6)) {
      if (m !== 0) {
        expect(zernike(n, m, 0, 0.9)).toBeCloseTo(0, 12);
      }
    }
  });
});

describe('orthonormality over the unit disc', () => {
  /*
   * The defining property of the basis:
   *
   *   (1 / pi) * integral over the unit disc of Z_i * Z_j dA = delta_ij
   *
   * This single check validates the coefficients, the normalisation and the
   * angular factors together. If any of the three were wrong the off-diagonal
   * entries would stop vanishing, or the diagonal would drift away from one.
   *
   * The integrand is a polynomial in rho times a trigonometric polynomial in
   * theta, so Gauss-Legendre radially and a uniform rule azimuthally integrate
   * it essentially exactly, and the tolerance can be tight.
   */
  const MAX_ORDER = 6;
  const modes = modesUpTo(MAX_ORDER);
  const radialRule = gaussLegendreOn(32, 0, 1);
  const angularRule = periodicRule(64);

  // Pre-evaluate every mode on the quadrature grid, with the area element
  // rho * dRho * dTheta folded into the weight.
  const samples: Float64Array[] = modes.map(({ n, m }) => {
    const values = new Float64Array(radialRule.nodes.length * angularRule.nodes.length);
    let p = 0;
    for (let r = 0; r < radialRule.nodes.length; r++) {
      for (let a = 0; a < angularRule.nodes.length; a++) {
        values[p++] = zernike(n, m, radialRule.nodes[r]!, angularRule.nodes[a]!);
      }
    }
    return values;
  });

  const weights = new Float64Array(radialRule.nodes.length * angularRule.nodes.length);
  {
    let p = 0;
    for (let r = 0; r < radialRule.nodes.length; r++) {
      for (let a = 0; a < angularRule.nodes.length; a++) {
        weights[p++] = radialRule.weights[r]! * radialRule.nodes[r]! * angularRule.weights[a]!;
      }
    }
  }

  function innerProduct(i: number, j: number): number {
    const a = samples[i]!;
    const b = samples[j]!;
    let sum = 0;
    for (let p = 0; p < a.length; p++) sum += a[p]! * b[p]! * weights[p]!;
    return sum / Math.PI;
  }

  it('gives every mode unit norm', () => {
    for (let i = 0; i < modes.length; i++) {
      expect(innerProduct(i, i)).toBeCloseTo(1, 12);
    }
  });

  it('gives every distinct pair of modes zero overlap', () => {
    for (let i = 0; i < modes.length; i++) {
      for (let j = i + 1; j < modes.length; j++) {
        expect(Math.abs(innerProduct(i, j))).toBeLessThan(1e-12);
      }
    }
  });

  it('means that a coefficient is directly the RMS contribution of its mode', () => {
    // A wavefront of 0.25 um of primary spherical aberration must have an RMS
    // of exactly 0.25 um. This is the practical payoff of the normalisation.
    const j = osaIndex(4, 0);
    const coefficient = 0.25;
    const index = modes.findIndex((mode) => osaIndex(mode.n, mode.m) === j);

    const meanSquare = innerProduct(index, index) * coefficient ** 2;
    expect(Math.sqrt(meanSquare)).toBeCloseTo(coefficient, 12);
  });
});

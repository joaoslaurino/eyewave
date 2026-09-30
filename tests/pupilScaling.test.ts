import { describe, it, expect } from 'vitest';
import { mm, um } from '../src/core/units';
import { osaIndex, zernike } from '../src/core/zernike';
import {
  createCoefficientSet,
  withCoefficient,
  getCoefficient,
  higherOrderRms,
  rmsFromCoefficients,
} from '../src/core/wavefront';
import { scaleCoefficients } from '../src/core/pupilScaling';

const MAX_ORDER = 6;

function setWith(entries: readonly (readonly [number, number])[], radius: number) {
  let set = createCoefficientSet(MAX_ORDER, mm(radius));
  for (const [j, value] of entries) set = withCoefficient(set, j, um(value));
  return set;
}

/** Evaluates W at a normalised radius, summing the whole coefficient set. */
function evaluateAt(
  coefficients: Float64Array,
  maxOrder: number,
  rho: number,
  theta: number,
): number {
  let total = 0;
  for (let n = 0; n <= maxOrder; n++) {
    for (let m = -n; m <= n; m += 2) {
      total += coefficients[osaIndex(n, m)]! * zernike(n, m, rho, theta);
    }
  }
  return total;
}

describe('pupil rescaling', () => {
  it('is the identity when the radius does not change', () => {
    const original = setWith(
      [
        [osaIndex(2, 0), 0.4],
        [osaIndex(4, 0), 0.25],
        [osaIndex(3, 1), -0.15],
      ],
      3,
    );
    const scaled = scaleCoefficients(original, mm(3));

    for (let j = 0; j < original.coefficients.length; j++) {
      expect(scaled.coefficients[j]!).toBeCloseTo(original.coefficients[j]!, 12);
    }
  });

  it('reproduces the wavefront pointwise', () => {
    /*
     * The decisive test, and the reason no published formula had to be trusted.
     *
     * The physical wavefront does not care which pupil it is described over. A
     * point at normalised radius rho in the smaller pupil sits at rho * epsilon
     * in the larger one, so evaluating the original coefficients there must give
     * the same optical path difference as the rescaled coefficients give at rho.
     *
     * The identity is exact including piston: the piston coefficient changes by
     * exactly the amount needed to preserve the wavefront pointwise, so nothing
     * is subtracted here.
     */
    const original = setWith(
      [
        [osaIndex(2, 0), 0.42],
        [osaIndex(2, 2), -0.19],
        [osaIndex(3, -1), 0.23],
        [osaIndex(4, 0), 0.31],
        [osaIndex(4, 2), -0.12],
        [osaIndex(5, 3), 0.08],
        [osaIndex(6, 0), -0.14],
      ],
      3,
    );

    for (const targetRadius of [0.9, 1.5, 2.25, 2.99]) {
      const scaled = scaleCoefficients(original, mm(targetRadius));
      const epsilon = targetRadius / 3;

      for (const rho of [0, 0.17, 0.4, 0.68, 0.93, 1]) {
        for (const theta of [0, 0.6, 1.9, 3.4, 5.1]) {
          const fromOriginal = evaluateAt(original.coefficients, MAX_ORDER, rho * epsilon, theta);
          const fromScaled = evaluateAt(scaled.coefficients, MAX_ORDER, rho, theta);
          expect(fromScaled).toBeCloseTo(fromOriginal, 10);
        }
      }
    }
  });

  it('scales pure defocus with the square of the radius', () => {
    const original = setWith([[osaIndex(2, 0), 0.5]], 3);
    const scaled = scaleCoefficients(original, mm(1.5));
    expect(getCoefficient(scaled, osaIndex(2, 0))).toBeCloseTo(0.5 * 0.5 ** 2, 12);
  });

  it('scales a mode with |m| = n as the nth power of the radius', () => {
    // R_n^n = rho^n, a single power, so it cannot mix with anything.
    for (const n of [2, 3, 4, 5, 6]) {
      const original = setWith([[osaIndex(n, n), 0.3]], 3);
      const scaled = scaleCoefficients(original, mm(1.5));
      expect(getCoefficient(scaled, osaIndex(n, n))).toBeCloseTo(0.3 * 0.5 ** n, 12);
    }
  });

  it('mixes only within one azimuthal frequency', () => {
    // The scaling is purely radial, so the angular factor is untouched and the
    // transformation is block-diagonal in m. Coma can never produce astigmatism.
    const original = setWith([[osaIndex(4, 0), 0.4]], 3);
    const scaled = scaleCoefficients(original, mm(1.2));

    expect(getCoefficient(scaled, osaIndex(2, 0))).not.toBeCloseTo(0, 6);
    expect(getCoefficient(scaled, osaIndex(2, 2))).toBeCloseTo(0, 12);
    expect(getCoefficient(scaled, osaIndex(2, -2))).toBeCloseTo(0, 12);
    expect(getCoefficient(scaled, osaIndex(3, 1))).toBeCloseTo(0, 12);
    expect(getCoefficient(scaled, osaIndex(4, 2))).toBeCloseTo(0, 12);
  });

  it('turns spherical aberration into defocus of the opposite sign as the pupil shrinks', () => {
    // The mechanism behind night myopia: best focus depends on pupil size when
    // spherical aberration is present. Constricting the pupil on an eye with
    // positive spherical aberration induces a negative defocus shift.
    const original = setWith([[osaIndex(4, 0), 0.3]], 3);

    for (const targetRadius of [1, 1.5, 2, 2.5]) {
      const scaled = scaleCoefficients(original, mm(targetRadius));
      expect(getCoefficient(scaled, osaIndex(4, 0))).toBeGreaterThan(0);
      expect(getCoefficient(scaled, osaIndex(2, 0))).toBeLessThan(0);
    }
  });

  it('reduces higher-order RMS as the pupil constricts', () => {
    // The clinically central behaviour, and the one the bench exposed as missing.
    const original = setWith(
      [
        [osaIndex(3, -1), 0.25],
        [osaIndex(3, 1), -0.18],
        [osaIndex(4, 0), 0.3],
        [osaIndex(4, 4), 0.1],
      ],
      3,
    );

    const radii = [3, 2.5, 2, 1.5, 1];
    const values = radii.map((r) => higherOrderRms(scaleCoefficients(original, mm(r))));

    for (let i = 1; i < values.length; i++) {
      expect(values[i]!).toBeLessThan(values[i - 1]!);
    }
    // A 2 mm pupil should hide almost all of it.
    expect(values.at(-1)!).toBeLessThan(0.1 * values[0]!);
  });

  it('leaves piston out of the RMS even though rescaling changes it', () => {
    const original = setWith([[osaIndex(4, 0), 0.4]], 3);
    const scaled = scaleCoefficients(original, mm(1.5));

    expect(scaled.coefficients[0]!).not.toBeCloseTo(0, 6);
    expect(rmsFromCoefficients(scaled)).toBeGreaterThan(0);
  });

  it('carries the new radius on the result', () => {
    const scaled = scaleCoefficients(setWith([], 3), mm(2));
    expect(scaled.pupilRadius).toBe(2);
    expect(scaled.maxRadialOrder).toBe(MAX_ORDER);
  });

  it('round-trips a shrink followed by the matching enlargement', () => {
    const original = setWith(
      [
        [osaIndex(3, -1), 0.2],
        [osaIndex(4, 0), 0.35],
        [osaIndex(6, 2), -0.09],
      ],
      3,
    );

    const there = scaleCoefficients(original, mm(1.8));
    const back = scaleCoefficients(there, mm(3));

    // Piston included: the transformation is exactly invertible.
    for (let j = 0; j < original.coefficients.length; j++) {
      expect(back.coefficients[j]!).toBeCloseTo(original.coefficients[j]!, 9);
    }
  });

  it('rejects a non-physical radius', () => {
    expect(() => scaleCoefficients(setWith([], 3), mm(0))).toThrow(RangeError);
    expect(() => scaleCoefficients(setWith([], 3), mm(-1))).toThrow(RangeError);
  });
});

import { describe, it, expect } from 'vitest';
import { deg, diopters, mm, um } from '../src/core/units';
import { modeCount, osaIndex } from '../src/core/zernike';
import {
  createPupilGrid,
  createZernikeBasis,
  createCoefficientSet,
  getCoefficient,
  withCoefficient,
  withPupilRadius,
  withRefraction,
  evaluateWavefront,
  expandToImage,
  rmsFromCoefficients,
  higherOrderRms,
  sampledRms,
  peakToValley,
} from '../src/core/wavefront';
import type { SpheroCylinder } from '../src/core/refraction';

const rx = (sphere: number, cylinder: number, axis: number): SpheroCylinder => ({
  sphere: diopters(sphere),
  cylinder: diopters(cylinder),
  axis: deg(axis),
});

describe('pupil grid', () => {
  it('keeps only samples inside the unit disc', () => {
    const grid = createPupilGrid(64);
    // The disc covers pi/4 of the bounding square.
    const fraction = grid.insideCount / (64 * 64);
    expect(fraction).toBeCloseTo(Math.PI / 4, 2);
  });

  it('never produces a radius above one', () => {
    const grid = createPupilGrid(32);
    for (const rho of grid.rho) expect(rho).toBeLessThanOrEqual(1);
  });

  it('puts row 0 at the top of the image, at positive y', () => {
    // A vertical flip here would mirror every aberration map while leaving the
    // maths self-consistent, so it is pinned down explicitly.
    const grid = createPupilGrid(8);
    const firstInterior = grid.pixelIndex[0]!;
    const row = Math.floor(firstInterior / 8);
    const column = firstInterior % 8;
    const y = 1 - (2 * row + 1) / 8;
    const x = (2 * column + 1) / 8 - 1;

    expect(y).toBeGreaterThan(0);
    expect(grid.theta[0]!).toBeCloseTo(Math.atan2(y, x), 12);
  });

  it('agrees with its own mask', () => {
    const grid = createPupilGrid(24);
    let masked = 0;
    for (const flag of grid.inside) masked += flag;
    expect(masked).toBe(grid.insideCount);
  });

  it('rejects a degenerate size', () => {
    expect(() => createPupilGrid(1)).toThrow(RangeError);
    expect(() => createPupilGrid(8.5)).toThrow(RangeError);
  });
});

describe('sampled basis', () => {
  it('holds one array per mode, in packed grid order', () => {
    const grid = createPupilGrid(32);
    const basis = createZernikeBasis(grid, 4);

    expect(basis.modes).toHaveLength(modeCount(4));
    expect(basis.values).toHaveLength(modeCount(4));
    for (const sampled of basis.values) {
      expect(sampled).toHaveLength(grid.insideCount);
    }
  });

  it('samples piston as identically one', () => {
    const grid = createPupilGrid(16);
    const basis = createZernikeBasis(grid, 2);
    for (const value of basis.values[0]!) expect(value).toBeCloseTo(1, 12);
  });

  it('stays orthonormal when sampled, to the accuracy of the grid', () => {
    // The continuous identity is exact; a discrete grid approximates it. This
    // is a sanity check on the sampling, not a replacement for the quadrature
    // test in zernike.test.ts.
    const grid = createPupilGrid(256);
    const basis = createZernikeBasis(grid, 4);

    for (let i = 1; i < basis.values.length; i++) {
      let norm = 0;
      for (const value of basis.values[i]!) norm += value * value;
      expect(norm / grid.insideCount).toBeCloseTo(1, 2);

      let overlap = 0;
      for (let k = 0; k < grid.insideCount; k++) {
        overlap += basis.values[i]![k]! * basis.values[0]![k]!;
      }
      expect(Math.abs(overlap / grid.insideCount)).toBeLessThan(0.01);
    }
  });
});

describe('coefficient sets', () => {
  it('starts as a perfect eye', () => {
    const set = createCoefficientSet(6, mm(3));
    expect(set.coefficients).toHaveLength(modeCount(6));
    expect(rmsFromCoefficients(set)).toBe(0);
  });

  it('reads coefficients outside its range as zero', () => {
    const set = createCoefficientSet(2, mm(3));
    expect(getCoefficient(set, osaIndex(4, 0))).toBe(0);
    expect(getCoefficient(set, -1)).toBe(0);
  });

  it('updates coefficients without mutating the original', () => {
    const original = createCoefficientSet(4, mm(3));
    const updated = withCoefficient(original, osaIndex(4, 0), um(0.3));

    expect(getCoefficient(updated, osaIndex(4, 0))).toBeCloseTo(0.3, 12);
    expect(getCoefficient(original, osaIndex(4, 0))).toBe(0);
  });

  it('rejects an out-of-range index', () => {
    const set = createCoefficientSet(2, mm(3));
    expect(() => withCoefficient(set, 99, um(1))).toThrow(RangeError);
  });

  it('writes a prescription into the second-order terms only', () => {
    const withSpherical = withCoefficient(
      createCoefficientSet(4, mm(3)),
      osaIndex(4, 0),
      um(0.2),
    );
    const prescribed = withRefraction(withSpherical, rx(-2, -1, 180));

    expect(getCoefficient(prescribed, osaIndex(2, 0))).not.toBe(0);
    expect(getCoefficient(prescribed, osaIndex(2, 2))).not.toBe(0);
    // The measured high-order term survives, which is what lets the interface
    // vary the refraction of a fixed aberration profile.
    expect(getCoefficient(prescribed, osaIndex(4, 0))).toBeCloseTo(0.2, 12);
  });

  it('carries the pupil radius with the coefficients', () => {
    const set = withPupilRadius(createCoefficientSet(4, mm(3)), mm(1.5));
    expect(set.pupilRadius).toBe(1.5);
  });
});

describe('wavefront evaluation', () => {
  const grid = createPupilGrid(128);
  const basis = createZernikeBasis(grid, 6);

  it('gives a flat zero wavefront for a perfect eye', () => {
    const w = evaluateWavefront(basis, createCoefficientSet(6, mm(3)));
    for (const value of w) expect(value).toBe(0);
  });

  it('reproduces a single mode scaled by its coefficient', () => {
    const j = osaIndex(3, 1);
    const set = withCoefficient(createCoefficientSet(6, mm(3)), j, um(0.4));
    const w = evaluateWavefront(basis, set);

    for (let k = 0; k < grid.insideCount; k++) {
      expect(w[k]!).toBeCloseTo(0.4 * basis.values[j]![k]!, 12);
    }
  });

  it('is linear in the coefficients', () => {
    const a = withCoefficient(createCoefficientSet(6, mm(3)), osaIndex(2, 0), um(0.3));
    const b = withCoefficient(createCoefficientSet(6, mm(3)), osaIndex(4, 0), um(-0.2));
    const both = withCoefficient(a, osaIndex(4, 0), um(-0.2));

    const wa = evaluateWavefront(basis, a);
    const wb = evaluateWavefront(basis, b);
    const wBoth = evaluateWavefront(basis, both);

    for (let k = 0; k < grid.insideCount; k++) {
      expect(wBoth[k]!).toBeCloseTo(wa[k]! + wb[k]!, 12);
    }
  });

  it('reuses a supplied buffer', () => {
    const set = withCoefficient(createCoefficientSet(6, mm(3)), osaIndex(2, 0), um(0.5));
    const buffer = new Float64Array(grid.insideCount);
    const returned = evaluateWavefront(basis, set, buffer);
    expect(returned).toBe(buffer);
  });

  it('rejects a buffer of the wrong length', () => {
    const set = createCoefficientSet(6, mm(3));
    expect(() => evaluateWavefront(basis, set, new Float64Array(3))).toThrow(RangeError);
  });

  it('ignores coefficients beyond the basis', () => {
    const wide = createCoefficientSet(8, mm(3));
    expect(() => evaluateWavefront(basis, wide)).not.toThrow();
  });
});

describe('metrics', () => {
  const grid = createPupilGrid(512);
  const basis = createZernikeBasis(grid, 6);

  it('matches the numerically sampled RMS against the analytic one', () => {
    // The strongest test in this module. Orthonormality makes the RMS the root
    // of the sum of squares of the coefficients, computed without touching the
    // grid. If the sampling, the mask or the basis were wrong, the sampled RMS
    // would disagree.
    let set = createCoefficientSet(6, mm(3));
    set = withCoefficient(set, osaIndex(2, 0), um(0.35));
    set = withCoefficient(set, osaIndex(3, -1), um(-0.22));
    set = withCoefficient(set, osaIndex(4, 0), um(0.18));
    set = withCoefficient(set, osaIndex(5, 3), um(0.07));

    const analytic = rmsFromCoefficients(set);
    const sampled = sampledRms(evaluateWavefront(basis, set));

    expect(analytic).toBeCloseTo(Math.hypot(0.35, 0.22, 0.18, 0.07), 12);
    expect(sampled).toBeCloseTo(analytic, 3);
  });

  it('ignores piston in the RMS', () => {
    const set = withCoefficient(createCoefficientSet(6, mm(3)), 0, um(5));
    expect(rmsFromCoefficients(set)).toBe(0);
    expect(sampledRms(evaluateWavefront(basis, set))).toBeCloseTo(0, 12);
  });

  it('separates higher-order aberrations from the refractive ones', () => {
    let set = createCoefficientSet(6, mm(3));
    set = withCoefficient(set, osaIndex(2, 0), um(1.0)); // correctable
    set = withCoefficient(set, osaIndex(2, 2), um(0.5)); // correctable
    set = withCoefficient(set, osaIndex(3, -1), um(0.3)); // not correctable
    set = withCoefficient(set, osaIndex(4, 0), um(0.4)); // not correctable

    expect(rmsFromCoefficients(set)).toBeCloseTo(Math.hypot(1.0, 0.5, 0.3, 0.4), 12);
    expect(higherOrderRms(set)).toBeCloseTo(Math.hypot(0.3, 0.4), 12);
  });

  it('gives peak-to-valley of 2 sqrt(3) c for pure defocus', () => {
    // W = c sqrt(3)(2 rho^2 - 1) runs from -sqrt(3) c at the centre to
    // +sqrt(3) c at the margin.
    const c = 0.5;
    const set = withCoefficient(createCoefficientSet(6, mm(3)), osaIndex(2, 0), um(c));
    expect(peakToValley(evaluateWavefront(basis, set))).toBeCloseTo(2 * Math.sqrt(3) * c, 2);
  });

  it('reports a refraction as the RMS the formulas predict', () => {
    const set = withRefraction(createCoefficientSet(6, mm(3)), rx(-1, 0, 180));
    // -1.00 D over a 6 mm pupil: c_2^0 = 9 / (4 sqrt 3) um, and that is the
    // whole wavefront, so it is also the RMS.
    expect(rmsFromCoefficients(set)).toBeCloseTo(9 / (4 * Math.sqrt(3)), 12);
    expect(higherOrderRms(set)).toBe(0);
  });
});

describe('image expansion', () => {
  it('places packed samples at their pixel positions', () => {
    const grid = createPupilGrid(16);
    const packed = new Float64Array(grid.insideCount).fill(7);
    const image = expandToImage(grid, packed);

    for (let index = 0; index < image.length; index++) {
      if (grid.inside[index]) expect(image[index]).toBe(7);
      else expect(Number.isNaN(image[index]!)).toBe(true);
    }
  });

  it('accepts an explicit fill value', () => {
    const grid = createPupilGrid(16);
    const image = expandToImage(grid, new Float64Array(grid.insideCount), 0);
    expect(image.every((v) => v === 0)).toBe(true);
  });
});

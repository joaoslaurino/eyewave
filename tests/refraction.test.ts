import { describe, it, expect } from 'vitest';
import { deg, diopters, mm, um } from '../src/core/units';
import {
  normalizeAxis,
  sphericalEquivalent,
  powerAtMeridian,
  principalPowers,
  transpose,
  toNegativeCylinder,
  toPositiveCylinder,
  toPowerVector,
  fromPowerVector,
  refractionToZernike,
  zernikeToRefraction,
  type SpheroCylinder,
} from '../src/core/refraction';

/** Convenience constructor for a prescription. */
const rx = (sphere: number, cylinder: number, axis: number): SpheroCylinder => ({
  sphere: diopters(sphere),
  cylinder: diopters(cylinder),
  axis: deg(axis),
});

describe('axis normalisation', () => {
  it('wraps into the clinical range (0, 180]', () => {
    expect(normalizeAxis(45)).toBe(45);
    expect(normalizeAxis(180)).toBe(180);
    expect(normalizeAxis(0)).toBe(180);
    expect(normalizeAxis(270)).toBe(90);
    expect(normalizeAxis(-30)).toBe(150);
    expect(normalizeAxis(360)).toBe(180);
  });
});

describe('sphero-cylinder algebra', () => {
  it('computes the spherical equivalent', () => {
    expect(sphericalEquivalent(rx(-2, -1, 180))).toBeCloseTo(-2.5, 12);
    expect(sphericalEquivalent(rx(-3, 1, 90))).toBeCloseTo(-2.5, 12);
  });

  it('gives the sphere power at the axis meridian', () => {
    const eye = rx(-2, -1, 180);
    expect(powerAtMeridian(eye, deg(180))).toBeCloseTo(-2, 12);
    expect(powerAtMeridian(eye, deg(90))).toBeCloseTo(-3, 12);
  });

  it('varies power sinusoidally between the principal meridians', () => {
    const eye = rx(0, -2, 180);
    // Halfway between the meridians the power is the spherical equivalent.
    expect(powerAtMeridian(eye, deg(135))).toBeCloseTo(-1, 12);
  });

  it('reports both principal powers', () => {
    expect(principalPowers(rx(-2, -1, 180))).toEqual([-2, -3]);
  });
});

describe('transposition', () => {
  it('converts the textbook example', () => {
    // -2.00 -1.00 x 180  is the same eye as  -3.00 +1.00 x 90.
    const negative = rx(-2, -1, 180);
    const positive = transpose(negative);

    expect(positive.sphere).toBeCloseTo(-3, 12);
    expect(positive.cylinder).toBeCloseTo(1, 12);
    expect(positive.axis).toBeCloseTo(90, 12);
  });

  it('is its own inverse', () => {
    const original = rx(-1.75, -2.25, 35);
    const back = transpose(transpose(original));

    expect(back.sphere).toBeCloseTo(original.sphere, 12);
    expect(back.cylinder).toBeCloseTo(original.cylinder, 12);
    expect(back.axis).toBeCloseTo(original.axis, 12);
  });

  it('preserves the power in every meridian', () => {
    const negative = rx(-2, -1, 180);
    const positive = transpose(negative);

    for (const meridian of [0, 30, 45, 90, 135, 170]) {
      expect(powerAtMeridian(positive, deg(meridian))).toBeCloseTo(
        powerAtMeridian(negative, deg(meridian)),
        12,
      );
    }
  });

  it('normalises to the requested cylinder sign', () => {
    expect(toNegativeCylinder(rx(-3, 1, 90)).cylinder).toBeCloseTo(-1, 12);
    expect(toNegativeCylinder(rx(-2, -1, 180)).cylinder).toBeCloseTo(-1, 12);
    expect(toPositiveCylinder(rx(-2, -1, 180)).cylinder).toBeCloseTo(1, 12);
    expect(toPositiveCylinder(rx(-3, 1, 90)).cylinder).toBeCloseTo(1, 12);
  });
});

describe('power vectors', () => {
  it('puts a with-the-rule cylinder entirely in J0', () => {
    const { M, J0, J45 } = toPowerVector(rx(0, -1, 180));
    expect(M).toBeCloseTo(-0.5, 12);
    expect(J0).toBeCloseTo(0.5, 12);
    expect(J45).toBeCloseTo(0, 12);
  });

  it('puts an oblique cylinder entirely in J45', () => {
    const { M, J0, J45 } = toPowerVector(rx(0, -1, 45));
    expect(M).toBeCloseTo(-0.5, 12);
    expect(J0).toBeCloseTo(0, 12);
    expect(J45).toBeCloseTo(0.5, 12);
  });

  it('is identical for both cylinder conventions', () => {
    // This is what makes power vectors the right intermediate representation.
    const a = toPowerVector(rx(-2, -1, 180));
    const b = toPowerVector(transpose(rx(-2, -1, 180)));

    expect(b.M).toBeCloseTo(a.M, 12);
    expect(b.J0).toBeCloseTo(a.J0, 12);
    expect(b.J45).toBeCloseTo(a.J45, 12);
  });

  it('round-trips through the negative-cylinder form', () => {
    for (const eye of [rx(-2, -1, 180), rx(1.25, -0.75, 37), rx(-4, -3.5, 112)]) {
      const back = fromPowerVector(toPowerVector(eye));
      expect(back.sphere).toBeCloseTo(eye.sphere, 10);
      expect(back.cylinder).toBeCloseTo(eye.cylinder, 10);
      expect(back.axis).toBeCloseTo(eye.axis, 10);
    }
  });

  it('leaves the axis harmless when there is no cylinder', () => {
    const back = fromPowerVector(toPowerVector(rx(-2, 0, 90)));
    expect(back.sphere).toBeCloseTo(-2, 12);
    expect(back.cylinder).toBeCloseTo(0, 12);
  });
});

describe('refraction to Zernike', () => {
  it('maps a pure sphere onto defocus alone', () => {
    const c = refractionToZernike(rx(-1, 0, 180), mm(3));
    expect(c.obliqueAstigmatism).toBeCloseTo(0, 12);
    expect(c.verticalAstigmatism).toBeCloseTo(0, 12);
    expect(c.defocus).toBeCloseTo((1 * 9) / (4 * Math.sqrt(3)), 12);
  });

  it('reproduces the standard 6 mm reference figure', () => {
    // One micrometre of defocus over a 6 mm pupil is about -0.77 D, the number
    // most often quoted when converting between RMS and dioptres.
    const eye = zernikeToRefraction(
      { obliqueAstigmatism: um(0), defocus: um(1), verticalAstigmatism: um(0) },
      mm(3),
    );
    expect(eye.sphere).toBeCloseTo(-0.7698, 4);
    expect(eye.cylinder).toBeCloseTo(0, 10);
  });

  it('sends a with-the-rule cylinder to the vertical astigmatism term only', () => {
    const c = refractionToZernike(rx(0, -1, 180), mm(3));
    expect(c.obliqueAstigmatism).toBeCloseTo(0, 12);
    expect(c.verticalAstigmatism).toBeCloseTo(-(0.5 * 9) / (2 * Math.sqrt(6)), 12);
  });

  it('sends an oblique cylinder to the oblique astigmatism term only', () => {
    const c = refractionToZernike(rx(0, -1, 45), mm(3));
    expect(c.verticalAstigmatism).toBeCloseTo(0, 12);
    expect(c.obliqueAstigmatism).toBeCloseTo(-(0.5 * 9) / (2 * Math.sqrt(6)), 12);
  });

  it('does not depend on which cylinder convention the prescription is written in', () => {
    const negative = refractionToZernike(rx(-2, -1, 180), mm(3));
    const positive = refractionToZernike(rx(-3, 1, 90), mm(3));

    expect(positive.defocus).toBeCloseTo(negative.defocus, 12);
    expect(positive.verticalAstigmatism).toBeCloseTo(negative.verticalAstigmatism, 12);
    expect(positive.obliqueAstigmatism).toBeCloseTo(negative.obliqueAstigmatism, 12);
  });

  it('round-trips refraction to coefficients and back', () => {
    for (const eye of [rx(-2, -1, 180), rx(0.5, -2.25, 63), rx(-6, 0, 180)]) {
      const back = zernikeToRefraction(refractionToZernike(eye, mm(2.5)), mm(2.5));
      expect(back.sphere).toBeCloseTo(eye.sphere, 10);
      expect(back.cylinder).toBeCloseTo(eye.cylinder, 10);
      if (eye.cylinder !== 0) expect(back.axis).toBeCloseTo(eye.axis, 10);
    }
  });

  it('scales the coefficients with the square of the pupil radius', () => {
    // The clinically important consequence: the same refractive error produces
    // four times the wavefront error when the pupil diameter doubles.
    const eye = rx(-2, -1, 30);
    const small = refractionToZernike(eye, mm(1.5));
    const large = refractionToZernike(eye, mm(3));

    expect(large.defocus / small.defocus).toBeCloseTo(4, 10);
    expect(large.verticalAstigmatism / small.verticalAstigmatism).toBeCloseTo(4, 10);
    expect(large.obliqueAstigmatism / small.obliqueAstigmatism).toBeCloseTo(4, 10);
  });

  it('recovers a different refraction from the same coefficients at a different pupil', () => {
    // A coefficient set without its pupil radius is unusable.
    const coefficients = refractionToZernike(rx(-2, 0, 180), mm(3));
    const misread = zernikeToRefraction(coefficients, mm(1.5));
    expect(misread.sphere).toBeCloseTo(-8, 10);
  });

  it('rejects a non-physical pupil radius', () => {
    expect(() => refractionToZernike(rx(-1, 0, 180), mm(0))).toThrow(RangeError);
    expect(() => refractionToZernike(rx(-1, 0, 180), mm(-2))).toThrow(RangeError);
  });
});

import { describe, it, expect } from 'vitest';
import {
  um,
  mm,
  nm,
  rad,
  deg,
  arcmin,
  nmToUm,
  umToNm,
  mmToUm,
  umToMm,
  degToRad,
  radToDeg,
  degToArcmin,
  arcminToDeg,
  radToArcmin,
  arcminToRad,
  WAVELENGTHS,
} from '../src/core/units';

describe('length conversions', () => {
  it('converts nanometres to micrometres', () => {
    // 555 nm is the photopic peak; in the units the wavefront maths uses it is
    // 0.555 um, which is the number that appears in the phase term 2*pi*W/lambda.
    expect(nmToUm(nm(555))).toBeCloseTo(0.555, 12);
    expect(nmToUm(nm(1000))).toBeCloseTo(1, 12);
  });

  it('converts millimetres to micrometres', () => {
    // A 3 mm pupil radius is 3000 um. Wavefront error is quoted in micrometres
    // while pupil size is quoted in millimetres, so this factor of 1000 sits
    // right in the middle of the pipeline and is a classic place to slip.
    expect(mmToUm(mm(3))).toBeCloseTo(3000, 9);
  });

  it('round-trips length conversions', () => {
    expect(umToNm(nmToUm(nm(587.56)))).toBeCloseTo(587.56, 9);
    expect(umToMm(mmToUm(mm(2.5)))).toBeCloseTo(2.5, 9);
  });
});

describe('angle conversions', () => {
  it('converts degrees to radians', () => {
    expect(degToRad(deg(0))).toBeCloseTo(0, 12);
    expect(degToRad(deg(90))).toBeCloseTo(Math.PI / 2, 12);
    expect(degToRad(deg(180))).toBeCloseTo(Math.PI, 12);
  });

  it('handles the cylinder axis range', () => {
    // Clinical axis notation runs from 1 to 180 degrees, not 0 to 360, because
    // an astigmatic meridian is indistinguishable from the one 180 degrees away.
    expect(radToDeg(degToRad(deg(1)))).toBeCloseTo(1, 9);
    expect(radToDeg(degToRad(deg(180)))).toBeCloseTo(180, 9);
  });

  it('converts degrees to arcminutes', () => {
    expect(degToArcmin(deg(1))).toBeCloseTo(60, 12);

    // One arcminute is the classic threshold of resolution for a healthy eye:
    // Snellen 20/20 corresponds to resolving detail subtending one arcminute.
    expect(arcminToDeg(arcmin(1))).toBeCloseTo(1 / 60, 12);
  });

  it('round-trips radians through arcminutes', () => {
    const original = rad(0.0123);
    expect(arcminToRad(radToArcmin(original))).toBeCloseTo(0.0123, 12);
  });
});

describe('reference wavelengths', () => {
  it('exposes the standard ophthalmic wavelengths in nanometres', () => {
    expect(WAVELENGTHS.photopicPeak).toBe(555);
    expect(WAVELENGTHS.dLine).toBeCloseTo(587.56, 9);
    expect(WAVELENGTHS.eLine).toBeCloseTo(546.07, 9);
  });

  it('places the scotopic peak at a shorter wavelength than the photopic peak', () => {
    // The Purkinje shift: rod-mediated vision peaks bluer than cone-mediated
    // vision, which is why colours desaturate towards blue at night.
    expect(WAVELENGTHS.scotopicPeak).toBeLessThan(WAVELENGTHS.photopicPeak);
  });
});

describe('floating point discipline', () => {
  it('demonstrates why exact float comparison is never used here', () => {
    // Documented deliberately: 0.1 + 0.2 !== 0.3 in IEEE-754 binary64.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(0.1 + 0.2).toBeCloseTo(0.3, 15);
  });

  it('keeps a micrometre-scale conversion well inside optical tolerance', () => {
    // Wavefront work cares about fractions of a wavelength. Round-trip error
    // here must be orders of magnitude below a nanometre.
    const w = um(0.55);
    expect(Math.abs(nmToUm(umToNm(w)) - w)).toBeLessThan(1e-15);
  });
});

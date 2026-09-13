/**
 * Sphere/cylinder/axis, power vectors, and the second-order Zernike terms.
 *
 * Sphere and cylinder are not an approximation of the second-order Zernike
 * modes; they are the same quantities in clinical units. See docs/refraction.md
 * for the derivation and the sign conventions.
 */

import { deg, diopters, um, type Degrees, type Diopters, type Micrometers, type Millimeters } from './units';

/** A sphero-cylindrical refraction, written S / C x axis. */
export interface SpheroCylinder {
  readonly sphere: Diopters;
  readonly cylinder: Diopters;
  /** TABO axis in degrees, normalised to (0, 180]. */
  readonly axis: Degrees;
}

/** Thibos power vector: the same refraction in Cartesian components. */
export interface PowerVector {
  /** Spherical equivalent, S + C/2. */
  readonly M: Diopters;
  /** Cardinal astigmatism (0/90). */
  readonly J0: Diopters;
  /** Oblique astigmatism (45/135). */
  readonly J45: Diopters;
}

/** The second-order Zernike coefficients, in micrometres. */
export interface SecondOrderZernike {
  /** c_2^-2, OSA j = 3. */
  readonly obliqueAstigmatism: Micrometers;
  /** c_2^0, OSA j = 4. */
  readonly defocus: Micrometers;
  /** c_2^2, OSA j = 5. */
  readonly verticalAstigmatism: Micrometers;
}

const FOUR_SQRT3 = 4 * Math.sqrt(3);
const TWO_SQRT6 = 2 * Math.sqrt(6);
const DEG_TO_RAD = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/* Axis handling                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Wraps an axis into the clinical range (0, 180].
 *
 * A meridian is indistinguishable from the one 180 degrees away, and clinicians
 * write 180 rather than 0.
 */
export function normalizeAxis(axis: number): Degrees {
  const wrapped = ((axis % 180) + 180) % 180;
  return deg(wrapped === 0 ? 180 : wrapped);
}

/* -------------------------------------------------------------------------- */
/* Sphero-cylinder algebra                                                    */
/* -------------------------------------------------------------------------- */

/** Spherical equivalent, M = S + C/2. */
export function sphericalEquivalent(rx: SpheroCylinder): Diopters {
  return diopters(rx.sphere + rx.cylinder / 2);
}

/** Refractive power in a given meridian: P(phi) = S + C sin^2(phi - axis). */
export function powerAtMeridian(rx: SpheroCylinder, meridian: Degrees): Diopters {
  const delta = (meridian - rx.axis) * DEG_TO_RAD;
  return diopters(rx.sphere + rx.cylinder * Math.sin(delta) ** 2);
}

/** The two principal powers, along the axis meridian and perpendicular to it. */
export function principalPowers(rx: SpheroCylinder): readonly [Diopters, Diopters] {
  return [diopters(rx.sphere), diopters(rx.sphere + rx.cylinder)];
}

/**
 * Transposes between the negative- and positive-cylinder forms.
 *
 * S' = S + C, C' = -C, axis' = axis +/- 90. The two forms describe the same eye.
 */
export function transpose(rx: SpheroCylinder): SpheroCylinder {
  return {
    sphere: diopters(rx.sphere + rx.cylinder),
    cylinder: diopters(-rx.cylinder),
    axis: normalizeAxis(rx.axis + 90),
  };
}

/** The negative-cylinder form of a refraction. */
export function toNegativeCylinder(rx: SpheroCylinder): SpheroCylinder {
  return rx.cylinder > 0 ? transpose(rx) : { ...rx, axis: normalizeAxis(rx.axis) };
}

/** The positive-cylinder form of a refraction. */
export function toPositiveCylinder(rx: SpheroCylinder): SpheroCylinder {
  return rx.cylinder < 0 ? transpose(rx) : { ...rx, axis: normalizeAxis(rx.axis) };
}

/* -------------------------------------------------------------------------- */
/* Power vectors                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Decomposes a refraction into power vector components.
 *
 * Both cylinder conventions give identical power vectors, which makes this the
 * right intermediate representation for anything downstream.
 */
export function toPowerVector(rx: SpheroCylinder): PowerVector {
  const doubledAxis = 2 * rx.axis * DEG_TO_RAD;
  return {
    M: diopters(rx.sphere + rx.cylinder / 2),
    J0: diopters((-rx.cylinder / 2) * Math.cos(doubledAxis)),
    J45: diopters((-rx.cylinder / 2) * Math.sin(doubledAxis)),
  };
}

/** Rebuilds a refraction from power vector components, in negative-cylinder form. */
export function fromPowerVector(pv: PowerVector): SpheroCylinder {
  const magnitude = Math.hypot(pv.J0, pv.J45);
  const cylinder = -2 * magnitude;
  return {
    sphere: diopters(pv.M - cylinder / 2),
    cylinder: diopters(cylinder),
    axis: normalizeAxis((Math.atan2(pv.J45, pv.J0) / 2 / DEG_TO_RAD)),
  };
}

/* -------------------------------------------------------------------------- */
/* Zernike correspondence                                                     */
/* -------------------------------------------------------------------------- */

function assertPupilRadius(pupilRadius: number): void {
  if (!(pupilRadius > 0) || !Number.isFinite(pupilRadius)) {
    throw new RangeError(`Pupil radius must be a positive finite value, got ${pupilRadius}.`);
  }
}

/**
 * Second-order Zernike coefficients for a refraction over a given pupil.
 *
 * Radius in millimetres and power in dioptres yield micrometres directly.
 * The coefficients scale with the square of the radius, so they are only
 * meaningful alongside the pupil they were computed for.
 */
export function refractionToZernike(
  rx: SpheroCylinder,
  pupilRadius: Millimeters,
): SecondOrderZernike {
  assertPupilRadius(pupilRadius);
  const { M, J0, J45 } = toPowerVector(rx);
  const rSquared = pupilRadius * pupilRadius;

  return {
    obliqueAstigmatism: um((-J45 * rSquared) / TWO_SQRT6),
    defocus: um((-M * rSquared) / FOUR_SQRT3),
    verticalAstigmatism: um((-J0 * rSquared) / TWO_SQRT6),
  };
}

/** Inverse of {@link refractionToZernike}, returning the negative-cylinder form. */
export function zernikeToRefraction(
  coefficients: SecondOrderZernike,
  pupilRadius: Millimeters,
): SpheroCylinder {
  assertPupilRadius(pupilRadius);
  const rSquared = pupilRadius * pupilRadius;

  return fromPowerVector({
    M: diopters((-FOUR_SQRT3 * coefficients.defocus) / rSquared),
    J0: diopters((-TWO_SQRT6 * coefficients.verticalAstigmatism) / rSquared),
    J45: diopters((-TWO_SQRT6 * coefficients.obliqueAstigmatism) / rSquared),
  });
}

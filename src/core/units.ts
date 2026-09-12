/**
 * Branded numeric types for physical quantities.
 *
 * A branded type is a `number` intersected with a compile-time-only tag. The tag
 * exists purely for the type checker; after transpilation every value here is an
 * ordinary IEEE-754 double with no wrapper and no runtime cost.
 *
 * Convention used throughout EyeWave:
 *
 *   Units at the boundaries, raw numbers in the kernels.
 *
 * Public functions accept and return branded types, so wiring two modules
 * together with mismatched units is a compile error. Inside a tight numerical
 * loop we drop to plain `number` and re-annotate on the way out, because
 * TypeScript cannot propagate units through arithmetic (`um + um` widens to
 * `number`) and wrapping every operation would cost both clarity and speed.
 */

/** Attaches a compile-time-only tag to a numeric type. */
type Brand<TTag extends string> = number & { readonly __unit: TTag };

/* -------------------------------------------------------------------------- */
/* Length                                                                     */
/* -------------------------------------------------------------------------- */

/** Micrometres (µm). Wavefront error, optical path difference, wavelength. */
export type Micrometers = Brand<'um'>;

/** Millimetres (mm). Pupil diameter and radius, physical apertures. */
export type Millimeters = Brand<'mm'>;

/** Nanometres (nm). Wavelength, as clinicians and datasheets usually quote it. */
export type Nanometers = Brand<'nm'>;

/* -------------------------------------------------------------------------- */
/* Angle                                                                      */
/* -------------------------------------------------------------------------- */

/** Radians. Phase, and every angle consumed by `Math.*`. */
export type Radians = Brand<'rad'>;

/** Degrees. Cylinder axis, meridians — the clinical convention. */
export type Degrees = Brand<'deg'>;

/** Arcminutes. Visual angle; the natural scale for a retinal PSF. */
export type Arcminutes = Brand<'arcmin'>;

/* -------------------------------------------------------------------------- */
/* Optical                                                                    */
/* -------------------------------------------------------------------------- */

/** Dioptres (D = 1/m). Sphere, cylinder, add, defocus. */
export type Diopters = Brand<'D'>;

/** Cycles per degree. Spatial frequency, the x-axis of an MTF plot. */
export type CyclesPerDegree = Brand<'cpd'>;

/**
 * Normalised radial pupil coordinate, rho in [0, 1].
 *
 * Zernike polynomials are defined on the unit disc, so every pupil is mapped to
 * rho = 0 at the centre and rho = 1 at the margin regardless of its physical
 * size. This is exactly why a coefficient is only meaningful alongside the pupil
 * radius it was measured over.
 */
export type NormalizedRadius = Brand<'rho'>;

/* -------------------------------------------------------------------------- */
/* Constructors                                                               */
/* -------------------------------------------------------------------------- */

/*
 * These are assertions, not validations: they tell the compiler "trust me, this
 * number is in these units". Keep them at the edges of the system — parsing user
 * input, writing literals — so that the claim is made once, visibly, rather than
 * scattered through the maths.
 */

export const um = (v: number): Micrometers => v as Micrometers;
export const mm = (v: number): Millimeters => v as Millimeters;
export const nm = (v: number): Nanometers => v as Nanometers;
export const rad = (v: number): Radians => v as Radians;
export const deg = (v: number): Degrees => v as Degrees;
export const arcmin = (v: number): Arcminutes => v as Arcminutes;
export const diopters = (v: number): Diopters => v as Diopters;
export const cpd = (v: number): CyclesPerDegree => v as CyclesPerDegree;
export const rho = (v: number): NormalizedRadius => v as NormalizedRadius;

/* -------------------------------------------------------------------------- */
/* Conversions                                                                */
/* -------------------------------------------------------------------------- */

export const nmToUm = (v: Nanometers): Micrometers => (v / 1000) as Micrometers;
export const umToNm = (v: Micrometers): Nanometers => (v * 1000) as Nanometers;

export const mmToUm = (v: Millimeters): Micrometers => (v * 1000) as Micrometers;
export const umToMm = (v: Micrometers): Millimeters => (v / 1000) as Millimeters;

export const degToRad = (v: Degrees): Radians => ((v * Math.PI) / 180) as Radians;
export const radToDeg = (v: Radians): Degrees => ((v * 180) / Math.PI) as Degrees;

export const degToArcmin = (v: Degrees): Arcminutes => (v * 60) as Arcminutes;
export const arcminToDeg = (v: Arcminutes): Degrees => (v / 60) as Degrees;

export const radToArcmin = (v: Radians): Arcminutes =>
  ((v * 180 * 60) / Math.PI) as Arcminutes;
export const arcminToRad = (v: Arcminutes): Radians =>
  ((v * Math.PI) / (180 * 60)) as Radians;

/* -------------------------------------------------------------------------- */
/* Reference values                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Wavelengths commonly used in ophthalmic optics, in nanometres.
 *
 * `dLine` (587.56 nm, helium) is the historical reference for refractive index
 * and is what most schematic eyes are specified at. `photopicPeak` (555 nm) is
 * where the light-adapted eye is most sensitive and is the usual default for
 * PSF simulation. `eLine` (546.07 nm, mercury) appears in European ophthalmic
 * standards.
 */
export const WAVELENGTHS = {
  photopicPeak: nm(555),
  dLine: nm(587.56),
  eLine: nm(546.07),
  scotopicPeak: nm(507),
} as const;

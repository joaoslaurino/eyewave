/**
 * Branded numeric types for physical quantities.
 *
 * Each type is a `number` carrying a compile-time-only tag, so mixing units is
 * a type error at no runtime cost. Units are enforced at module boundaries and
 * dropped inside numerical kernels, because TypeScript cannot propagate them
 * through arithmetic.
 *
 * See docs/conventions.md.
 */

type Brand<TTag extends string> = number & { readonly __unit: TTag };

/* -------------------------------------------------------------------------- */
/* Length                                                                     */
/* -------------------------------------------------------------------------- */

/** Micrometres. Wavefront error, optical path difference, wavelength. */
export type Micrometers = Brand<'um'>;

/** Millimetres. Pupil radius and diameter. */
export type Millimeters = Brand<'mm'>;

/** Nanometres. Wavelength as datasheets quote it. */
export type Nanometers = Brand<'nm'>;

/* -------------------------------------------------------------------------- */
/* Angle                                                                      */
/* -------------------------------------------------------------------------- */

/** Radians. Phase, and every angle passed to `Math.*`. */
export type Radians = Brand<'rad'>;

/** Degrees. Cylinder axis and meridians, on the TABO scale. */
export type Degrees = Brand<'deg'>;

/** Arcminutes. Visual angle. */
export type Arcminutes = Brand<'arcmin'>;

/* -------------------------------------------------------------------------- */
/* Optical                                                                    */
/* -------------------------------------------------------------------------- */

/** Dioptres (m^-1). Sphere, cylinder, add, defocus. */
export type Diopters = Brand<'D'>;

/** Cycles per degree. Spatial frequency, the x axis of an MTF plot. */
export type CyclesPerDegree = Brand<'cpd'>;

/** Normalised radial pupil coordinate, rho in [0, 1]. */
export type NormalizedRadius = Brand<'rho'>;

/* -------------------------------------------------------------------------- */
/* Constructors                                                               */
/* -------------------------------------------------------------------------- */

/** These assert units rather than validate them; keep them at the edges. */

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

/** Standard ophthalmic wavelengths. See docs/conventions.md. */
export const WAVELENGTHS = {
  photopicPeak: nm(555),
  dLine: nm(587.56),
  eLine: nm(546.07),
  scotopicPeak: nm(507),
} as const;

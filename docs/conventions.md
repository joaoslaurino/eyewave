# Conventions

Implemented by [`src/core/units.ts`](../src/core/units.ts).

## Coordinate system

The pupil is viewed from in front of the eye, as an examiner sees it. The
$x$ axis runs horizontally to the examiner's right, $y$ vertically upwards, and
$\theta$ is measured counter-clockwise from the positive $x$ axis. This is the
right-handed convention of the OSA/ANSI standard and it applies to both eyes.

Zernike polynomials are defined on the **unit disc**, so the physical pupil is
always mapped to $\rho \in [0,1]$ regardless of its size:

$$\rho = \frac{\sqrt{x^2 + y^2}}{r}, \qquad \theta = \operatorname{atan2}(y, x)$$

That normalisation is the reason a coefficient set is meaningless without the
pupil radius it was measured over. The same eye measured at 3 mm and at 6 mm
produces genuinely different coefficients — see the scaling discussion in
[refraction.md](refraction.md#why-the-pupil-radius-appears-squared).

## Units

| Quantity | Unit | Why |
|---|---|---|
| Wavefront error, OPD, Zernike coefficients | µm | The clinical convention; typical values are 0.01–2 µm |
| Wavelength | nm on input, µm internally | Datasheets quote nm; the phase term needs the same unit as $W$ |
| Pupil radius and diameter | mm | The clinical convention |
| Refractive power | dioptres (m⁻¹) | Prescriptions |
| Cylinder axis | degrees, 0–180 | Prescriptions (TABO scale) |
| Phase, and every angle passed to `Math.*` | radians | Required by the standard library |
| Visual angle | arcminutes | 1 arcmin is the classical resolution limit of a healthy eye |
| Spatial frequency | cycles per degree | The x axis of an MTF plot |

### A convenient accident

Because a dioptre is m⁻¹ and the pupil radius is in millimetres, the expression

$$\frac{M\,r^2}{4\sqrt{3}}, \qquad [M] = \mathrm{D},\ [r] = \mathrm{mm}$$

comes out directly in micrometres, with no conversion factor:

$$\mathrm{D} \cdot \mathrm{mm}^2 = \mathrm{m}^{-1} \cdot 10^{-6}\,\mathrm{m}^2 = 10^{-6}\,\mathrm{m} = \upmu\mathrm{m}$$

This is why every refraction-to-Zernike formula in this project takes the radius
in millimetres and returns micrometres. It is a coincidence of the units
clinicians happen to use, but a useful one.

## Branded types

Physical quantities are represented as branded numbers — a `number` intersected
with a compile-time-only tag:

```ts
type Micrometers = number & { readonly __unit: 'um' };
```

The tag exists only for the type checker. After transpilation every value is an
ordinary IEEE-754 double, so the safety costs nothing at runtime.

### Why bother

Unit errors in numerical code do not crash. They produce plausible-looking wrong
answers, which is the worst failure mode there is. The Mars Climate Orbiter was
lost in 1999 because one module produced pound-force-seconds and another read
newton-seconds; no software failed, the spacecraft simply arrived at the wrong
altitude. A type system that distinguishes micrometres from radians turns that
class of mistake into a compile error.

### The limitation, and the rule that follows from it

TypeScript cannot propagate units through arithmetic. Adding two `Micrometers`
widens the result back to `number`, because the language has no notion of
dimensional algebra the way F# or `uom` in Rust do. Wrapping every operation in
`add()` and `mul()` helpers would destroy both readability and speed in an inner
loop.

So the project follows one rule:

> **Units at the boundaries, raw numbers in the kernels.**

Public functions accept and return branded types, so wiring two modules together
with mismatched units fails to compile. Inside a numerical kernel — an FFT
butterfly, a Horner evaluation — values are plain `number` and are re-annotated
on the way out. This catches errors where they actually happen, at the seams
between modules, without poisoning the mathematics.

## Reference wavelengths

| Name | Value | Use |
|---|---|---|
| Photopic peak | 555 nm | Where the light-adapted eye is most sensitive; the default for PSF simulation |
| Scotopic peak | 507 nm | Rod-mediated vision. The shift towards blue at night is the Purkinje shift |
| d-line (helium) | 587.56 nm | Historical reference for refractive index; most schematic eyes are specified here |
| e-line (mercury) | 546.07 nm | European ophthalmic standards |

# Rescaling coefficients to a different pupil

Implemented by [`src/core/pupilScaling.ts`](../src/core/pupilScaling.ts).

Zernike coefficients are defined over the **normalised** disc, $\rho \in [0,1]$,
so they say nothing by themselves about how large the pupil was. Changing the
pupil is therefore not a matter of scaling the coefficients by a power — the
modes **mix**.

## Why the modes mix

Orthogonality is a property of a *specific* disc. Restricted to a smaller
concentric disc, $R_4^0$ is no longer orthogonal to $R_2^0$, so part of it
projects onto defocus. The new coefficient set has to redistribute the same
physical wavefront across a basis that has been redefined underneath it.

The mixing is confined, though. Scaling is purely **radial**, so the angular
factor $\cos m\theta$ or $\sin |m|\theta$ is untouched and the transformation is
**block-diagonal in $m$**. Coma can never produce astigmatism; spherical
aberration can only produce defocus and piston.

## The clinical consequence

This is not a numerical curiosity. Because spherical aberration contributes
defocus, and the amount depends on pupil size, **the best focus of an eye moves
as its pupil dilates**. That is the mechanism of night myopia: the pupil opens in
dim light, positive spherical aberration converts into a myopic shift, and the
patient who saw well in the clinic cannot read a road sign.

An eye can also look nearly diffraction-limited at 3 mm and be severely
aberrated at 6 mm, since higher-order terms scale roughly as $r^n$. A simulator
whose higher-order RMS ignores the pupil cannot show either effect.

## The algorithm

Rather than implementing a published closed form (Schwiegerling 2002, Campbell
2003, Lundström & Unsbo 2007), the transformation is assembled from parts the
project already has. It is exact, and it makes the mechanism visible.

Work one azimuthal frequency at a time. Let $\varepsilon = R_2/R_1$ and consider
the family $n = |m|, |m|+2, \dots$ with $t$ indexing it.

**1. Change to the power basis.** Every radial polynomial in the family is a
combination of $\rho^{|m|}, \rho^{|m|+2}, \dots$ — and those coefficients are
exactly what `radialCoefficients` already returns:

$$R_{|m|+2t}^{|m|}(\rho) = \sum_{u \le t} A_{tu}\, \rho^{\,|m| + 2u}$$

The matrix $A$ is lower-triangular by construction. With $N_t$ the
normalisation, the wavefront in the power basis is

$$p_u = \sum_{t \ge u} c_t\, N_t\, A_{tu}$$

**2. Scale.** The substitution $\rho \to \varepsilon\rho$ is trivial here,
because each basis function is a single power:

$$p'_u = p_u\, \varepsilon^{\,|m| + 2u}$$

**3. Change back.** Solve $p'_u = \sum_{t \ge u} c'_t N_t A_{tu}$ for the new
coefficients. The system is triangular, so back-substitution from the highest
order downwards gives them directly, with no matrix inversion.

### Why this route was preferred

It depends on no formula that has to be remembered correctly. The published
expressions involve nested sums over binomial coefficients and are easy to
transcribe wrongly — the kind of error that produces plausible numbers. Here
every ingredient is already tested: the radial coefficients are exact integers
verified against orthonormality, and the only new step is linear algebra on a
triangular matrix.

## The decisive test

The physical wavefront does not care which pupil it is described over. A point
at normalised radius $\rho$ in the smaller pupil sits at $\varepsilon\rho$ in the
larger one, so

$$\sum_j c'_j\, Z_j(\rho, \theta) \;=\; \sum_j c_j\, Z_j(\varepsilon\rho, \theta)$$

must hold at every point. The test asserts this to $10^{-10}$ across a spread of
radii, azimuths and scale factors. Any error in the derivation shows up
immediately, whatever its origin.

**The identity is exact including piston.** This is worth stating because the
opposite assumption is tempting: piston looks like a nuisance term that rescaling
merely shifts. It is not — the piston coefficient changes by precisely the amount
needed to preserve the wavefront pointwise, and subtracting a "piston
correction" breaks the identity. When this test was first written with such a
correction, it failed on exactly the $m = 0$ families and nowhere else, since
those are the only families containing piston at all.

## Enlarging the pupil

Shrinking is exact. **Enlarging is mathematically well defined but physically an
extrapolation**: the original coefficients describe the wavefront only inside the
pupil they were measured over, and continuing the polynomial outwards invents
data. The implementation allows it, because a simulator needs to sweep the pupil
freely, and the bench labels the case rather than hiding it.

## How the simulator uses it

Higher-order coefficients are declared over a **reference pupil**, as an
aberrometer reports them, and rescaled to the pupil under analysis. The
refraction is then **added** to the second-order terms rather than overwriting
them — otherwise the defocus induced from spherical aberration would be
destroyed, and with it the effect the rescaling exists to show. See
`withAddedRefraction` in [`wavefront.ts`](../src/core/wavefront.ts).

## References

- Schwiegerling, J. (2002). *Scaling Zernike expansion coefficients to different
  pupil sizes.* JOSA A 19(10), 1937–1945.
- Campbell, C. E. (2003). *Matrix method to find a new set of Zernike
  coefficients from an original set when the aperture radius is changed.*
  JOSA A 20(2), 209–217.
- Lundström, L. & Unsbo, P. (2007). *Transformation of Zernike coefficients:
  scaled, translated, and rotated wavefronts with circular and elliptical
  pupils.* JOSA A 24(3), 569–577.

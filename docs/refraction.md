# Refraction and its Zernike equivalent

Implemented by [`src/core/refraction.ts`](../src/core/refraction.ts).

A prescription and a set of Zernike coefficients are not two descriptions of
different things. Sphere and cylinder **are** the second-order Zernike terms,
written in the units a clinician uses. This document derives the correspondence
exactly.

## Sphere, cylinder, axis

A sphero-cylindrical refraction $S / C \times \alpha$ describes an eye whose
refractive power varies with meridian:

$$P(\varphi) = S + C\sin^2(\varphi - \alpha)$$

The axis $\alpha$ is the meridian carrying power $S$ alone; the meridian
perpendicular to it carries $S + C$. Axis is measured in degrees on the TABO
scale — counter-clockwise from horizontal as the examiner views the eye,
written from 1 to 180, because a meridian is indistinguishable from the one
180° away.

### Transposition

The same eye can be written two ways:

$$S' = S + C, \qquad C' = -C, \qquad \alpha' = \alpha \pm 90° \pmod{180°}$$

So `-2.00 -1.00 × 180` and `-3.00 +1.00 × 90` are **the same eye**. Which form is
written down is a regional and professional habit — negative cylinder is usual
in optometry and in most of the Americas, positive cylinder in much of
ophthalmology and parts of Europe. Software that assumes one silently corrupts
the other, so the conversion is implemented and tested rather than assumed.

### Spherical equivalent

$$M = S + \frac{C}{2}$$

The single spherical power that best represents the eye — the mean of the two
principal meridians, and the plane of the circle of least confusion.

## Power vectors

$S/C\times\alpha$ is a poor coordinate system for computation. The axis is
circular and discontinuous at 180°, and the sphere/cylinder split is arbitrary
under transposition. Averaging two prescriptions componentwise gives nonsense.

Thibos' power vector decomposition fixes this by writing the same information in
three orthogonal Cartesian components:

$$M = S + \frac{C}{2}, \qquad J_0 = -\frac{C}{2}\cos 2\alpha, \qquad J_{45} = -\frac{C}{2}\sin 2\alpha$$

- $M$ — spherical equivalent, the rotationally symmetric part.
- $J_0$ — cardinal astigmatism. Positive means power along the horizontal
  meridian exceeds the vertical (against-the-rule); negative is with-the-rule.
- $J_{45}$ — oblique astigmatism, at 45°/135°.

The meridional power is then simply

$$P(\varphi) = M + J_0\cos 2\varphi + J_{45}\sin 2\varphi$$

and the components can be averaged, subtracted and analysed statistically like
ordinary numbers. The doubling of the angle is what removes the 180° ambiguity:
a meridian rotating through 180° takes $2\alpha$ through a full turn.

Inverting the decomposition:

$$C = -2\sqrt{J_0^2 + J_{45}^2}, \qquad \alpha = \tfrac{1}{2}\operatorname{atan2}(J_{45}, J_0), \qquad S = M - \frac{C}{2}$$

which returns the negative-cylinder form.

## Deriving the Zernike correspondence

### The wavefront of a refractive error

In the paraxial approximation, a refractive error of power $P$ produces a
wavefront error

$$W(x,y) = -\tfrac{1}{2}P\,(x^2+y^2)$$

with $x, y$ in metres, $W$ in metres and $P$ in dioptres. Splitting the general
sphero-cylindrical case into its power-vector components:

$$W(x,y) = -\tfrac{1}{2}\Big[\,M(x^2+y^2) \;+\; J_0(x^2-y^2) \;+\; 2J_{45}\,xy\,\Big]$$

This is consistent with the meridional power formula: setting $y=0$ gives
$-\tfrac{1}{2}(M+J_0)x^2$, and $P(0) = M + J_0$ as required.

### Converting to normalised pupil coordinates

With $x = r\rho\cos\theta$ and $y = r\rho\sin\theta$:

$$x^2+y^2 = r^2\rho^2, \qquad x^2-y^2 = r^2\rho^2\cos 2\theta, \qquad 2xy = r^2\rho^2\sin 2\theta$$

so

$$W = -\tfrac{1}{2}r^2\rho^2\big[\,M + J_0\cos 2\theta + J_{45}\sin 2\theta\,\big]$$

### Matching against the Zernike modes

The relevant normalised polynomials are

$$Z_2^0 = \sqrt{3}\,(2\rho^2-1), \qquad Z_2^2 = \sqrt{6}\,\rho^2\cos 2\theta, \qquad Z_2^{-2} = \sqrt{6}\,\rho^2\sin 2\theta$$

For the astigmatic terms the match is immediate, since $\rho^2\cos 2\theta = Z_2^2/\sqrt6$:

$$c_2^{2} = -\frac{J_0\,r^2}{2\sqrt6}, \qquad c_2^{-2} = -\frac{J_{45}\,r^2}{2\sqrt6}$$

For defocus, substitute $\rho^2 = \tfrac{1}{2}\!\left(\dfrac{Z_2^0}{\sqrt3} + 1\right)$:

$$-\tfrac{1}{2}M r^2 \rho^2 = -\frac{M r^2}{4\sqrt3}Z_2^0 \;-\; \frac{Mr^2}{4}$$

The trailing constant is piston, which shifts the whole wavefront uniformly and
has no effect on image quality, so it is discarded:

$$c_2^{0} = -\frac{M\,r^2}{4\sqrt3}$$

### The result

$$\boxed{\;c_2^{0} = -\frac{\left(S + C/2\right)r^{2}}{4\sqrt3}, \qquad c_2^{2} = \frac{C\,r^{2}\cos 2\alpha}{4\sqrt6}, \qquad c_2^{-2} = \frac{C\,r^{2}\sin 2\alpha}{4\sqrt6}\;}$$

with $r$ in millimetres, $S$ and $C$ in dioptres, and the coefficients in
micrometres — see the unit accident noted in
[conventions.md](conventions.md#a-convenient-accident).

The astigmatic forms follow from substituting $J_0 = -\tfrac{C}{2}\cos 2\alpha$
into $c_2^2 = -J_0 r^2 / (2\sqrt6)$; note the sign change and the factor 4 in
the denominator, both easy to get wrong.

Inverting:

$$M = -\frac{4\sqrt3\,c_2^{0}}{r^2}, \qquad J_0 = -\frac{2\sqrt6\,c_2^{2}}{r^2}, \qquad J_{45} = -\frac{2\sqrt6\,c_2^{-2}}{r^2}$$

## Why the pupil radius appears squared

Every formula above carries $r^2$, and this has a consequence that matters
clinically.

A useful reference point: one micrometre of defocus over a **6 mm** pupil
($r = 3$ mm) corresponds to

$$M = -\frac{4\sqrt3 \times 1}{3^2} \approx -0.77\ \mathrm{D}$$

Over a **3 mm** pupil ($r = 1.5$ mm) the same micrometre corresponds to
$-3.08$ D — four times as much. Equivalently, a fixed refractive error produces
four times the wavefront error when the pupil doubles.

Higher-order aberrations scale even more steeply, with $r^n$. This is why an eye
can look nearly diffraction-limited at 3 mm in a bright clinic and produce
severe halos at 6 mm while driving at night, and it is why the pupil slider is
the most prominent control in the interface.

It is also why **a coefficient set without its pupil diameter is unusable**.
Rescaling coefficients between pupil sizes is possible but is not a simple
multiplication: modes of different order mix, because a truncated $\rho^4$ term
projects partly onto $\rho^2$. That conversion is deferred to a later phase.

## References

- Thibos, L. N., Wheeler, W., Horner, D. (1997). *Power vectors: an application
  of Fourier analysis to the description and statistical analysis of refractive
  error.* Optometry and Vision Science, 74(6), 367–375.
- Thibos, L. N., Applegate, R. A., Schwiegerling, J. T., Webb, R. (2002).
  *Standards for reporting the optical aberrations of eyes.*
  Journal of Refractive Surgery, 18(5), S652–S660.
- Atchison, D. A. & Smith, G. *Optics of the Human Eye*, ch. 15.

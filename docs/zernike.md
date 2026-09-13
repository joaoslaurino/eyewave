# The Zernike basis

Implemented by [`src/core/zernike.ts`](../src/core/zernike.ts).

## Why this basis

A wavefront error map $W(\rho,\theta)$ over a circular pupil could be described
by any complete set of functions. Zernike polynomials are used in ophthalmic
optics for two reasons.

**They are orthogonal over the circular pupil.** Each mode is an independent
contribution, so removing defocus does not disturb coma, and fitting a
measurement to the basis gives coefficients that do not change when you add more
terms to the fit. A non-orthogonal basis has neither property.

**Their low-order terms are the clinical quantities.** Second-order Zernike terms
*are* sphere and cylinder, exactly — not an approximation of them. That
correspondence is derived in [refraction.md](refraction.md). Higher orders are
the aberrations that spectacles cannot correct: coma, trefoil, spherical
aberration.

## Definition

For a mode with radial order $n \ge 0$ and azimuthal frequency $m$, where
$|m| \le n$ and $n - |m|$ is even:

$$
Z_n^m(\rho,\theta) =
\begin{cases}
N_n^m\, R_n^{|m|}(\rho)\, \cos(m\theta) & m \ge 0 \\[4pt]
N_n^m\, R_n^{|m|}(\rho)\, \sin(|m|\theta) & m < 0
\end{cases}
$$

The constraint that $n - |m|$ be even is not a convention — it falls out of the
radial polynomial, which would otherwise need half-integer powers. There is no
$Z_2^1$.

### Radial polynomial

$$
R_n^{|m|}(\rho) = \sum_{k=0}^{s} \frac{(-1)^k\,(n-k)!}{k!\left(\frac{n+|m|}{2}-k\right)!\left(\frac{n-|m|}{2}-k\right)!}\,\rho^{\,n-2k},
\qquad s = \frac{n-|m|}{2}
$$

Two properties are worth memorising, because both make excellent tests:

$$R_n^{|m|}(1) = 1 \quad \text{for every mode}, \qquad R_n^n(\rho) = \rho^n$$

### Normalisation

$$N_n^m = \sqrt{\frac{2(n+1)}{1 + \delta_{m0}}}$$

This is the factor that gives a coefficient physical meaning. It scales each
polynomial to **unit RMS over the pupil**, so:

- a coefficient of 0.25 µm means that mode contributes exactly 0.25 µm of RMS
  wavefront error;
- the total RMS across modes is the root of the sum of squares of the
  coefficients;
- coma and spherical aberration are on the same scale and can be compared.

Without it the coefficients are on incomparable scales and cannot be combined at
all. The Kronecker delta handles the rotationally symmetric modes: defocus and
spherical aberration have no $\cos$ or $\sin$ factor to average over, so they
need a factor $\sqrt{2}$ less than the rest.

### Orthonormality

$$\frac{1}{\pi}\iint_{\rho \le 1} Z_i\, Z_j \, \mathrm{d}A = \delta_{ij}$$

This single identity validates the radial coefficients, the normalisation and
the angular factors simultaneously. It is the project's strongest test of the
basis: if any of the three were wrong, either the off-diagonal terms would stop
vanishing or the diagonal would drift away from one.

The test integrates it with Gauss–Legendre quadrature radially and a uniform
rule azimuthally. An $n$-node Gauss–Legendre rule integrates polynomials of
degree up to $2n-1$ exactly, and products of Zernike polynomials *are*
polynomials, so the check is a machine-precision assertion rather than an
approximate one. A uniform grid would give perhaps six digits and force a loose
tolerance — and a loose tolerance hides bugs.

## OSA/ANSI indexing

Modes are addressed by a single index:

$$j = \frac{n(n+2) + m}{2}$$

Inverting it means solving $n^2 + 2n - 2j = 0$ for the radial order and rounding
up, then recovering $m = 2j - n(n+2)$.

The ordering runs through each radial order in turn, and within an order from
the most negative $m$ to the most positive:

| $j$ | $(n,m)$ | Name |
|---|---|---|
| 0 | (0, 0) | Piston |
| 1 | (1, −1) | Vertical tilt |
| 2 | (1, 1) | Horizontal tilt |
| 3 | (2, −2) | Oblique astigmatism |
| 4 | (2, 0) | **Defocus** |
| 5 | (2, 2) | Vertical astigmatism |
| 6 | (3, −3) | Oblique trefoil |
| 7 | (3, −1) | **Vertical coma** |
| 8 | (3, 1) | **Horizontal coma** |
| 9 | (3, 3) | Horizontal trefoil |
| 10 | (4, −4) | Oblique quadrafoil |
| 11 | (4, −2) | Oblique secondary astigmatism |
| 12 | (4, 0) | **Primary spherical aberration** |
| 13 | (4, 2) | Vertical secondary astigmatism |
| 14 | (4, 4) | Horizontal quadrafoil |

The number of modes up to and including order $n$ is $(n+1)(n+2)/2$.

### Competing conventions

At least three indexing schemes are in use, and they disagree on both **order**
and, in places, **sign**:

- **OSA/ANSI** — used here, and what clinical aberrometers report.
- **Noll** — common in astronomy and adaptive optics. Starts at $j=1$, orders
  modes differently, and differs in sign on some terms.
- **Fringe (University of Arizona)** — used in optical shop testing; keeps only
  a subset of modes.

A coefficient set is meaningless without its convention **and** its pupil
radius. Both must travel with the data.

## Numerical considerations

### The real hazard is cancellation, not overflow

A double represents integers exactly up to $2^{53} \approx 9 \times 10^{15}$,
which is $18!$. Clinical aberrometry reports to sixth or eighth order, so the
factorials in the radial polynomial fit comfortably.

The actual problem is **catastrophic cancellation**. The sum alternates in sign,
and large terms nearly annihilate each other. Adding $+3\,628\,800$ and
$-3\,628\,799$ leaves a result with one significant digit although each operand
had seven. No magnitude was lost — information was. This worsens with order and
is worst near $\rho \to 0$.

### What the implementation does about it

**Exact integer coefficients.** The coefficients of the sum are always integers,
so they are computed once with `BigInt` and are exact; the only rounding is the
final conversion to double. Since the sum is alternating, any error already
present in the coefficients would be amplified rather than averaged out, so
starting from exact values matters more here than it would elsewhere. The code
asserts that the factorial ratio divides evenly, which turns a mis-derived
formula into an immediate exception instead of a plausible wrong number.

**Factored evaluation.** Every power in $R_n^{|m|}$ has the same parity as $n$,
and the lowest is $\rho^{|m|}$. Factoring that out and substituting $u = \rho^2$:

$$R_n^{|m|}(\rho) = \rho^{|m|} \sum_{t=0}^{s} a_t\, u^t$$

This halves the number of terms and lets the sum be evaluated by Horner's
method. For example $R_4^2 = 4\rho^4 - 3\rho^2 = \rho^2(-3 + 4u)$, stored as
`[-3, 4]`.

**Caching.** Coefficient arrays are computed once per $(n,|m|)$ and reused, so
the `BigInt` arithmetic never appears in a hot path.

### When this stops being enough

Beyond roughly $n = 18$ the coefficients exceed exact double precision and the
implementation throws rather than silently rounding. Going higher requires a
recurrence relation — Kintner's three-term recurrence computes $R_n^m$ from
$R_{n-2}^m$ and $R_{n-4}^m$ with no factorials at all, in $O(n)$ and with better
conditioning.

That is not needed for ophthalmic work, but implementing it later has a distinct
value: two implementations derived by different mathematical routes, agreeing to
$10^{-12}$, is far stronger evidence of correctness than either alone. The same
reasoning motivates the Python cross-validation in [`validation/`](../validation/).

## References

- Thibos, L. N., Applegate, R. A., Schwiegerling, J. T., Webb, R. (2002).
  *Standards for reporting the optical aberrations of eyes.*
  Journal of Refractive Surgery, 18(5), S652–S660. — the OSA/ANSI convention.
- Born, M. & Wolf, E. *Principles of Optics*, §9.2. — the classical treatment.
- Noll, R. J. (1976). *Zernike polynomials and atmospheric turbulence.*
  JOSA 66(3), 207–211. — the competing convention, for when you read astronomy
  papers.

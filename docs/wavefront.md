# Sampling the wavefront

Implemented by [`src/core/wavefront.ts`](../src/core/wavefront.ts).

The wavefront error map is the weighted sum of the Zernike modes:

$$W(\rho,\theta) = \sum_j c_j\, Z_j(\rho,\theta)$$

Turning that into something drawable means sampling it on a grid. The
interesting decisions are about *when* each part is computed.

## Precompute the invariant part

A 256×256 grid with 28 modes needs 1.8 million Zernike evaluations, each with a
Horner pass and a trigonometric call. At 60 frames per second that is
impossible, and it is also unnecessary: moving a slider changes the
**coefficients**, not the polynomials and not the grid.

So the work splits in two:

| When | What | Cost |
|---|---|---|
| Once per grid size | Sample every $Z_j$ into a matrix | Expensive; trigonometry here |
| Every frame | $W = \sum_j c_j \cdot \mathrm{basis}_j$ | A linear combination; multiply-add only |

Per frame this becomes a few million multiply-adds — single-digit milliseconds —
and no transcendental function is evaluated at all. The basis is rebuilt only
when the resolution or the maximum order changes.

This is the general shape of any real-time numerical interface: find the
quantity that does not change and pay for it once.

## Packed storage

The pupil is a disc inscribed in a square, so only $\pi/4 \approx 78\%$ of the
pixels are inside it. Rather than storing $N^2$ values per mode with zeros in
the corners, only the interior samples are kept, in a dense array, with an index
map back to pixel positions:

```
pixelIndex[k] -> row-major index in the size x size image
rho[k], theta[k] -> pupil coordinates of packed sample k
```

This saves a fifth of the memory and, more usefully, removes the masked pixels
from every inner loop. Metrics then operate on the packed array directly, with
no mask test, because every entry is inside the pupil by construction.

`expandToImage` reverses the packing for rendering, filling the outside with
`NaN` by default so that a renderer cannot silently treat the exterior as a
valid zero.

## Orientation

Row 0 of the image is the **top**, and corresponds to positive $y$:

$$y = 1 - \frac{2\,\mathrm{row} + 1}{N}, \qquad x = \frac{2\,\mathrm{column} + 1}{N} - 1$$

Samples are taken at pixel centres, which keeps the grid symmetric.

This flip deserves its own test, because getting it wrong is invisible to
everything else. Mirroring $y$ leaves the basis perfectly orthonormal — every
numerical identity still holds — and simply renders every aberration map upside
down. Only a visual comparison, or an explicit assertion about orientation,
catches it. The same is true of swapping sine for cosine on the $m < 0$ modes,
which rotates the map while preserving orthonormality.

This is the argument for building the visual bench early: a class of
self-consistent orientation error exists that numerical tests cannot see.

## Metrics

### RMS wavefront error

Because the basis is orthonormal, the RMS follows from the coefficients with no
reference to the grid at all:

$$\mathrm{RMS} = \sqrt{\sum_{j \ge 1} c_j^2}$$

Piston ($j = 0$) is excluded because RMS is measured about the mean and piston
only shifts it.

That identity is the module's strongest test. `rmsFromCoefficients` computes it
analytically, `sampledRms` computes it from the grid, and the two must agree. If
the sampling, the mask or the basis were wrong, they would not.

### Higher-order RMS

Excludes every mode of radial order 2 or below, leaving the aberrations a
spectacle lens cannot correct:

$$\mathrm{HORMS} = \sqrt{\sum_{n \ge 3} c_j^2}$$

Clinically this is the number that distinguishes an eye that can be made to see
well with glasses from one that cannot. A normal eye sits around 0.1–0.3 µm over
a 6 mm pupil; keratoconus or a decentred ablation can reach several micrometres.

### Peak-to-valley

The plain range $\max W - \min W$ over the pupil. Less informative than RMS
because a single outlying sample sets it, but it is what interferometry
traditionally reports. For pure defocus it has a closed form:
$W = c\sqrt3\,(2\rho^2-1)$ runs from $-\sqrt3 c$ at the centre to $+\sqrt3 c$ at
the margin, so $\mathrm{PV} = 2\sqrt3\,c$.

## Coefficient sets carry their pupil

`CoefficientSet` bundles the coefficients with the pupil radius they were
computed for, because the two are inseparable — see
[refraction.md](refraction.md#why-the-pupil-radius-appears-squared).

Updates return a new set rather than mutating, which keeps the data flow into
the interface predictable. `withRefraction` writes only the three second-order
terms and leaves higher orders untouched, so a measured aberration profile can
be held fixed while the prescription is varied — exactly the comparison the
simulator exists to make.

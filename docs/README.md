# EyeWave — theory notes

Background material for the physics implemented in [`src/core/`](../src/core/).
Code comments stay short and practical; the reasoning, derivations and
convention choices live here.

| Document | Covers | Implements |
|---|---|---|
| [conventions.md](conventions.md) | Units, coordinate system, branded types, reference wavelengths | [`units.ts`](../src/core/units.ts) |
| [zernike.md](zernike.md) | The Zernike basis: indexing, radial polynomials, normalisation, orthonormality, numerics | [`zernike.ts`](../src/core/zernike.ts) |
| [refraction.md](refraction.md) | Sphere/cylinder/axis, power vectors, and their exact correspondence with second-order Zernike terms | [`refraction.ts`](../src/core/refraction.ts) |

## Notation used throughout

| Symbol | Meaning | Units |
|---|---|---|
| $W$ | Wavefront error (optical path difference) | µm |
| $\rho, \theta$ | Normalised pupil coordinates, $\rho \in [0,1]$ | — |
| $r$ | Physical pupil radius | mm |
| $\lambda$ | Wavelength | µm |
| $c_n^m$ | Zernike coefficient of mode $(n,m)$ | µm |
| $S, C, \alpha$ | Sphere, cylinder, axis | D, D, degrees |
| $M, J_0, J_{45}$ | Power vector components | D |

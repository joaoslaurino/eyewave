# EyeWave

**An interactive, physically-grounded simulator of ocular aberrations and the Point Spread Function.**

EyeWave turns a patient's refraction or Zernike coefficients into a live visualisation of
their optical wavefront, their PSF, and — ultimately — what the world actually looks like
through that eye. Everything updates in real time as you move a slider.

> Status: **early development.** The physics roadmap is laid out below and implemented in stages.

---

## Why

A prescription like `-2.50 -1.25 × 180°` is an abstraction. So is a table of Zernike
coefficients from a Hartmann–Shack aberrometer. Neither tells you what the patient *sees*.

EyeWave closes that gap: it takes those numbers, runs them through the actual Fourier optics,
and shows you the wavefront error map, the diffraction-limited-or-not point spread function,
the modulation transfer function, and a simulated retinal image — side by side, interactively.

It is built to be **educational first and correct always**. Every number it displays should
survive comparison with an independent reference implementation, and the tests enforce that.

---

## The physics pipeline

```
Zernike coefficients  c_n^m   (OSA/ANSI indexing, µm, over a pupil of radius r)
        │
        │   W(ρ,θ) = Σ c_n^m · Z_n^m(ρ,θ)
        ▼
Wavefront error map  W(x,y)                        [µm of optical path difference]
        │
        │   P(x,y) = A(x,y) · exp( i · 2π · W(x,y) / λ )
        ▼
Complex pupil function  P(x,y)
        │
        │   PSF = | ℱ{P} |²                        [2-D FFT, then normalise]
        ▼
Point Spread Function  PSF(x,y)                    [retinal irradiance]
        │
        ├─→  OTF = ℱ{PSF},  MTF = |OTF|            [contrast vs. spatial frequency]
        ├─→  Strehl ratio, RMS wavefront error     [scalar quality metrics]
        └─→  retinal image = object ⊛ PSF          [simulated vision]
```

### Refraction ↔ Zernike

Sphere/cylinder/axis are not a separate world from Zernike — they *are* the second-order
terms. For a pupil of radius `r` (mm), with sphere `S`, cylinder `C` (dioptres, negative-cyl
convention) and axis `θ`:

$$
c_2^{0} = -\frac{\left(S + C/2\right) r^{2}}{4\sqrt{3}}
\qquad
c_2^{2} = -\frac{C\, r^{2} \cos 2\theta}{2\sqrt{6}}
\qquad
c_2^{-2} = -\frac{C\, r^{2} \sin 2\theta}{2\sqrt{6}}
$$

EyeWave therefore offers **two input modes over one engine**:

- **Clinical** — sphere, cylinder, axis, add. What is written on a prescription.
- **Aberrometric** — individual Zernike coefficients up to the 6th radial order.

Change one and the other updates, which makes the relationship between them visible rather
than theoretical.

### Pupil size matters more than anything

Higher-order aberrations scale with high powers of the pupil radius. At 3 mm an eye can look
nearly diffraction-limited; at 6 mm the same eye can show dramatic coma and spherical
aberration. The pupil slider is, deliberately, the most prominent control in the interface.

---

## Correctness

Physics code fails silently. EyeWave defends against that on three levels:

1. **Analytic ground truth.** A perfect circular pupil must produce an Airy pattern, with its
   first zero at `1.22 λ/D`. Tests assert this numerically.
2. **Basis orthonormality.** Zernike polynomials satisfy `∬ Z_i Z_j dA = π δ_ij` over the unit
   disc. Numerical integration of the implemented basis must reproduce that identity.
3. **Cross-validation against Python.** Reference PSFs and MTFs are generated with
   `numpy`/`scipy` in [`validation/`](validation/), exported as fixtures, and compared against
   the TypeScript engine in CI.

Unit discipline is enforced in the type system: optical path difference, wavelength, phase,
pupil coordinates and visual angle are distinct branded types, so mixing micrometres with
radians is a compile error rather than a plausible-looking wrong picture.

---

## Tech stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | Unit-safety in numerical code |
| Build | Vite | Fast HMR, trivial static deploy |
| UI | React | Controls, panels, presets |
| Rendering | Canvas 2D → WebGL2 | 2D is enough for the MVP; GPU when resolution demands it |
| Numerics | Hand-written Cooley–Tukey FFT | Written from scratch, on purpose — Fourier optics is the point |
| Tests | Vitest | Analytic and fixture-based numerical assertions |
| Reference | Python (numpy/scipy) | Independent implementation for cross-validation |

No runtime dependency does the optics for us. The FFT, the Zernike basis and the propagation
are all implemented in this repository.

---

## Project layout

```
src/
  core/        pure physics — no UI imports, fully unit-tested
    zernike.ts       polynomial basis, OSA/ANSI indexing and normalisation
    refraction.ts    S/C/axis ↔ Zernike, spherical equivalent, transposition
    wavefront.ts     coefficient set → sampled W(x,y) over the pupil
    fft.ts           Cooley–Tukey radix-2, 1-D and 2-D
    psf.ts           complex pupil → PSF, with correct physical scaling
    metrics.ts       RMS, Strehl, MTF, encircled energy
    units.ts         branded numeric types
  render/      colour maps, canvas painting, axis scaling
  viz/         wavefront / PSF / MTF visual components
  ui/          controls, presets, layout
tests/         numerical test suites
validation/    Python reference notebooks and generated fixtures
docs/          the mathematics, written out
```

---

## Roadmap

- [ ] **Phase 0 — Foundation.** Repository, tooling, CI, project structure.
- [ ] **Phase 1 — MVP.** Zernike basis to 4th order, wavefront map, FFT-based PSF,
      clinical and aberrometric input, pupil slider. Real-time and usable.
- [ ] **Phase 2 — Metrics & realism.** MTF, Strehl ratio, RMS; convolution with optotypes
      and a night-driving scene; wavelength dependence.
- [ ] **Phase 3 — Deeper physics.** Longitudinal chromatic aberration, Stiles–Crawford
      effect, through-focus PSF, depth of focus.
- [ ] **Phase 4 — Clinical & educational.** Presets (keratoconus, post-LASIK, cataract),
      aberrometer CSV import, guided tutorial mode for each Zernike term.

---

## Running locally

Requires Node.js 20 or newer.

```bash
git clone https://github.com/joaoslaurino/eyewave.git
cd eyewave
npm install
npm run dev
```

---

## References

- Thibos, L. N. et al. *Standards for reporting the optical aberrations of eyes.*
  Journal of Refractive Surgery, 2002. — the OSA/ANSI Zernike convention used here.
- Goodman, J. W. *Introduction to Fourier Optics.* — the propagation mathematics.
- Atchison, D. A. & Smith, G. *Optics of the Human Eye.* — ocular parameters and conventions.

---

## Licence

MIT — see [LICENSE](LICENSE).

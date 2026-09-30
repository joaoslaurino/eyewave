/**
 * Development bench for the physics core.
 *
 * Deliberately plain TypeScript and DOM: no framework, no state library. Its job
 * is to make the output of src/core/ visible so that orientation and sign errors
 * — which stay invisible to the numerical tests — can be caught by eye.
 */

import { deg, diopters, mm, um } from '../core/units';
import { modesUpTo, osaIndex } from '../core/zernike';
import { zernikeToRefraction } from '../core/refraction';
import {
  createPupilGrid,
  createZernikeBasis,
  createCoefficientSet,
  withCoefficient,
  withAddedRefraction,
  evaluateWavefront,
  expandToImage,
  rmsFromCoefficients,
  higherOrderRms,
  peakToValley,
  type PupilGrid,
  type ZernikeBasis,
} from '../core/wavefront';
import { scaleCoefficients } from '../core/pupilScaling';
import { coolWarm, toCssGradient } from '../render/colormap';
import { paintField, symmetricRange } from '../render/field';

const MAX_ORDER = 4;

/** Display names for the modes up to fourth order, in OSA index order. */
const MODE_NAMES: readonly string[] = [
  'Piston',
  'Vertical tilt',
  'Horizontal tilt',
  'Oblique astigmatism',
  'Defocus',
  'Vertical astigmatism',
  'Oblique trefoil',
  'Vertical coma',
  'Horizontal coma',
  'Horizontal trefoil',
  'Oblique quadrafoil',
  'Oblique secondary astigmatism',
  'Spherical aberration',
  'Vertical secondary astigmatism',
  'Horizontal quadrafoil',
];

/** The higher-order modes exposed as sliders: everything of order 3 and 4. */
const HIGHER_ORDER_INDICES = [6, 7, 8, 9, 10, 11, 12, 13, 14] as const;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing element: ${selector}`);
  return element;
}

/* -------------------------------------------------------------------------- */
/* Sliders                                                                    */
/* -------------------------------------------------------------------------- */

interface SliderSpec {
  readonly key: string;
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly format: (value: number) => string;
}

interface Slider {
  readonly spec: SliderSpec;
  readonly input: HTMLInputElement;
  readonly output: HTMLOutputElement;
}

const sliders = new Map<string, Slider>();

function addSliders(container: HTMLElement, specs: readonly SliderSpec[], onChange: () => void) {
  for (const spec of specs) {
    const wrapper = document.createElement('div');
    wrapper.className = 'control';

    const head = document.createElement('div');
    head.className = 'control-head';

    const label = document.createElement('label');
    label.htmlFor = `slider-${spec.key}`;
    label.textContent = spec.label;

    const output = document.createElement('output');
    output.textContent = spec.format(spec.value);

    const input = document.createElement('input');
    input.type = 'range';
    input.id = `slider-${spec.key}`;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    input.value = String(spec.value);

    input.addEventListener('input', () => {
      output.textContent = spec.format(input.valueAsNumber);
      onChange();
    });

    head.append(label, output);
    wrapper.append(head, input);
    container.append(wrapper);

    sliders.set(spec.key, { spec, input, output });
  }
}

function read(key: string): number {
  const slider = sliders.get(key);
  if (!slider) throw new Error(`Unknown slider: ${key}`);
  return slider.input.valueAsNumber;
}

function resetSliders() {
  for (const { spec, input, output } of sliders.values()) {
    input.value = String(spec.value);
    output.textContent = spec.format(spec.value);
  }
}

/* -------------------------------------------------------------------------- */
/* Grid and basis, rebuilt only when the resolution changes                   */
/* -------------------------------------------------------------------------- */

interface Sampling {
  readonly grid: PupilGrid;
  readonly basis: ZernikeBasis;
  readonly packed: Float64Array;
  readonly image: Float64Array;
}

function createSampling(resolution: number): Sampling {
  const grid = createPupilGrid(resolution);
  return {
    grid,
    basis: createZernikeBasis(grid, MAX_ORDER),
    packed: new Float64Array(grid.insideCount),
    image: new Float64Array(resolution * resolution),
  };
}

let sampling = createSampling(256);

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

const canvas = required<HTMLCanvasElement>('#wavefront');
const metricsBody = required<HTMLTableSectionElement>('#metrics tbody');
const legendMin = required<HTMLElement>('#legend-min');
const legendMax = required<HTMLElement>('#legend-max');

function setMetrics(rows: readonly (readonly [string, string])[]) {
  metricsBody.replaceChildren(
    ...rows.map(([name, value]) => {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = name;
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(th, td);
      return tr;
    }),
  );
}

function render() {
  const started = performance.now();

  const pupilDiameter = read('pupil');
  const pupilRadius = mm(pupilDiameter / 2);
  const referenceDiameter = read('reference');

  // Higher-order coefficients are declared over the reference pupil, the way an
  // aberrometer reports them, then rescaled to the pupil under analysis. The
  // refraction is added afterwards rather than overwritten, so the defocus the
  // rescaling induces from spherical aberration survives.
  let measured = createCoefficientSet(MAX_ORDER, mm(referenceDiameter / 2));
  for (const j of HIGHER_ORDER_INDICES) {
    measured = withCoefficient(measured, j, um(read(`c${j}`)));
  }

  const rescaled = scaleCoefficients(measured, pupilRadius);
  const inducedDefocus = rescaled.coefficients[osaIndex(2, 0)]!;

  const set = withAddedRefraction(rescaled, {
    sphere: diopters(read('sphere')),
    cylinder: diopters(read('cylinder')),
    axis: deg(read('axis')),
  });

  const { grid, basis, packed, image } = sampling;
  evaluateWavefront(basis, set, packed);
  expandToImage(grid, packed, Number.NaN, image);

  const range = symmetricRange(image);
  paintField(canvas, image, grid.size, coolWarm, range);

  const elapsed = performance.now() - started;

  legendMin.textContent = `${range.min.toFixed(2)} µm`;
  legendMax.textContent = `+${range.max.toFixed(2)} µm`;

  const recovered = zernikeToRefraction(
    {
      obliqueAstigmatism: um(set.coefficients[osaIndex(2, -2)]!),
      defocus: um(set.coefficients[osaIndex(2, 0)]!),
      verticalAstigmatism: um(set.coefficients[osaIndex(2, 2)]!),
    },
    pupilRadius,
  );

  setMetrics([
    ['Analysis pupil', `${pupilDiameter.toFixed(1)} mm`],
    [
      'Reference pupil',
      `${referenceDiameter.toFixed(1)} mm${pupilDiameter > referenceDiameter ? ' — extrapolated' : ''}`,
    ],
    ['Samples in pupil', grid.insideCount.toLocaleString('en')],
    ['RMS', `${rmsFromCoefficients(set).toFixed(3)} µm`],
    ['RMS higher-order', `${higherOrderRms(set).toFixed(3)} µm`],
    ['Peak-to-valley', `${peakToValley(packed).toFixed(3)} µm`],
    ['c₂⁰ defocus, total', `${set.coefficients[osaIndex(2, 0)]!.toFixed(3)} µm`],
    ['c₂⁰ induced by pupil', `${inducedDefocus.toFixed(3)} µm`],
    ['c₂² vertical astig', `${set.coefficients[osaIndex(2, 2)]!.toFixed(3)} µm`],
    ['c₂⁻² oblique astig', `${set.coefficients[osaIndex(2, -2)]!.toFixed(3)} µm`],
    [
      'Effective Rx',
      `${recovered.sphere.toFixed(2)} ${recovered.cylinder.toFixed(2)} × ${recovered.axis.toFixed(0)}°`,
    ],
    ['Frame time', `${elapsed.toFixed(1)} ms`],
  ]);
}

/* -------------------------------------------------------------------------- */
/* Mode gallery                                                               */
/* -------------------------------------------------------------------------- */

function buildGallery() {
  const gallery = required<HTMLElement>('#gallery');
  const grid = createPupilGrid(96);
  const basis = createZernikeBasis(grid, MAX_ORDER);
  const modes = modesUpTo(MAX_ORDER);

  gallery.replaceChildren(
    ...modes.map((mode, j) => {
      const sampled = basis.values[j]!;
      const image = expandToImage(grid, sampled);

      const cell = document.createElement('div');
      cell.className = 'mode';

      const modeCanvas = document.createElement('canvas');
      // Piston is constant, so a symmetric range would collapse; fix its scale.
      const range = j === 0 ? { min: -1, max: 1 } : symmetricRange(image);

      const label = document.createElement('div');
      label.className = 'mode-label';
      const code = document.createElement('strong');
      code.textContent = `j=${j} · Z(${mode.n}, ${mode.m})`;
      label.append(code, document.createTextNode(MODE_NAMES[j] ?? ''));

      cell.append(modeCanvas, label);
      paintField(modeCanvas, image, grid.size, coolWarm, range);
      return cell;
    }),
  );
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                     */
/* -------------------------------------------------------------------------- */

const twoDecimals = (v: number) => v.toFixed(2);

addSliders(
  required<HTMLElement>('#pupil-controls'),
  [
    {
      key: 'pupil',
      label: 'Pupil diameter',
      min: 1,
      max: 8,
      step: 0.1,
      value: 6,
      format: (v) => `${v.toFixed(1)} mm`,
    },
  ],
  render,
);

addSliders(
  required<HTMLElement>('#refraction-controls'),
  [
    {
      key: 'sphere',
      label: 'Sphere',
      min: -10,
      max: 10,
      step: 0.25,
      value: 0,
      format: (v) => `${v >= 0 ? '+' : ''}${twoDecimals(v)} D`,
    },
    {
      key: 'cylinder',
      label: 'Cylinder',
      min: -6,
      max: 0,
      step: 0.25,
      value: 0,
      format: (v) => `${twoDecimals(v)} D`,
    },
    {
      key: 'axis',
      label: 'Axis',
      min: 1,
      max: 180,
      step: 1,
      value: 180,
      format: (v) => `${v.toFixed(0)}°`,
    },
  ],
  render,
);

addSliders(
  required<HTMLElement>('#reference-controls'),
  [
    {
      key: 'reference',
      label: 'Reference pupil (aberrometry)',
      min: 2,
      max: 8,
      step: 0.5,
      value: 6,
      format: (v) => `${v.toFixed(1)} mm`,
    },
  ],
  render,
);

addSliders(
  required<HTMLElement>('#hoa-controls'),
  HIGHER_ORDER_INDICES.map((j) => ({
    key: `c${j}`,
    label: `${MODE_NAMES[j]} (j=${j})`,
    min: -0.6,
    max: 0.6,
    step: 0.01,
    value: 0,
    format: (v: number) => `${v >= 0 ? '+' : ''}${twoDecimals(v)} µm`,
  })),
  render,
);

required<HTMLSelectElement>('#resolution').addEventListener('change', (event) => {
  sampling = createSampling(Number((event.target as HTMLSelectElement).value));
  render();
});

required<HTMLButtonElement>('#reset').addEventListener('click', () => {
  resetSliders();
  render();
});

required<HTMLElement>('#legend-bar').style.background = toCssGradient(coolWarm, 24);

buildGallery();
render();

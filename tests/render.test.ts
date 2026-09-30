import { describe, it, expect } from 'vitest';
import { coolWarm, viridis, toCss, toCssGradient, type Colormap } from '../src/render/colormap';
import { symmetricRange, dataRange, toPixels } from '../src/render/field';

/** Relative luminance, the quantity a colour map must order monotonically. */
function luminance([r, g, b]: readonly [number, number, number]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sample(colormap: Colormap, steps: number): number[] {
  return Array.from({ length: steps }, (_, i) => luminance(colormap(i / (steps - 1))));
}

describe('colour maps', () => {
  it('hits its endpoints and midpoint exactly', () => {
    expect(coolWarm(0)).toEqual([59, 76, 192]);
    expect(coolWarm(0.5)).toEqual([221, 221, 221]);
    expect(coolWarm(1)).toEqual([180, 4, 38]);
  });

  it('interpolates linearly between stops', () => {
    // Halfway between the stops at t = 0 and t = 0.25.
    const [r, g, b] = coolWarm(0.125);
    expect(r).toBeCloseTo((59 + 122) / 2, 9);
    expect(g).toBeCloseTo((76 + 158) / 2, 9);
    expect(b).toBeCloseTo((192 + 239) / 2, 9);
  });

  it('clamps outside [0, 1]', () => {
    expect(coolWarm(-5)).toEqual(coolWarm(0));
    expect(coolWarm(5)).toEqual(coolWarm(1));
  });

  it('returns black for non-finite input rather than throwing', () => {
    expect(coolWarm(Number.NaN)).toEqual([0, 0, 0]);
    expect(viridis(Number.POSITIVE_INFINITY)).toEqual([0, 0, 0]);
  });

  it('keeps the sequential map monotonic in lightness', () => {
    // The defining property of a map for intensity data: if lightness were not
    // monotonic, the colours would invent boundaries the data does not have.
    const luminances = sample(viridis, 64);
    for (let i = 1; i < luminances.length; i++) {
      expect(luminances[i]!).toBeGreaterThan(luminances[i - 1]!);
    }
  });

  it('makes the diverging map brightest at its neutral midpoint', () => {
    // A diverging map must not be monotonic: the midpoint is the reference value
    // and has to read as neutral, with both directions darkening away from it.
    const luminances = sample(coolWarm, 65);
    const middle = (luminances.length - 1) / 2;
    const brightest = luminances.indexOf(Math.max(...luminances));
    expect(brightest).toBe(middle);
  });

  it('formats CSS colours and gradients', () => {
    expect(toCss([59, 76, 192])).toBe('rgb(59 76 192)');
    const gradient = toCssGradient(coolWarm, 3);
    expect(gradient).toContain('linear-gradient(to right');
    expect(gradient).toContain('rgb(221 221 221) 50.0%');
  });
});

describe('symmetric range', () => {
  it('spans the largest magnitude in both directions', () => {
    const range = symmetricRange(Float64Array.from([-0.4, 0.1, 0.25]));
    expect(range.min).toBeCloseTo(-0.4, 12);
    expect(range.max).toBeCloseTo(0.4, 12);
  });

  it('stays symmetric so that zero remains the neutral midpoint', () => {
    // With an asymmetric range the colour map would lie: zero would stop being
    // the neutral colour and the sign of a region could not be read.
    const range = symmetricRange(Float64Array.from([0, 0.1, 0.2, 0.9]));
    expect(range.min).toBeCloseTo(-range.max, 12);
  });

  it('ignores non-finite samples', () => {
    const range = symmetricRange(Float64Array.from([Number.NaN, 0.3, Number.NaN]));
    expect(range.max).toBeCloseTo(0.3, 12);
  });

  it('falls back to a floor for an all-zero field', () => {
    const range = symmetricRange(new Float64Array(16));
    expect(range.max).toBeGreaterThan(0);
    expect(range.min).toBeLessThan(0);
  });
});

describe('data range', () => {
  it('spans the finite values present', () => {
    const range = dataRange(Float64Array.from([2, 5, Number.NaN, 9]));
    expect(range.min).toBe(2);
    expect(range.max).toBe(9);
  });

  it('opens a floor for a constant field', () => {
    const range = dataRange(Float64Array.from([3, 3, 3]));
    expect(range.max).toBeGreaterThan(range.min);
  });

  it('survives an entirely non-finite field', () => {
    const range = dataRange(Float64Array.from([Number.NaN, Number.NaN]));
    expect(range.min).toBe(0);
    expect(range.max).toBeGreaterThan(0);
  });
});

describe('pixel conversion', () => {
  const range = { min: -1, max: 1 };

  it('maps the range endpoints to the map endpoints', () => {
    const pixels = toPixels(Float64Array.from([-1, 1, 0, 0]), 2, coolWarm, range);

    expect([pixels[0], pixels[1], pixels[2]]).toEqual([59, 76, 192]);
    expect([pixels[4], pixels[5], pixels[6]]).toEqual([180, 4, 38]);
    expect([pixels[8], pixels[9], pixels[10]]).toEqual([221, 221, 221]);
  });

  it('makes non-finite samples fully transparent', () => {
    const pixels = toPixels(Float64Array.from([Number.NaN, 0, 0, 0]), 2, coolWarm, range);
    expect(pixels[3]).toBe(0);
    expect(pixels[7]).toBe(255);
  });

  it('writes opaque alpha for every finite sample', () => {
    const pixels = toPixels(Float64Array.from([0.2, -0.3, 0.9, -0.9]), 2, coolWarm, range);
    for (let i = 3; i < pixels.length; i += 4) expect(pixels[i]).toBe(255);
  });

  it('collapses safely when the range has zero span', () => {
    const pixels = toPixels(Float64Array.from([5, 5, 5, 5]), 2, coolWarm, { min: 5, max: 5 });
    expect([pixels[0], pixels[1], pixels[2]]).toEqual([59, 76, 192]);
  });

  it('reuses a supplied buffer', () => {
    const buffer = new Uint8ClampedArray(16);
    const returned = toPixels(new Float64Array(4), 2, coolWarm, range, buffer);
    expect(returned).toBe(buffer);
  });

  it('rejects mismatched sizes', () => {
    expect(() => toPixels(new Float64Array(5), 2, coolWarm, range)).toThrow(RangeError);
    expect(() => toPixels(new Float64Array(4), 2, coolWarm, range, new Uint8ClampedArray(4))).toThrow(
      RangeError,
    );
  });
});

/**
 * Gauss-Legendre quadrature, used by the orthonormality tests.
 *
 * An n-node Gauss-Legendre rule integrates any polynomial of degree up to
 * 2n - 1 exactly, up to floating-point rounding. That property is what makes it
 * the right tool here: products of Zernike polynomials are themselves
 * polynomials, so a modest number of nodes turns the orthonormality check into
 * a machine-precision assertion rather than a "close enough" one. A uniform
 * grid with the same number of points would only get a few digits.
 *
 * Nodes are the roots of the Legendre polynomial P_n, found by Newton's method
 * with the standard Chebyshev-like starting guess.
 */

export interface QuadratureRule {
  readonly nodes: Float64Array;
  readonly weights: Float64Array;
}

/** Gauss-Legendre rule with `n` nodes on the interval [-1, 1]. */
export function gaussLegendre(n: number): QuadratureRule {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`Node count must be a positive integer, got ${n}.`);
  }

  const nodes = new Float64Array(n);
  const weights = new Float64Array(n);

  for (let i = 0; i < n; i++) {
    // Asymptotic approximation of the i-th root, accurate enough that Newton
    // converges in three or four iterations.
    let x = Math.cos((Math.PI * (i + 0.75)) / (n + 0.5));
    let derivative = 0;

    for (let iteration = 0; iteration < 100; iteration++) {
      // Legendre recurrence: (j + 1) P_{j+1} = (2j + 1) x P_j - j P_{j-1}.
      let current = 1; // P_0
      let previous = 0; // P_{-1}
      for (let j = 0; j < n; j++) {
        const older = previous;
        previous = current;
        current = ((2 * j + 1) * x * previous - j * older) / (j + 1);
      }
      // After the loop: current = P_n(x), previous = P_{n-1}(x).
      derivative = (n * (x * current - previous)) / (x * x - 1);

      const step = -current / derivative;
      x += step;
      if (Math.abs(step) < 1e-15) break;
    }

    nodes[i] = x;
    weights[i] = 2 / ((1 - x * x) * derivative * derivative);
  }

  return { nodes, weights };
}

/** Gauss-Legendre rule with `n` nodes rescaled to the interval [a, b]. */
export function gaussLegendreOn(n: number, a: number, b: number): QuadratureRule {
  const base = gaussLegendre(n);
  const halfWidth = (b - a) / 2;
  const midpoint = (a + b) / 2;

  const nodes = new Float64Array(n);
  const weights = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    nodes[i] = midpoint + halfWidth * base.nodes[i]!;
    weights[i] = halfWidth * base.weights[i]!;
  }

  return { nodes, weights };
}

/**
 * Uniform rule on [0, 2*pi) for integrating over the azimuth.
 *
 * For a periodic integrand the plain trapezoidal rule converges
 * spectrally, and for a trigonometric polynomial of degree below `n` it is
 * exact. Gauss-Legendre would be wasted here.
 */
export function periodicRule(n: number): QuadratureRule {
  const nodes = new Float64Array(n);
  const weights = new Float64Array(n);
  const step = (2 * Math.PI) / n;
  for (let i = 0; i < n; i++) {
    nodes[i] = i * step;
    weights[i] = step;
  }
  return { nodes, weights };
}

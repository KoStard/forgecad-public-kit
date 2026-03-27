/**
 * Hermite Curve — cubic and quintic Hermite interpolation in 3D.
 *
 * A Hermite curve is defined by position and tangent at each endpoint,
 * making it ideal for G1-continuous transitions between edges.
 *
 * Weight parameters scale tangent magnitudes relative to chord length,
 * controlling how far the curve follows each edge before turning.
 */

type Vec3 = [number, number, number];

// ── Vector helpers ──────────────────────────────────────────────────

function v3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function v3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function v3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function v3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function v3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function v3Len(v: Vec3): number {
  return Math.sqrt(v3Dot(v, v));
}

function v3Norm(v: Vec3): Vec3 {
  const len = v3Len(v);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function v3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

// ── Hermite basis functions ─────────────────────────────────────────

/** Cubic Hermite basis: H(t) = h00*P0 + h10*T0 + h01*P1 + h11*T1 */
function cubicHermiteBasis(t: number): [number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    2 * t3 - 3 * t2 + 1,   // h00: position at P0
    t3 - 2 * t2 + t,       // h10: tangent at P0
    -2 * t3 + 3 * t2,      // h01: position at P1
    t3 - t2,               // h11: tangent at P1
  ];
}

/** Derivative of cubic Hermite basis */
function cubicHermiteBasisDeriv(t: number): [number, number, number, number] {
  const t2 = t * t;
  return [
    6 * t2 - 6 * t,        // h00'
    3 * t2 - 4 * t + 1,    // h10'
    -6 * t2 + 6 * t,       // h01'
    3 * t2 - 2 * t,        // h11'
  ];
}

/** Second derivative of cubic Hermite basis */
function cubicHermiteBasisDeriv2(t: number): [number, number, number, number] {
  return [
    12 * t - 6,            // h00''
    6 * t - 4,             // h10''
    -12 * t + 6,           // h01''
    6 * t - 2,             // h11''
  ];
}

// ── HermiteCurve3D ──────────────────────────────────────────────────

export interface HermiteCurveEndpoint {
  /** Position */
  point: Vec3;
  /** Tangent direction (will be normalized internally) */
  tangent: Vec3;
  /** Weight: scales tangent magnitude relative to chord length. Default 1.0. */
  weight?: number;
}

export interface HermiteCurve3DOptions {
  /** Number of sample points for polyline output. Default 64. */
  samples?: number;
}

/**
 * A cubic Hermite curve in 3D space.
 *
 * Interpolates between two endpoints matching position and tangent (G1 continuity).
 * Weight parameters control tangent magnitude, affecting the "reach" of the curve
 * along each edge's direction before turning.
 */
export class HermiteCurve3D {
  /** Start position */
  public readonly p0: Vec3;
  /** End position */
  public readonly p1: Vec3;
  /** Scaled tangent at start (direction * weight * chordLength) */
  public readonly t0: Vec3;
  /** Scaled tangent at end (direction * weight * chordLength) */
  public readonly t1: Vec3;
  /** Chord length (straight-line distance between endpoints) */
  public readonly chordLength: number;

  constructor(start: HermiteCurveEndpoint, end: HermiteCurveEndpoint) {
    this.p0 = [...start.point];
    this.p1 = [...end.point];

    this.chordLength = v3Len(v3Sub(this.p1, this.p0));
    if (this.chordLength < 1e-9) {
      throw new Error('HermiteCurve3D: start and end points are coincident');
    }

    const wA = start.weight ?? 1.0;
    const wB = end.weight ?? 1.0;
    if (wA <= 0 || wB <= 0) {
      throw new Error('HermiteCurve3D: weights must be positive');
    }
    if (!isFinite(wA) || !isFinite(wB)) {
      throw new Error('HermiteCurve3D: weights must be finite');
    }

    const tDir0 = v3Norm(start.tangent);
    const tDir1 = v3Norm(end.tangent);

    // Scale tangents by weight * chordLength for geometry-independent behavior
    this.t0 = v3Scale(tDir0, wA * this.chordLength);
    this.t1 = v3Scale(tDir1, wB * this.chordLength);
  }

  /** Evaluate position at parameter t ∈ [0, 1] */
  pointAt(t: number): Vec3 {
    const tt = Math.max(0, Math.min(1, t));
    const [h00, h10, h01, h11] = cubicHermiteBasis(tt);
    return [
      h00 * this.p0[0] + h10 * this.t0[0] + h01 * this.p1[0] + h11 * this.t1[0],
      h00 * this.p0[1] + h10 * this.t0[1] + h01 * this.p1[1] + h11 * this.t1[1],
      h00 * this.p0[2] + h10 * this.t0[2] + h01 * this.p1[2] + h11 * this.t1[2],
    ];
  }

  /** Evaluate tangent (first derivative) at parameter t ∈ [0, 1] */
  tangentAt(t: number): Vec3 {
    const tt = Math.max(0, Math.min(1, t));
    const [h00, h10, h01, h11] = cubicHermiteBasisDeriv(tt);
    return v3Norm([
      h00 * this.p0[0] + h10 * this.t0[0] + h01 * this.p1[0] + h11 * this.t1[0],
      h00 * this.p0[1] + h10 * this.t0[1] + h01 * this.p1[1] + h11 * this.t1[1],
      h00 * this.p0[2] + h10 * this.t0[2] + h01 * this.p1[2] + h11 * this.t1[2],
    ]);
  }

  /** Evaluate curvature vector (second derivative) at parameter t ∈ [0, 1] */
  curvatureAt(t: number): Vec3 {
    const tt = Math.max(0, Math.min(1, t));
    const [h00, h10, h01, h11] = cubicHermiteBasisDeriv2(tt);
    return [
      h00 * this.p0[0] + h10 * this.t0[0] + h01 * this.p1[0] + h11 * this.t1[0],
      h00 * this.p0[1] + h10 * this.t0[1] + h01 * this.p1[1] + h11 * this.t1[1],
      h00 * this.p0[2] + h10 * this.t0[2] + h01 * this.p1[2] + h11 * this.t1[2],
    ];
  }

  /** Sample the curve as a polyline of evenly-spaced parameter values. */
  sample(count = 64): Vec3[] {
    const n = Math.max(2, Math.floor(count));
    const pts: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      pts.push(this.pointAt(i / n));
    }
    return pts;
  }

  /** Approximate arc length by sampling. */
  length(samples = 200): number {
    const pts = this.sample(samples);
    let sum = 0;
    for (let i = 1; i < pts.length; i++) {
      sum += v3Len(v3Sub(pts[i], pts[i - 1]));
    }
    return sum;
  }

  /**
   * Sample with adaptive density — more points where curvature is higher.
   * Returns at least `minCount` points, up to `maxCount`.
   */
  sampleAdaptive(minCount = 32, maxCount = 128): Vec3[] {
    // First pass: uniform sample to estimate curvature distribution
    const probeCount = Math.max(minCount, 64);
    const curvatures: number[] = [];
    for (let i = 0; i <= probeCount; i++) {
      const t = i / probeCount;
      curvatures.push(v3Len(this.curvatureAt(t)));
    }

    // Build cumulative curvature (acts as a reparameterization)
    const cumulative: number[] = [0];
    for (let i = 1; i < curvatures.length; i++) {
      // Blend between uniform and curvature-based to avoid starving straight sections
      const avgCurv = (curvatures[i - 1] + curvatures[i]) / 2;
      cumulative.push(cumulative[i - 1] + 1 + avgCurv);
    }
    const total = cumulative[cumulative.length - 1];

    // Second pass: resample at curvature-weighted intervals
    const targetCount = Math.min(maxCount, Math.max(minCount, Math.round(minCount * 1.5)));
    const pts: Vec3[] = [this.pointAt(0)];

    let probeIdx = 0;
    for (let i = 1; i < targetCount; i++) {
      const target = (i / targetCount) * total;
      while (probeIdx < cumulative.length - 1 && cumulative[probeIdx + 1] < target) {
        probeIdx++;
      }
      // Linearly interpolate parameter
      const frac = (target - cumulative[probeIdx]) /
        (cumulative[probeIdx + 1] - cumulative[probeIdx]);
      const t = (probeIdx + frac) / probeCount;
      pts.push(this.pointAt(t));
    }
    pts.push(this.pointAt(1));

    return pts;
  }

  /** Convert to a format compatible with sweep() path input. */
  toPolyline(samples = 64): Vec3[] {
    return this.sampleAdaptive(Math.max(16, samples), samples * 2);
  }
}

// ── Utility: create Hermite curve from edge-like data ───────────────

export interface EdgeEndpoint {
  /** Connection point on the edge */
  point: Vec3;
  /** Tangent direction along the edge at the connection point */
  tangent: Vec3;
  /** Surface normal at the connection point (optional, for future G2 support) */
  normal?: Vec3;
  /** Weight controlling how far the curve follows this edge's tangent. Default 1.0. */
  weight?: number;
}

/**
 * Create a Hermite transition curve between two edge endpoints.
 *
 * The curve starts at `a.point` tangent to `a.tangent` and ends at `b.point`
 * tangent to `b.tangent`, with smooth G1-continuous interpolation.
 *
 * Weight controls:
 * - weight = 1.0 (default): balanced transition
 * - weight > 1.0: curve follows this edge's direction longer before turning
 * - weight < 1.0: curve turns sooner, shorter tangent influence
 *
 * @param a - Start edge endpoint
 * @param b - End edge endpoint
 * @returns HermiteCurve3D instance
 */
export function hermiteTransition(a: EdgeEndpoint, b: EdgeEndpoint): HermiteCurve3D {
  return new HermiteCurve3D(
    { point: a.point, tangent: a.tangent, weight: a.weight },
    { point: b.point, tangent: b.tangent, weight: b.weight },
  );
}

// ── Quintic Hermite basis functions ─────────────────────────────────

/**
 * Quintic Hermite basis: H(t) = h00*P0 + h10*T0 + h20*C0 + h01*P1 + h11*T1 + h21*C1
 *
 * Interpolates position, first derivative, and second derivative at each endpoint (G2).
 */
function quinticHermiteBasis(t: number): [number, number, number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  const t5 = t4 * t;
  return [
    1 - 10 * t3 + 15 * t4 - 6 * t5,             // h00: position at P0
    t - 6 * t3 + 8 * t4 - 3 * t5,               // h10: tangent at P0
    0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5,  // h20: curvature at P0
    10 * t3 - 15 * t4 + 6 * t5,                  // h01: position at P1
    -4 * t3 + 7 * t4 - 3 * t5,                   // h11: tangent at P1
    0.5 * t3 - t4 + 0.5 * t5,                    // h21: curvature at P1
  ];
}

/** First derivative of quintic Hermite basis */
function quinticHermiteBasisDeriv(t: number): [number, number, number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  const t4 = t3 * t;
  return [
    -30 * t2 + 60 * t3 - 30 * t4,                // h00'
    1 - 18 * t2 + 32 * t3 - 15 * t4,             // h10'
    t - 4.5 * t2 + 6 * t3 - 2.5 * t4,            // h20'
    30 * t2 - 60 * t3 + 30 * t4,                  // h01'
    -12 * t2 + 28 * t3 - 15 * t4,                // h11'
    1.5 * t2 - 4 * t3 + 2.5 * t4,                // h21'
  ];
}

/** Second derivative of quintic Hermite basis */
function quinticHermiteBasisDeriv2(t: number): [number, number, number, number, number, number] {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    -60 * t + 180 * t2 - 120 * t3,               // h00''
    -36 * t + 96 * t2 - 60 * t3,                 // h10''
    1 - 9 * t + 18 * t2 - 10 * t3,               // h20''
    60 * t - 180 * t2 + 120 * t3,                 // h01''
    -24 * t + 84 * t2 - 60 * t3,                 // h11''
    3 * t - 12 * t2 + 10 * t3,                   // h21''
  ];
}

// ── QuinticHermiteCurve3D ──────────────────────────────────────────

export interface QuinticHermiteCurveEndpoint {
  /** Position */
  point: Vec3;
  /** Tangent direction (will be normalized internally) */
  tangent: Vec3;
  /** Second derivative / curvature vector. Default [0, 0, 0]. */
  curvature?: Vec3;
  /** Weight: scales tangent magnitude relative to chord length. Default 1.0. */
  weight?: number;
}

/**
 * A quintic Hermite curve in 3D space.
 *
 * Interpolates between two endpoints matching position, tangent, and second derivative
 * (G2 / curvature continuity). Uses degree-5 Hermite basis functions.
 *
 * Weight parameters scale tangent magnitudes relative to chord length.
 * Curvature vectors are scaled by weight² * chordLength² for consistent behavior.
 */
export class QuinticHermiteCurve3D {
  /** Start position */
  public readonly p0: Vec3;
  /** End position */
  public readonly p1: Vec3;
  /** Scaled tangent at start (direction * weight * chordLength) */
  public readonly t0: Vec3;
  /** Scaled tangent at end (direction * weight * chordLength) */
  public readonly t1: Vec3;
  /** Scaled second derivative at start (curvature * weight² * chordLength²) */
  public readonly c0: Vec3;
  /** Scaled second derivative at end (curvature * weight² * chordLength²) */
  public readonly c1: Vec3;
  /** Chord length (straight-line distance between endpoints) */
  public readonly chordLength: number;

  constructor(start: QuinticHermiteCurveEndpoint, end: QuinticHermiteCurveEndpoint) {
    this.p0 = [...start.point];
    this.p1 = [...end.point];

    this.chordLength = v3Len(v3Sub(this.p1, this.p0));
    if (this.chordLength < 1e-9) {
      throw new Error('QuinticHermiteCurve3D: start and end points are coincident');
    }

    const wA = start.weight ?? 1.0;
    const wB = end.weight ?? 1.0;
    if (wA <= 0 || wB <= 0) {
      throw new Error('QuinticHermiteCurve3D: weights must be positive');
    }
    if (!isFinite(wA) || !isFinite(wB)) {
      throw new Error('QuinticHermiteCurve3D: weights must be finite');
    }

    const tDir0 = v3Norm(start.tangent);
    const tDir1 = v3Norm(end.tangent);

    // Scale tangents by weight * chordLength for geometry-independent behavior
    this.t0 = v3Scale(tDir0, wA * this.chordLength);
    this.t1 = v3Scale(tDir1, wB * this.chordLength);

    // Scale curvature by weight² * chordLength² for consistent second-derivative matching
    const curv0: Vec3 = start.curvature ?? [0, 0, 0];
    const curv1: Vec3 = end.curvature ?? [0, 0, 0];
    this.c0 = v3Scale(curv0, wA * wA * this.chordLength * this.chordLength);
    this.c1 = v3Scale(curv1, wB * wB * this.chordLength * this.chordLength);
  }

  /** Evaluate position at parameter t ∈ [0, 1] */
  pointAt(t: number): Vec3 {
    const tt = Math.max(0, Math.min(1, t));
    const [h00, h10, h20, h01, h11, h21] = quinticHermiteBasis(tt);
    return [
      h00 * this.p0[0] + h10 * this.t0[0] + h20 * this.c0[0] +
        h01 * this.p1[0] + h11 * this.t1[0] + h21 * this.c1[0],
      h00 * this.p0[1] + h10 * this.t0[1] + h20 * this.c0[1] +
        h01 * this.p1[1] + h11 * this.t1[1] + h21 * this.c1[1],
      h00 * this.p0[2] + h10 * this.t0[2] + h20 * this.c0[2] +
        h01 * this.p1[2] + h11 * this.t1[2] + h21 * this.c1[2],
    ];
  }

  /** Evaluate tangent (first derivative, normalized) at parameter t ∈ [0, 1] */
  tangentAt(t: number): Vec3 {
    const tt = Math.max(0, Math.min(1, t));
    const [h00, h10, h20, h01, h11, h21] = quinticHermiteBasisDeriv(tt);
    return v3Norm([
      h00 * this.p0[0] + h10 * this.t0[0] + h20 * this.c0[0] +
        h01 * this.p1[0] + h11 * this.t1[0] + h21 * this.c1[0],
      h00 * this.p0[1] + h10 * this.t0[1] + h20 * this.c0[1] +
        h01 * this.p1[1] + h11 * this.t1[1] + h21 * this.c1[1],
      h00 * this.p0[2] + h10 * this.t0[2] + h20 * this.c0[2] +
        h01 * this.p1[2] + h11 * this.t1[2] + h21 * this.c1[2],
    ]);
  }

  /** Evaluate curvature vector (second derivative) at parameter t ∈ [0, 1] */
  curvatureAt(t: number): Vec3 {
    const tt = Math.max(0, Math.min(1, t));
    const [h00, h10, h20, h01, h11, h21] = quinticHermiteBasisDeriv2(tt);
    return [
      h00 * this.p0[0] + h10 * this.t0[0] + h20 * this.c0[0] +
        h01 * this.p1[0] + h11 * this.t1[0] + h21 * this.c1[0],
      h00 * this.p0[1] + h10 * this.t0[1] + h20 * this.c0[1] +
        h01 * this.p1[1] + h11 * this.t1[1] + h21 * this.c1[1],
      h00 * this.p0[2] + h10 * this.t0[2] + h20 * this.c0[2] +
        h01 * this.p1[2] + h11 * this.t1[2] + h21 * this.c1[2],
    ];
  }

  /** Sample the curve as a polyline of evenly-spaced parameter values. */
  sample(count = 64): Vec3[] {
    const n = Math.max(2, Math.floor(count));
    const pts: Vec3[] = [];
    for (let i = 0; i <= n; i++) {
      pts.push(this.pointAt(i / n));
    }
    return pts;
  }

  /** Approximate arc length by sampling. */
  length(samples = 200): number {
    const pts = this.sample(samples);
    let sum = 0;
    for (let i = 1; i < pts.length; i++) {
      sum += v3Len(v3Sub(pts[i], pts[i - 1]));
    }
    return sum;
  }

  /**
   * Sample with adaptive density — more points where curvature is higher.
   * Returns at least `minCount` points, up to `maxCount`.
   */
  sampleAdaptive(minCount = 32, maxCount = 128): Vec3[] {
    // First pass: uniform sample to estimate curvature distribution
    const probeCount = Math.max(minCount, 64);
    const curvatures: number[] = [];
    for (let i = 0; i <= probeCount; i++) {
      const t = i / probeCount;
      curvatures.push(v3Len(this.curvatureAt(t)));
    }

    // Build cumulative curvature (acts as a reparameterization)
    const cumulative: number[] = [0];
    for (let i = 1; i < curvatures.length; i++) {
      // Blend between uniform and curvature-based to avoid starving straight sections
      const avgCurv = (curvatures[i - 1] + curvatures[i]) / 2;
      cumulative.push(cumulative[i - 1] + 1 + avgCurv);
    }
    const total = cumulative[cumulative.length - 1];

    // Second pass: resample at curvature-weighted intervals
    const targetCount = Math.min(maxCount, Math.max(minCount, Math.round(minCount * 1.5)));
    const pts: Vec3[] = [this.pointAt(0)];

    let probeIdx = 0;
    for (let i = 1; i < targetCount; i++) {
      const target = (i / targetCount) * total;
      while (probeIdx < cumulative.length - 1 && cumulative[probeIdx + 1] < target) {
        probeIdx++;
      }
      // Linearly interpolate parameter
      const frac = (target - cumulative[probeIdx]) /
        (cumulative[probeIdx + 1] - cumulative[probeIdx]);
      const t = (probeIdx + frac) / probeCount;
      pts.push(this.pointAt(t));
    }
    pts.push(this.pointAt(1));

    return pts;
  }

  /** Convert to a format compatible with sweep() path input. */
  toPolyline(samples = 64): Vec3[] {
    return this.sampleAdaptive(Math.max(16, samples), samples * 2);
  }
}

// ── Utility: create quintic Hermite curve from edge-like data ───────

/**
 * Create a quintic Hermite transition curve between two edge endpoints (G2 continuity).
 *
 * The curve starts at `a.point` tangent to `a.tangent` with curvature `a.curvature`,
 * and ends at `b.point` tangent to `b.tangent` with curvature `b.curvature`,
 * with smooth G2-continuous interpolation matching position, tangent, and curvature.
 *
 * @param a - Start endpoint with position, tangent, optional curvature and weight
 * @param b - End endpoint with position, tangent, optional curvature and weight
 * @returns QuinticHermiteCurve3D instance
 */
export function hermiteTransitionG2(
  a: QuinticHermiteCurveEndpoint,
  b: QuinticHermiteCurveEndpoint,
): QuinticHermiteCurve3D {
  return new QuinticHermiteCurve3D(
    { point: a.point, tangent: a.tangent, curvature: a.curvature, weight: a.weight },
    { point: b.point, tangent: b.tangent, curvature: b.curvature, weight: b.weight },
  );
}

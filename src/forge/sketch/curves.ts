import {
  buildLoftShapeCompilePlan,
  buildSweepShapeCompilePlan,
  buildVariableSweepShapeCompilePlan,
  createOwnedShapeCompilePlan,
} from '../compilePlan';
import { buildShapeFromCompilePlan, getActiveBackend, type Shape } from '../kernel';
import { scaleLevelSetBoundsPadding, scaleLevelSetEdgeLength, scaleSplineSamples, scaleSweepPathSamples } from '../quality';
import { getSketchCompileProfilePlan, Sketch } from './core';
import { stroke } from './path';
import { polygon } from './primitives';

type Vec2 = [number, number];
type Vec3 = [number, number, number];

export interface Spline2DOptions {
  /** Closed loop (default true). */
  closed?: boolean;
  /** Catmull-Rom tension in [0, 1]. 0 = very round, 1 = linear-ish. Default 0.5. */
  tension?: number;
  /** Samples per segment (minimum 3). Default 16. */
  samplesPerSegment?: number;
  /**
   * For open splines, provide stroke width to return a solid Sketch.
   * If omitted for open splines, an error is thrown.
   */
  strokeWidth?: number;
  /** Stroke join for open splines. Default 'Round'. */
  join?: 'Round' | 'Square';
}

export interface Spline3DOptions {
  /** Closed loop (default false). */
  closed?: boolean;
  /** Catmull-Rom tension in [0, 1]. 0 = very round, 1 = linear-ish. Default 0.5. */
  tension?: number;
}

export interface LoftOptions {
  /** Marching-grid edge length for level-set meshing. Smaller = finer. */
  edgeLength?: number;
  /** Optional extra bounds padding. */
  boundsPadding?: number;
}

export interface SweepOptions {
  /** Number of samples when path is a Curve3D. Default 48. */
  samples?: number;
  /** Marching-grid edge length for level-set meshing. Smaller = finer. */
  edgeLength?: number;
  /** Optional extra bounds padding. */
  boundsPadding?: number;
  /**
   * Preferred "up" vector for local profile frame.
   * Auto fallback is used near parallel segments.
   */
  up?: Vec3;
}

export interface VariableSweepSection {
  /** Parameter along the spine (0 = start, 1 = end). */
  t: number;
  /** Cross-section profile at this station. */
  profile: Sketch;
}

export interface VariableSweepOptions {
  /** Number of samples when spine is a Curve3D. Default 48. */
  samples?: number;
  /** Marching-grid edge length for level-set meshing. Smaller = finer. */
  edgeLength?: number;
  /** Optional extra bounds padding. */
  boundsPadding?: number;
  /**
   * Preferred "up" vector for local profile frame.
   * Auto fallback is used near parallel segments.
   */
  up?: Vec3;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function _vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function vec3Len(v: Vec3): number {
  return Math.sqrt(vec3Dot(v, v));
}

function vec3Norm(v: Vec3): Vec3 {
  const len = vec3Len(v);
  if (len < 1e-9) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function catmullRom2D(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number, tension: number): Vec2 {
  const tt = t * t;
  const ttt = tt * t;
  const s = (1 - tension) * 0.5;

  const m1x = (p2[0] - p0[0]) * s;
  const m1y = (p2[1] - p0[1]) * s;
  const m2x = (p3[0] - p1[0]) * s;
  const m2y = (p3[1] - p1[1]) * s;

  const h00 = 2 * ttt - 3 * tt + 1;
  const h10 = ttt - 2 * tt + t;
  const h01 = -2 * ttt + 3 * tt;
  const h11 = ttt - tt;

  return [h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x, h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y];
}

function catmullRom3D(p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, t: number, tension: number): Vec3 {
  const tt = t * t;
  const ttt = tt * t;
  const s = (1 - tension) * 0.5;

  const m1: Vec3 = [(p2[0] - p0[0]) * s, (p2[1] - p0[1]) * s, (p2[2] - p0[2]) * s];
  const m2: Vec3 = [(p3[0] - p1[0]) * s, (p3[1] - p1[1]) * s, (p3[2] - p1[2]) * s];

  const h00 = 2 * ttt - 3 * tt + 1;
  const h10 = ttt - 2 * tt + t;
  const h01 = -2 * ttt + 3 * tt;
  const h11 = ttt - tt;

  return [
    h00 * p1[0] + h10 * m1[0] + h01 * p2[0] + h11 * m2[0],
    h00 * p1[1] + h10 * m1[1] + h01 * p2[1] + h11 * m2[1],
    h00 * p1[2] + h10 * m1[2] + h01 * p2[2] + h11 * m2[2],
  ];
}

function sampleCatmullRom2D(points: Vec2[], closed: boolean, samplesPerSegment: number, tension: number): Vec2[] {
  if (points.length < 2) throw new Error('spline2d requires at least 2 points');
  const n = points.length;
  const sampled: Vec2[] = [];

  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i % n];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    if (!closed) {
      const p0Open = i === 0 ? p1 : p0;
      const p3Open = i === n - 2 ? p2 : p3;
      for (let s = 0; s < samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        sampled.push(catmullRom2D(p0Open, p1, p2, p3Open, t, tension));
      }
      continue;
    }

    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      sampled.push(catmullRom2D(p0, p1, p2, p3, t, tension));
    }
  }

  if (!closed) sampled.push(points[n - 1]);
  return sampled;
}

function sampleCatmullRom3D(points: Vec3[], closed: boolean, samplesPerSegment: number, tension: number): Vec3[] {
  if (points.length < 2) throw new Error('spline3d requires at least 2 points');
  const n = points.length;
  const sampled: Vec3[] = [];

  const segCount = closed ? n : n - 1;
  for (let i = 0; i < segCount; i++) {
    const p0 = points[(i - 1 + n) % n];
    const p1 = points[i % n];
    const p2 = points[(i + 1) % n];
    const p3 = points[(i + 2) % n];

    if (!closed) {
      const p0Open = i === 0 ? p1 : p0;
      const p3Open = i === n - 2 ? p2 : p3;
      for (let s = 0; s < samplesPerSegment; s++) {
        const t = s / samplesPerSegment;
        sampled.push(catmullRom3D(p0Open, p1, p2, p3Open, t, tension));
      }
      continue;
    }

    for (let s = 0; s < samplesPerSegment; s++) {
      const t = s / samplesPerSegment;
      sampled.push(catmullRom3D(p0, p1, p2, p3, t, tension));
    }
  }

  if (!closed) sampled.push(points[n - 1]);
  return sampled;
}

export class Curve3D {
  public readonly points: Vec3[];
  public readonly closed: boolean;
  public readonly tension: number;

  constructor(points: Vec3[], options: Spline3DOptions = {}) {
    if (points.length < 2) throw new Error('Curve3D needs at least 2 points');
    this.points = points.map((p) => [p[0], p[1], p[2]]);
    this.closed = options.closed ?? false;
    this.tension = clamp(options.tension ?? 0.5, 0, 1);
  }

  sampleBySegment(samplesPerSegment = 16): Vec3[] {
    const spp = Math.max(3, Math.floor(samplesPerSegment));
    return sampleCatmullRom3D(this.points, this.closed, spp, this.tension);
  }

  sample(count = 64): Vec3[] {
    const n = Math.max(2, Math.floor(count));
    const spp = Math.max(3, Math.ceil(n / Math.max(1, this.points.length - (this.closed ? 0 : 1))));
    const sampled = this.sampleBySegment(spp);
    if (sampled.length <= n) return sampled;

    const out: Vec3[] = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.round((i / (n - 1)) * (sampled.length - 1));
      out.push(sampled[idx]);
    }
    return out;
  }

  pointAt(t: number): Vec3 {
    const sampled = this.sample(200);
    const tt = clamp(t, 0, 1);
    const idx = tt * (sampled.length - 1);
    const i0 = Math.floor(idx);
    const i1 = Math.min(sampled.length - 1, i0 + 1);
    const f = idx - i0;
    return vec3Add(vec3Scale(sampled[i0], 1 - f), vec3Scale(sampled[i1], f));
  }

  tangentAt(t: number): Vec3 {
    const eps = 1 / 1000;
    const p0 = this.pointAt(clamp(t - eps, 0, 1));
    const p1 = this.pointAt(clamp(t + eps, 0, 1));
    return vec3Norm(vec3Sub(p1, p0));
  }

  length(samples = 200): number {
    const pts = this.sample(samples);
    let sum = 0;
    for (let i = 1; i < pts.length; i++) {
      sum += vec3Len(vec3Sub(pts[i], pts[i - 1]));
    }
    return sum;
  }
}

/**
 * Build a smooth Catmull-Rom spline sketch from 2D control points.
 *
 * A closed spline (default) returns a filled profile. An open spline requires
 * a strokeWidth option to produce a solid sketch. Use tension (0..1, default 0.5)
 * to control curve tightness.
 */
export function spline2d(points: Vec2[], options: Spline2DOptions = {}): Sketch {
  const closed = options.closed ?? true;
  const tension = clamp(options.tension ?? 0.5, 0, 1);
  const spp = scaleSplineSamples(options.samplesPerSegment ?? 16);
  const sampled = sampleCatmullRom2D(points, closed, spp, tension);

  if (closed) return polygon(sampled);
  if (options.strokeWidth == null || options.strokeWidth <= 0) {
    throw new Error('spline2d: open spline requires options.strokeWidth > 0 to create a solid Sketch');
  }
  return stroke(sampled, options.strokeWidth, options.join ?? 'Round');
}

/**
 * Create a reusable 3D spline curve object (Catmull-Rom).
 *
 * The returned Curve3D provides sample(), pointAt(t), tangentAt(t), and length() for
 * downstream use in sweep() or manual path operations.
 */
export function spline3d(points: Vec3[], options: Spline3DOptions = {}): Curve3D {
  return new Curve3D(points, options);
}

/**
 * Loft between multiple sketches along Z stations.
 *
 * Profiles can differ in topology and vertex count: interpolation is done on
 * signed-distance fields and meshed with level-set extraction. Heights must be
 * strictly increasing. Compatible loft stacks can export through the OCCT exact route.
 *
 * Performance note: loft is significantly heavier than primitive/extrude/revolve.
 * If the part is axis-symmetric (bottles, vases, knobs), prefer revolve().
 */
export function loft(profiles: Sketch[], heights: number[], options: LoftOptions = {}): Shape {
  if (profiles.length < 2) throw new Error('loft requires at least two profiles');
  if (profiles.length !== heights.length) {
    throw new Error('loft requires heights.length === profiles.length');
  }

  const pairs = profiles.map((profile, i) => ({ profile, z: heights[i] })).sort((a, b) => a.z - b.z);

  for (let i = 1; i < pairs.length; i++) {
    if (Math.abs(pairs[i].z - pairs[i - 1].z) < 1e-8) {
      throw new Error('loft requires strictly increasing, unique heights');
    }
  }

  const zs = pairs.map((entry) => entry.z);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const entry of pairs) {
    const b = entry.profile.bounds();
    minX = Math.min(minX, b.min[0]);
    minY = Math.min(minY, b.min[1]);
    maxX = Math.max(maxX, b.max[0]);
    maxY = Math.max(maxY, b.max[1]);
  }

  const zMin = zs[0];
  const zMax = zs[zs.length - 1];
  const span = Math.max(maxX - minX, maxY - minY, zMax - zMin, 1);
  const requestedEdgeLength = options.edgeLength ?? Math.max(0.35, span / 90);
  const edgeLength = scaleLevelSetEdgeLength(requestedEdgeLength);
  const requestedPad = options.boundsPadding ?? Math.max(edgeLength * 3, span * 0.06, 1.5);
  const pad = scaleLevelSetBoundsPadding(requestedPad);
  const plan = buildLoftShapeCompilePlan(
    pairs.map((entry) => getSketchCompileProfilePlan(entry.profile)),
    zs,
    { edgeLength, boundsPadding: pad },
  );
  if (!plan) {
    throw new Error('loft: one or more profiles is missing a compile plan. All sketches must have compile profile plans.');
  }
  const ownedPlan = createOwnedShapeCompilePlan(plan, 'loft')!;
  const isOCCT = getActiveBackend() === 'occt';
  return buildShapeFromCompilePlan(ownedPlan, pairs[0]?.profile.colorHex, {
    fidelity: isOCCT ? 'kernel-native' : 'sampled',
    sources: isOCCT ? ['loft'] : ['loft', 'level-set'],
  });
}

export interface LoftAlongSpineOptions {
  /** Number of samples when spine is a Curve3D. Default 48. */
  samples?: number;
  /** Marching-grid edge length for level-set meshing. Smaller = finer. */
  edgeLength?: number;
  /** Optional extra bounds padding. */
  boundsPadding?: number;
  /**
   * Preferred "up" vector for local profile frame.
   * Auto fallback is used near parallel segments.
   */
  up?: Vec3;
}

/**
 * Loft between multiple profiles positioned along an arbitrary 3D spine curve.
 *
 * Unlike loft() which only supports Z heights, loftAlongSpine() places each
 * profile at a position along a 3D spine, oriented perpendicular to the spine
 * tangent. This enables lofting along curved paths — e.g., a wing root-to-tip
 * transition that follows a swept-back leading edge.
 *
 * The tValues array specifies where each profile sits along the spine (0 = start,
 * 1 = end). Must have the same length as profiles and be in [0, 1].
 *
 * Internally uses variableSweep infrastructure with SDF interpolation.
 *
 * Performance note: uses level-set meshing, heavier than simple loft().
 */
export function loftAlongSpine(profiles: Sketch[], spine: Curve3D | Vec3[], tValues: number[], options: LoftAlongSpineOptions = {}): Shape {
  if (profiles.length < 2) throw new Error('loftAlongSpine requires at least two profiles');
  if (profiles.length !== tValues.length) {
    throw new Error('loftAlongSpine requires tValues.length === profiles.length');
  }
  for (const t of tValues) {
    if (t < 0 || t > 1) throw new Error(`loftAlongSpine: t=${t} is out of range [0, 1]`);
  }

  const sections: VariableSweepSection[] = profiles.map((profile, i) => ({
    t: tValues[i],
    profile,
  }));

  return variableSweep(spine, sections, {
    samples: options.samples,
    edgeLength: options.edgeLength,
    boundsPadding: options.boundsPadding,
    up: options.up,
  });
}

/**
 * Sweep a 2D profile along a 3D path to create a solid.
 *
 * Path can be a Curve3D from spline3d() or an array of [x,y,z] points (polyline).
 * The profile is interpreted in the local frame normal plane. Compatible sweeps can
 * export through the OCCT exact route using the canonical path representation.
 *
 * Performance note: sweep uses level-set meshing internally. Prefer direct
 * primitives/extrude/revolve when they can express the same shape.
 */
export function sweep(profile: Sketch, path: Curve3D | Vec3[], options: SweepOptions = {}): Shape {
  const requestedPathSamples = Math.max(4, options.samples ?? 48);
  const effectivePathSamples = scaleSweepPathSamples(requestedPathSamples);
  const pathPts = Array.isArray(path) ? path : path.sample(effectivePathSamples);

  if (pathPts.length < 2) throw new Error('sweep requires a path with at least two points');

  const up = options.up ?? [0, 0, 1];

  const pb = profile.bounds();
  const pr = Math.max(Math.abs(pb.min[0]), Math.abs(pb.max[0]), Math.abs(pb.min[1]), Math.abs(pb.max[1]));

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of pathPts) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
    maxZ = Math.max(maxZ, p[2]);
  }

  let pathLen = 0;
  for (let i = 1; i < pathPts.length; i++) {
    pathLen += vec3Len(vec3Sub(pathPts[i], pathPts[i - 1]));
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, pathLen, 1);
  const requestedEdgeLength = options.edgeLength ?? Math.max(0.3, span / 110);
  const edgeLength = scaleLevelSetEdgeLength(requestedEdgeLength);
  const requestedPad = options.boundsPadding ?? Math.max(pr + edgeLength * 2, span * 0.04, 2);
  const pad = scaleLevelSetBoundsPadding(requestedPad);

  const plan = buildSweepShapeCompilePlan(
    getSketchCompileProfilePlan(profile),
    {
      kind: 'polyline',
      points: pathPts.map(([x, y, z]) => [x, y, z]),
    },
    { edgeLength, boundsPadding: pad, up },
  );
  if (!plan) {
    throw new Error('sweep: profile is missing a compile plan. The sketch must have a compile profile plan.');
  }
  const ownedPlan = createOwnedShapeCompilePlan(plan, 'sweep')!;
  const isOCCTSweep = getActiveBackend() === 'occt';
  return buildShapeFromCompilePlan(ownedPlan, profile.colorHex, {
    fidelity: isOCCTSweep ? 'kernel-native' : 'sampled',
    sources: isOCCTSweep ? ['sweep'] : ['sweep', 'level-set'],
  });
}

/**
 * Sweep a variable cross-section along a 3D spine curve.
 *
 * Unlike sweep(), which uses a single constant profile, variableSweep()
 * interpolates between multiple profiles at different stations along the spine.
 * This enables organic shapes like tapering tubes, bone-like structures, and
 * sculptural forms.
 *
 * Each section specifies a t parameter (0 = start, 1 = end of spine) and a
 * 2D profile sketch. The SDF-based level-set mesher smoothly blends between
 * profiles at intermediate positions.
 *
 * Performance note: like sweep(), this uses level-set meshing internally.
 */
export function variableSweep(spine: Curve3D | Vec3[], sections: VariableSweepSection[], options: VariableSweepOptions = {}): Shape {
  if (sections.length < 2) throw new Error('variableSweep requires at least two sections');

  const sortedSections = [...sections].sort((a, b) => a.t - b.t);
  for (const s of sortedSections) {
    if (s.t < 0 || s.t > 1) throw new Error(`variableSweep: section t=${s.t} is out of range [0, 1]`);
  }

  const requestedPathSamples = Math.max(4, options.samples ?? 48);
  const effectivePathSamples = scaleSweepPathSamples(requestedPathSamples);
  const pathPts = Array.isArray(spine) ? spine : spine.sample(effectivePathSamples);

  if (pathPts.length < 2) throw new Error('variableSweep requires a spine with at least two points');

  const up: Vec3 = options.up ?? [0, 0, 1];

  // Compute max profile radius across all sections
  let maxPr = 0;
  for (const s of sortedSections) {
    const b = s.profile.bounds();
    maxPr = Math.max(maxPr, Math.abs(b.min[0]), Math.abs(b.max[0]), Math.abs(b.min[1]), Math.abs(b.max[1]));
  }

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const p of pathPts) {
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
    maxZ = Math.max(maxZ, p[2]);
  }

  let pathLen = 0;
  for (let i = 1; i < pathPts.length; i++) {
    pathLen += vec3Len(vec3Sub(pathPts[i], pathPts[i - 1]));
  }
  const span = Math.max(maxX - minX, maxY - minY, maxZ - minZ, pathLen, 1);
  const requestedEdgeLength = options.edgeLength ?? Math.max(0.3, span / 110);
  const edgeLength = scaleLevelSetEdgeLength(requestedEdgeLength);
  const requestedPad = options.boundsPadding ?? Math.max(maxPr + edgeLength * 2, span * 0.04, 2);
  const pad = scaleLevelSetBoundsPadding(requestedPad);

  const sectionPlans = sortedSections.map((s) => ({
    t: s.t,
    profile: getSketchCompileProfilePlan(s.profile),
  }));

  const plan = buildVariableSweepShapeCompilePlan(
    sectionPlans,
    {
      kind: 'polyline',
      points: pathPts.map(([x, y, z]) => [x, y, z]),
    },
    { edgeLength, boundsPadding: pad, up },
  );
  if (!plan) {
    throw new Error('variableSweep: one or more profiles is missing a compile plan.');
  }
  const ownedPlan = createOwnedShapeCompilePlan(plan, 'variableSweep')!;
  return buildShapeFromCompilePlan(ownedPlan, sortedSections[0].profile.colorHex, {
    fidelity: 'sampled',
    sources: ['sweep', 'level-set'],
  });
}

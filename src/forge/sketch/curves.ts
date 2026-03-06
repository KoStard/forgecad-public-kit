import { Sketch } from './core';
import { polygon } from './primitives';
import { stroke } from './path';
import { levelSet, setShapeGeometryInfo, type Shape } from '../kernel';
import {
  scaleLevelSetBoundsPadding,
  scaleLevelSetEdgeLength,
  scaleSplineSamples,
  scaleSweepPathSamples,
} from '../quality';

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Loop2D = Vec2[];

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

type SignedLoop = { pts: Loop2D; area: number };

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

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function vec3Len(v: Vec3): number {
  return Math.sqrt(vec3Dot(v, v));
}

function vec3Norm(v: Vec3): Vec3 {
  const len = vec3Len(v);
  if (len < 1e-9) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function signedArea2D(loop: Loop2D): number {
  let a = 0;
  for (let i = 0; i < loop.length; i++) {
    const [x1, y1] = loop[i];
    const [x2, y2] = loop[(i + 1) % loop.length];
    a += x1 * y2 - x2 * y1;
  }
  return a * 0.5;
}

function pointInLoop(p: Vec2, loop: Loop2D): boolean {
  let inside = false;
  const [px, py] = p;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    const intersect =
      ((yi > py) !== (yj > py))
      && (px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-20) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function pointSegDist2D(p: Vec2, a: Vec2, b: Vec2): number {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const apx = p[0] - a[0];
  const apy = p[1] - a[1];
  const den = abx * abx + aby * aby;
  const t = den < 1e-12 ? 0 : clamp((apx * abx + apy * aby) / den, 0, 1);
  const qx = a[0] + abx * t;
  const qy = a[1] + aby * t;
  const dx = p[0] - qx;
  const dy = p[1] - qy;
  return Math.sqrt(dx * dx + dy * dy);
}

function loopSignedDistance(p: Vec2, loop: Loop2D): number {
  let minDist = Infinity;
  for (let i = 0; i < loop.length; i++) {
    const a = loop[i];
    const b = loop[(i + 1) % loop.length];
    minDist = Math.min(minDist, pointSegDist2D(p, a, b));
  }
  const inside = pointInLoop(p, loop);
  return inside ? minDist : -minDist;
}

function compileSketchSdf(sketch: Sketch): (x: number, y: number) => number {
  const loopsRaw = sketch.toPolygons() as number[][][];
  const loops: SignedLoop[] = loopsRaw
    .filter((loop) => Array.isArray(loop) && loop.length >= 3)
    .map((loop) => {
      const pts = loop.map(([x, y]) => [x, y] as Vec2);
      return { pts, area: signedArea2D(pts) };
    });

  if (loops.length === 0) {
    return () => -1;
  }

  return (x: number, y: number): number => {
    const p: Vec2 = [x, y];
    let field = -Infinity;
    for (const loop of loops) {
      const f = loopSignedDistance(p, loop.pts);
      // Positive-area loops are additive regions; negative-area loops are holes.
      if (loop.area >= 0) field = Math.max(field, f);
      else field = Math.min(field, -f);
    }
    return field;
  };
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

  return [
    h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x,
    h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y,
  ];
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
 * Create a smooth 2D spline sketch from control points.
 *
 * - Closed spline returns a filled profile.
 * - Open spline requires strokeWidth to return a solid sketch.
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

/** Create a reusable 3D spline curve object. */
export function spline3d(points: Vec3[], options: Spline3DOptions = {}): Curve3D {
  return new Curve3D(points, options);
}

/**
 * Loft between sketches along Z stations.
 *
 * Profiles can differ in topology/vertex count: interpolation is done on
 * signed-distance fields and meshed with level-set extraction.
 */
export function loft(
  profiles: Sketch[],
  heights: number[],
  options: LoftOptions = {},
): Shape {
  if (profiles.length < 2) throw new Error('loft requires at least two profiles');
  if (profiles.length !== heights.length) {
    throw new Error('loft requires heights.length === profiles.length');
  }

  const pairs = profiles.map((profile, i) => ({ profile, z: heights[i] }))
    .sort((a, b) => a.z - b.z);

  for (let i = 1; i < pairs.length; i++) {
    if (Math.abs(pairs[i].z - pairs[i - 1].z) < 1e-8) {
      throw new Error('loft requires strictly increasing, unique heights');
    }
  }

  const sdfs = pairs.map((entry) => compileSketchSdf(entry.profile));
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

  const sdfAt = (x: number, y: number, z: number): number => {
    let crossField: number;
    if (z <= zMin) {
      crossField = sdfs[0](x, y);
    } else if (z >= zMax) {
      crossField = sdfs[sdfs.length - 1](x, y);
    } else {
      let seg = 0;
      while (seg + 1 < zs.length && z > zs[seg + 1]) seg++;
      const z0 = zs[seg];
      const z1 = zs[seg + 1];
      const t = (z - z0) / (z1 - z0);
      const f0 = sdfs[seg](x, y);
      const f1 = sdfs[seg + 1](x, y);
      crossField = f0 * (1 - t) + f1 * t;
    }

    // Cap at start/end planes.
    const zCap = Math.min(z - zMin, zMax - z);
    return Math.min(crossField, zCap);
  };

  const shape = levelSet(
    ([x, y, z]) => sdfAt(x, y, z),
    {
      min: [minX - pad, minY - pad, zMin - pad],
      max: [maxX + pad, maxY + pad, zMax + pad],
    },
    edgeLength,
  );
  return setShapeGeometryInfo(shape, {
    fidelity: 'sampled',
    sources: ['loft', ...shape.geometryInfo().sources],
  });
}

interface SweepSegment {
  a: Vec3;
  t: Vec3;
  x: Vec3;
  y: Vec3;
  len: number;
}

function makeSweepFrame(tangent: Vec3, preferredUp: Vec3): { x: Vec3; y: Vec3 } {
  let up = vec3Norm(preferredUp);
  if (Math.abs(vec3Dot(up, tangent)) > 0.95) {
    up = Math.abs(tangent[2]) < 0.95 ? [0, 0, 1] : [0, 1, 0];
  }
  let x = vec3Norm(vec3Cross(up, tangent));
  if (vec3Len(x) < 1e-8) {
    const fallback: Vec3 = Math.abs(tangent[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    x = vec3Norm(vec3Cross(fallback, tangent));
  }
  const y = vec3Norm(vec3Cross(tangent, x));
  return { x, y };
}

/**
 * Sweep a 2D profile along a 3D path.
 *
 * Path can be:
 * - `Curve3D` from spline3d(...)
 * - array of [x,y,z] points (polyline)
 *
 * The profile is interpreted in the local frame normal plane (x,y axes).
 */
export function sweep(
  profile: Sketch,
  path: Curve3D | Vec3[],
  options: SweepOptions = {},
): Shape {
  const requestedPathSamples = Math.max(4, options.samples ?? 48);
  const effectivePathSamples = scaleSweepPathSamples(requestedPathSamples);
  const pathPts = Array.isArray(path)
    ? path
    : path.sample(effectivePathSamples);

  if (pathPts.length < 2) throw new Error('sweep requires a path with at least two points');

  const profileSdf = compileSketchSdf(profile);
  const up = options.up ?? [0, 0, 1];

  const segments: SweepSegment[] = [];
  for (let i = 0; i < pathPts.length - 1; i++) {
    const a = pathPts[i];
    const b = pathPts[i + 1];
    const d = vec3Sub(b, a);
    const len = vec3Len(d);
    if (len < 1e-6) continue;
    const t = vec3Scale(d, 1 / len);
    const frame = makeSweepFrame(t, up);
    segments.push({ a, t, x: frame.x, y: frame.y, len });
  }
  if (segments.length === 0) throw new Error('sweep path has no non-zero segments');

  const pb = profile.bounds();
  const pr = Math.max(
    Math.abs(pb.min[0]), Math.abs(pb.max[0]),
    Math.abs(pb.min[1]), Math.abs(pb.max[1]),
  );

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

  const sweepSdf = (p: Vec3): number => {
    let field = -Infinity;
    for (const seg of segments) {
      const v = vec3Sub(p, seg.a);
      const w = vec3Dot(v, seg.t);
      const u = vec3Dot(v, seg.x);
      const q = vec3Dot(v, seg.y);
      const profileField = profileSdf(u, q);
      const capField = Math.min(w, seg.len - w);
      const segField = Math.min(profileField, capField);
      field = Math.max(field, segField);
    }
    return field;
  };

  const shape = levelSet(
    (p) => sweepSdf(p as Vec3),
    {
      min: [minX - pad, minY - pad, minZ - pad],
      max: [maxX + pad, maxY + pad, maxZ + pad],
    },
    edgeLength,
  );
  return setShapeGeometryInfo(shape, {
    fidelity: 'sampled',
    sources: ['sweep', ...shape.geometryInfo().sources],
  });
}

/**
 * Pipe routing: pipeRoute, elbow, and vector math helpers.
 */

import { buildShapeFromCompilePlan, cylinder, Shape, union } from '../kernel';

// --- Vector math helpers ---
export function sub(a: number[], b: number[]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
export function addVec(a: number[], b: number[]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
export function scale(v: number[], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}
export function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
export function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
export function vecLen(v: number[]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
export function normalize(v: number[]): [number, number, number] {
  const l = vecLen(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
export function clampDot(d: number): number {
  return Math.max(-1, Math.min(1, d));
}

/**
 * Route a pipe (solid or hollow) through 3D waypoints with smooth bends.
 *
 * Each interior waypoint gets a torus-section bend. Straight segments connect them.
 * Returns a single unioned Shape.
 */
export function pipeRoute(
  points: [number, number, number][],
  radius: number,
  options?: { bendRadius?: number; wall?: number; segments?: number },
): Shape {
  if (points.length < 2) throw new Error('pipeRoute needs at least 2 points');

  const bendR = options?.bendRadius ?? radius * 4;
  const wall = options?.wall;
  const segs = options?.segments ?? 32;

  // Precompute directions and bend info for each interior point
  type BendInfo = {
    axis: [number, number, number]; // rotation axis (cross of incoming/outgoing)
    center: [number, number, number]; // bend arc center
    angle: number; // bend angle in radians
    trimLen: number; // how much to shorten adjacent straights
    startPt: [number, number, number]; // where straight ends / bend starts
    endPt: [number, number, number]; // where bend ends / next straight starts
  };

  const bends: (BendInfo | null)[] = new Array(points.length).fill(null);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1],
      cur = points[i],
      next = points[i + 1];
    // Incoming direction (toward cur)
    const dIn = normalize(sub(cur, prev));
    // Outgoing direction (away from cur)
    const dOut = normalize(sub(next, cur));

    const dotVal = clampDot(dot(dIn, dOut));
    // Angle between the two directions
    const bendAngle = Math.acos(dotVal); // 0 = straight, PI = U-turn

    if (bendAngle < 1e-6) {
      // Nearly straight — no bend needed
      continue;
    }

    const crossVec = cross(dIn, dOut);
    const crossLen = vecLen(crossVec);
    if (crossLen < 1e-10) continue; // collinear (U-turn) — skip

    const axis = normalize(crossVec) as [number, number, number];

    // The bend center is offset from the waypoint perpendicular to the bisector
    // trimLen = bendR * tan(bendAngle/2)
    const halfAngle = bendAngle / 2;
    const trimLen = bendR * Math.tan(halfAngle);

    // Start of bend: back along incoming direction by trimLen from cur
    const startPt = addVec(cur, scale(dIn, -trimLen));
    // End of bend: along outgoing direction by trimLen from cur
    const endPt = addVec(cur, scale(dOut, trimLen));

    // Bend center: from startPt, perpendicular to dIn toward the inside of the bend
    const perpDir = normalize(cross(axis, dIn)) as [number, number, number];
    const center = addVec(startPt, scale(perpDir, bendR));

    bends[i] = { axis, center, angle: bendAngle, trimLen, startPt, endPt };
  }

  const parts: Shape[] = [];

  // Helper: create a cylinder from point A to point B
  const makeSeg = (a: [number, number, number], b: [number, number, number]) => {
    const d = sub(b, a);
    const len = vecLen(d);
    if (len < 0.01) return null;
    const dir = normalize(d) as [number, number, number];
    // Build cylinder along Z, then orient and translate
    let seg = cylinder(len, radius, undefined, segs);
    if (wall != null && wall > 0) {
      const inner = cylinder(len + 0.1, radius - wall, undefined, segs).translate(0, 0, -0.05);
      seg = seg.subtract(inner);
    }
    // pointAlong + translate to midpoint
    seg = seg.pointAlong(dir);
    // After pointAlong, cylinder base is at origin. We need base at point a.
    seg = seg.translate(a[0], a[1], a[2]);
    return seg;
  };

  // Helper: create a torus bend section
  const makeBend = (info: BendInfo) => {
    const circlePts: [number, number][] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cx = bendR + radius * Math.cos(a);
      const cy = radius * Math.sin(a);
      circlePts.push([cx, cy]);
    }

    const angleDeg = (info.angle * 180) / Math.PI;
    const bendSegs = Math.max(4, Math.ceil((segs * angleDeg) / 360));

    const outerPlan: import('../compilePlan').ShapeCompilePlan = {
      kind: 'revolve',
      profile: { kind: 'polygon', points: circlePts, transforms: [] },
      degrees: angleDeg,
      segments: bendSegs,
    };
    let bendShape = buildShapeFromCompilePlan(outerPlan);

    if (wall != null && wall > 0) {
      const innerPts: [number, number][] = [];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        innerPts.push([bendR + (radius - wall) * Math.cos(a), (radius - wall) * Math.sin(a)]);
      }
      const innerPlan: import('../compilePlan').ShapeCompilePlan = {
        kind: 'revolve',
        profile: { kind: 'polygon', points: innerPts, transforms: [] },
        degrees: angleDeg,
        segments: bendSegs,
      };
      const innerBend = buildShapeFromCompilePlan(innerPlan);
      bendShape = bendShape.subtract(innerBend);
    }

    // Now orient the bend into world space.
    const radialDir = normalize(sub(info.startPt, info.center)) as [number, number, number];
    const tangentDir = cross(info.axis, radialDir) as [number, number, number];

    // Build 4x4 column-major transform
    const c = info.center;
    bendShape = bendShape.transform([
      radialDir[0],
      radialDir[1],
      radialDir[2],
      0,
      tangentDir[0],
      tangentDir[1],
      tangentDir[2],
      0,
      info.axis[0],
      info.axis[1],
      info.axis[2],
      0,
      c[0],
      c[1],
      c[2],
      1,
    ] as any);

    return bendShape;
  };

  // Build segments
  for (let i = 0; i < points.length - 1; i++) {
    let segStart = points[i] as [number, number, number];
    let segEnd = points[i + 1] as [number, number, number];

    if (bends[i]) segStart = bends[i]!.endPt;
    if (bends[i + 1]) segEnd = bends[i + 1]!.startPt;

    const seg = makeSeg(segStart, segEnd);
    if (seg) parts.push(seg);
  }

  // Build bends
  for (let i = 1; i < points.length - 1; i++) {
    if (bends[i]) {
      parts.push(makeBend(bends[i]!));
    }
  }

  if (parts.length === 0) throw new Error('pipeRoute produced no geometry');
  return parts.length === 1 ? parts[0] : union(...parts);
}

/**
 * Pipe elbow — a curved pipe section (torus arc) for connecting two pipe directions.
 *
 * By default creates a bend in the XZ plane: incoming along +Z, outgoing rotated by `angle`.
 * The bend starts at the origin, curving away from it.
 *
 * @param pipeRadius  - Pipe outer radius
 * @param bendRadius  - Centerline bend radius (distance from arc center to pipe center)
 * @param angle       - Bend angle in degrees (e.g. 90 for a right-angle bend)
 * @param options.wall     - Wall thickness for hollow pipe
 * @param options.segments - Circumferential segments (default 32)
 * @param options.from     - Incoming direction vector (default [0,0,1])
 * @param options.to       - Outgoing direction vector (overrides angle if both from/to given)
 */
export function elbow(
  pipeRadius: number,
  bendRadius: number,
  angle?: number | { from?: [number, number, number]; to?: [number, number, number]; wall?: number; segments?: number },
  options?: { wall?: number; segments?: number; from?: [number, number, number]; to?: [number, number, number] },
): Shape {
  // Normalize overloaded args
  let angleDeg: number;
  let wall: number | undefined;
  let segs: number;
  let fromDir: [number, number, number] | undefined;
  let toDir: [number, number, number] | undefined;

  if (typeof angle === 'object' && angle !== null) {
    angleDeg = 90; // default, may be overridden by from/to
    wall = angle.wall;
    segs = angle.segments ?? 32;
    fromDir = angle.from;
    toDir = angle.to;
  } else {
    angleDeg = angle ?? 90;
    wall = options?.wall;
    segs = options?.segments ?? 32;
    fromDir = options?.from;
    toDir = options?.to;
  }

  // If from/to are given, compute angle from them
  if (fromDir && toDir) {
    const nFrom = normalize(fromDir);
    const nTo = normalize(toDir);
    const d = clampDot(dot(nFrom, nTo));
    angleDeg = (Math.acos(d) * 180) / Math.PI;
  }

  if (angleDeg < 0.01) throw new Error('elbow: angle too small');

  const _angleRad = (angleDeg * Math.PI) / 180;

  // Build torus cross-section: circle at distance bendRadius from Z axis
  const circlePts: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    circlePts.push([bendRadius + pipeRadius * Math.cos(a), pipeRadius * Math.sin(a)]);
  }

  const bendSegs = Math.max(4, Math.ceil((segs * angleDeg) / 360));

  const outerPlan: import('../compilePlan').ShapeCompilePlan = {
    kind: 'revolve',
    profile: { kind: 'polygon', points: circlePts, transforms: [] },
    degrees: angleDeg,
    segments: bendSegs,
  };
  let bendShape = buildShapeFromCompilePlan(outerPlan);

  if (wall != null && wall > 0) {
    const innerPts: [number, number][] = [];
    const innerR = pipeRadius - wall;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      innerPts.push([bendRadius + innerR * Math.cos(a), innerR * Math.sin(a)]);
    }
    const innerPlan: import('../compilePlan').ShapeCompilePlan = {
      kind: 'revolve',
      profile: { kind: 'polygon', points: innerPts, transforms: [] },
      degrees: angleDeg,
      segments: bendSegs,
    };
    const innerBend = buildShapeFromCompilePlan(innerPlan);
    bendShape = bendShape.subtract(innerBend);
  }

  // Orient if from/to directions are given
  if (fromDir && toDir) {
    const nFrom = normalize(fromDir) as [number, number, number];
    const nTo = normalize(toDir) as [number, number, number];
    const crossVec = cross(nFrom, nTo);
    const crossLen = vecLen(crossVec);
    if (crossLen < 1e-10) return bendShape; // collinear, no rotation needed

    const axis = normalize(crossVec) as [number, number, number];

    const perpDir = cross(axis, nFrom) as [number, number, number];

    bendShape = bendShape.transform([
      perpDir[0],
      perpDir[1],
      perpDir[2],
      0,
      nFrom[0],
      nFrom[1],
      nFrom[2],
      0,
      axis[0],
      axis[1],
      axis[2],
      0,
      0,
      0,
      0,
      1,
    ] as any);
  }

  return bendShape;
}

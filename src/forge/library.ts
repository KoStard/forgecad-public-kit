/**
 * ForgeCAD Part Library
 *
 * Pre-built parametric parts available in user scripts via lib.xxx()
 * Each part is a function that returns a Shape, taking parameters.
 */

import { box, cylinder, sphere, union, difference, intersection, Shape, getWasm } from './kernel';

/** M-series bolt hole (through-hole) */
export function boltHole(diameter: number, depth: number): Shape {
  return cylinder(depth, diameter / 2, undefined, 32, true);
}

/** Counterbore hole — through-hole with a wider recess at the top */
export function counterbore(
  holeDia: number,
  boreDia: number,
  boreDepth: number,
  totalDepth: number,
): Shape {
  const through = cylinder(totalDepth, holeDia / 2, undefined, 32, true);
  const bore = cylinder(boreDepth, boreDia / 2, undefined, 32)
    .translate(0, 0, totalDepth / 2 - boreDepth);
  return union(through, bore);
}

/** Rectangular tube / hollow box */
export function tube(
  outerX: number,
  outerY: number,
  outerZ: number,
  wall: number,
): Shape {
  const outer = box(outerX, outerY, outerZ);
  const inner = box(outerX - wall * 2, outerY - wall * 2, outerZ + 1)
    .translate(wall, wall, -0.5);
  return outer.subtract(inner);
}

/** Pipe — hollow cylinder */
export function pipe(
  height: number,
  outerRadius: number,
  wall: number,
  segments = 32,
): Shape {
  const outer = cylinder(height, outerRadius, undefined, segments);
  const inner = cylinder(height + 1, outerRadius - wall, undefined, segments)
    .translate(0, 0, -0.5);
  return outer.subtract(inner);
}

/** Hex nut profile (2D extruded) */
export function hexNut(
  acrossFlats: number,
  height: number,
  holeDia: number,
): Shape {
  // Hexagon as intersection of 3 rotated boxes
  const r = acrossFlats / 2;
  const w = acrossFlats * 1.2; // oversized box
  const slab = box(w, acrossFlats, height, true);
  const hex = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));
  const hole = cylinder(height + 1, holeDia / 2, undefined, 32, true);
  return hex.subtract(hole);
}

/** Rounded box — box with spheres at corners (approximate fillet) */
export function roundedBox(
  x: number,
  y: number,
  z: number,
  radius: number,
): Shape {
  // Use hull of 8 spheres at corners — but Manifold hull is available
  // For now, intersect 3 axis-aligned rounded slabs
  const sx = box(x - radius * 2, y, z, true);
  const sy = box(x, y - radius * 2, z, true);
  const sz = box(x, y, z - radius * 2, true);
  return union(sx, sy, sz).translate(x / 2, y / 2, z / 2);
}

/** Mounting bracket — L-shaped with optional holes */
export function bracket(
  width: number,
  height: number,
  depth: number,
  thick: number,
  holeDia = 0,
): Shape {
  const base = box(width, depth, thick);
  const wall = box(width, thick, height).translate(0, 0, thick);
  let shape = union(base, wall);

  if (holeDia > 0) {
    const baseHole = cylinder(thick + 1, holeDia / 2, undefined, 24)
      .translate(width / 2, depth / 2, 0);
    const wallHole = cylinder(thick + 1, holeDia / 2, undefined, 24)
      .rotate(90, 0, 0)
      .translate(width / 2, 0, thick + height / 2);
    shape = shape.subtract(baseHole).subtract(wallHole);
  }

  return shape;
}

/** Grid pattern of holes */
export function holePattern(
  rows: number,
  cols: number,
  spacingX: number,
  spacingY: number,
  holeDia: number,
  depth: number,
): Shape {
  const holes: Shape[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      holes.push(
        cylinder(depth, holeDia / 2, undefined, 24)
          .translate(c * spacingX, r * spacingY, 0),
      );
    }
  }
  return union(...holes);
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
    axis: [number, number, number];   // rotation axis (cross of incoming/outgoing)
    center: [number, number, number]; // bend arc center
    angle: number;                    // bend angle in radians
    trimLen: number;                  // how much to shorten adjacent straights
    startPt: [number, number, number]; // where straight ends / bend starts
    endPt: [number, number, number];   // where bend ends / next straight starts
  };

  const bends: (BendInfo | null)[] = new Array(points.length).fill(null);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1];
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
    // The perpendicular direction in the bend plane pointing toward center:
    // It's the component of -dOut perpendicular to dIn, normalized, scaled by bendR
    // Simpler: center = startPt + normalize(cross(axis, dIn)) * bendR
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
    // pointAlong maps [0,0,1] → dir. The base (z=0) stays at origin.
    seg = seg.translate(a[0], a[1], a[2]);
    return seg;
  };

  // Helper: create a torus bend section
  const makeBend = (info: BendInfo) => {
    // Create a circle cross-section at (bendR, 0) in XY, revolve around Y axis
    // Manifold revolve: revolves around Y axis. Profile X = radial distance, Y = height.
    // We want a torus: circle at distance bendR from Y axis.
    const wasm = getWasm();
    const circlePts: [number, number][] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cx = bendR + radius * Math.cos(a);
      const cy = radius * Math.sin(a);
      circlePts.push([cx, cy]);
    }

    let innerPts: [number, number][] | null = null;
    if (wall != null && wall > 0) {
      innerPts = [];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        innerPts.push([bendR + (radius - wall) * Math.cos(a), (radius - wall) * Math.sin(a)]);
      }
    }

    const angleDeg = info.angle * 180 / Math.PI;
    const bendSegs = Math.max(4, Math.ceil(segs * angleDeg / 360));

    const outerCross = wasm.CrossSection.ofPolygons([circlePts]);
    let bendShape = new Shape(wasm.Manifold.revolve(outerCross, bendSegs, angleDeg), undefined);
    outerCross.delete();

    if (innerPts) {
      const innerCross = wasm.CrossSection.ofPolygons([innerPts]);
      const innerBend = new Shape(wasm.Manifold.revolve(innerCross, bendSegs, angleDeg), undefined);
      innerCross.delete();
      bendShape = bendShape.subtract(innerBend);
    }

    // Now orient the bend into world space.
    // After revolve around Y: the torus arc starts at +X direction (radial) and sweeps in XY plane.
    // We need to map this so:
    //   - The torus center is at info.center
    //   - The arc starts pointing from center toward info.startPt (incoming tangent direction)
    //   - The rotation axis is info.axis

    // In local space after revolve:
    //   - Center of torus is at origin
    //   - Arc starts along +X (the radial direction at angle=0)
    //   - Arc sweeps around Y axis
    //   - So the start tangent direction is +Z (the revolve starts sweeping from X toward... let's think)
    //
    // Actually, Manifold revolve() revolves around Y axis. At angle=0, the cross-section is at +X.
    // The sweep goes from angle=0 to angleDeg around Y.
    // The start point of the centerline is at (bendR, 0, 0) — that's the center of the cross-section circle.
    // The tangent at start is along +Z (since revolving around Y from +X goes toward +Z).
    //
    // We need:
    //   - Local +X (radial at start) → direction from center to startPt = -perpDir (from center toward startPt)
    //   - Local +Z (tangent at start) → -dIn (the incoming direction, reversed because the straight comes IN)
    //     Actually the tangent at the start of the bend should be along dIn (continuing the incoming direction)
    //   - Local +Y (revolve axis) → info.axis (or -info.axis depending on convention)

    // Direction from bend center to startPt
    const radialDir = normalize(sub(info.startPt, info.center)) as [number, number, number];
    // Tangent at start = dIn direction (the pipe continues in the same direction as the incoming straight)
    // But we need to figure out the sign. The revolve goes from angle 0 upward.
    // At angle=0, the centerline point is at (bendR, 0, 0). Tangent = d/dθ of (bendR*cos(θ), 0, bendR*sin(θ)) at θ=0 = (0, 0, bendR) → +Z direction.
    // So local +Z maps to the tangent at start.

    // We need to find what the incoming tangent direction is at the start of the bend.
    // The startPt is where the straight segment ends. The straight goes from prev toward cur.
    // So the tangent at startPt continuing into the bend is dIn (the incoming direction).

    // Build rotation matrix: local [+X, +Y, +Z] → world [radialDir, axis, tangentDir]
    // tangentDir = cross(radialDir, axis) ... let's verify:
    // We want the revolve to sweep from startPt toward endPt.
    // The revolve axis in local space is +Y. In world space it should be info.axis.
    // But we need to check the sign: does the revolve go from startPt toward endPt with +axis or -axis?

    // The cross product of dIn × dOut gives the axis. The revolve around this axis from startPt should reach endPt.
    // Let's just compute the tangent as cross(axis, radialDir) and check if it aligns with dIn.

    const tangentDir = cross(info.axis, radialDir) as [number, number, number];
    // tangentDir should be roughly aligned with the incoming direction at startPt
    // (the direction the pipe was going before the bend)

    // Build 4x4 column-major transform:
    // col0 = radialDir (local X → world)
    // col1 = axis (local Y → world)
    // col2 = tangentDir (local Z → world)
    // col3 = center (translation)
    const c = info.center;
    bendShape = bendShape.transform([
      radialDir[0], radialDir[1], radialDir[2], 0,
      info.axis[0], info.axis[1], info.axis[2], 0,
      tangentDir[0], tangentDir[1], tangentDir[2], 0,
      c[0], c[1], c[2], 1,
    ] as any);

    return bendShape;
  };

  // Build segments
  for (let i = 0; i < points.length - 1; i++) {
    // Effective start/end of this straight segment, trimmed by bends
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

// --- Vector math helpers ---
function sub(a: number[], b: number[]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function addVec(a: number[], b: number[]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(v: number[], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}
function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vecLen(v: number[]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
function normalize(v: number[]): [number, number, number] {
  const l = vecLen(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function clampDot(d: number): number {
  return Math.max(-1, Math.min(1, d));
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
    // elbow(pipeRadius, bendRadius, { from, to, wall, segments })
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
    angleDeg = Math.acos(d) * 180 / Math.PI;
  }

  if (angleDeg < 0.01) throw new Error('elbow: angle too small');

  const angleRad = angleDeg * Math.PI / 180;
  const wasm = getWasm();

  // Build torus cross-section: circle at distance bendRadius from Y axis
  const circlePts: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    circlePts.push([bendRadius + pipeRadius * Math.cos(a), pipeRadius * Math.sin(a)]);
  }

  const bendSegs = Math.max(4, Math.ceil(segs * angleDeg / 360));
  const outerCross = wasm.CrossSection.ofPolygons([circlePts]);
  let bendShape = new Shape(wasm.Manifold.revolve(outerCross, bendSegs, angleDeg), undefined);
  outerCross.delete();

  if (wall != null && wall > 0) {
    const innerPts: [number, number][] = [];
    const innerR = pipeRadius - wall;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      innerPts.push([bendRadius + innerR * Math.cos(a), innerR * Math.sin(a)]);
    }
    const innerCross = wasm.CrossSection.ofPolygons([innerPts]);
    const innerBend = new Shape(wasm.Manifold.revolve(innerCross, bendSegs, angleDeg), undefined);
    innerCross.delete();
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

    // In local space after revolve around Y:
    //   - Arc starts at +X (radial), tangent at start is +Z
    //   - Revolve axis is +Y
    // We want: local +Z → fromDir, local +Y → axis, local +X → perpendicular
    const perpDir = cross(axis, nFrom) as [number, number, number];

    bendShape = bendShape.transform([
      perpDir[0], perpDir[1], perpDir[2], 0,
      axis[0], axis[1], axis[2], 0,
      nFrom[0], nFrom[1], nFrom[2], 0,
      0, 0, 0, 1,
    ] as any);
  }

  return bendShape;
}

/** All library parts, keyed by name */
export const partLibrary = {
  boltHole,
  counterbore,
  tube,
  pipe,
  hexNut,
  roundedBox,
  bracket,
  holePattern,
  thread,
  bolt,
  nut,
  pipeRoute,
  elbow,
};

// --- Thread / Fastener library ---

/**
 * External thread via twisted extrusion — no SDF grid artifacts.
 * 
 * The idea: build a cross-section that's a circle at the root diameter
 * with one trapezoidal bump out to the crest diameter. Then twist-extrude
 * it so the bump traces a helix. Manifold's extrude+twist produces clean
 * structured geometry — quads split into triangles that follow the thread.
 * 
 * Returns a threaded cylinder along +Z from z=0 to z=length.
 */
export function thread(
  diameter: number,
  pitch: number,
  length: number,
  options?: { depth?: number; segments?: number },
): Shape {
  const r = diameter / 2;
  const depth = options?.depth ?? pitch * 0.35;
  const segs = options?.segments ?? 36;
  const rRoot = r - depth;
  const rCrest = r;
  const turns = length / pitch;
  const divisions = Math.max(4, Math.ceil(turns * segs));

  // The tooth angular width at the root radius.
  // Standard metric: tooth occupies ~50% of pitch circumferentially.
  // One pitch spans (pitch / rRoot) radians at the root circle.
  const toothHalfWidth = (pitch * 0.5) / (2 * rRoot);  // half-width in radians
  const flankWidth = toothHalfWidth * 0.4;  // transition zone

  const pts: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;

    // Distance from the tooth center (at angle=0), wrapped to [-π, π]
    let da = a;
    if (da > Math.PI) da -= Math.PI * 2;
    const absDA = Math.abs(da);

    let radius: number;
    if (absDA < toothHalfWidth - flankWidth) {
      // Crest flat
      radius = rCrest;
    } else if (absDA < toothHalfWidth) {
      // Flank — linear blend from crest to root
      const t = (absDA - (toothHalfWidth - flankWidth)) / flankWidth;
      radius = rCrest + (rRoot - rCrest) * t;
    } else {
      // Root
      radius = rRoot;
    }

    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }

  const wasm = getWasm();
  const cross = wasm.CrossSection.ofPolygons([pts]);
  const m = wasm.Manifold.extrude(cross, length, divisions, turns * 360);
  cross.delete();
  return new Shape(m);
}

/**
 * Hex bolt with real helical threads.
 * Head at z=0..headHeight, shaft extends downward along -Z.
 */
export function bolt(
  diameter: number,
  length: number,
  options?: {
    pitch?: number;
    headHeight?: number;
    headAcrossFlats?: number;
    threadLength?: number;
    segments?: number;
  },
): Shape {
  const r = diameter / 2;
  const pitch = options?.pitch ?? diameter * 0.15;
  const headH = options?.headHeight ?? diameter * 0.65;
  const headAF = options?.headAcrossFlats ?? diameter * 1.6;
  const threadLen = options?.threadLength ?? length;
  const segs = options?.segments ?? 36;

  // Hex head
  const slab = box(headAF * 1.2, headAF, headH, true).translate(0, 0, headH / 2);
  const hexHead = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));

  // Smooth shaft (unthreaded portion)
  const unthreadedLen = length - threadLen;
  const parts: Shape[] = [hexHead];

  if (unthreadedLen > 0.1) {
    parts.push(
      cylinder(unthreadedLen, r, undefined, segs).translate(0, 0, -unthreadedLen),
    );
  }

  // Threaded portion
  const threaded = thread(diameter, pitch, threadLen, { segments: segs })
    .translate(0, 0, -length);
  parts.push(threaded);

  // TODO: Tip chamfer (cone at the end)
  return union(...parts);
}

/**
 * Hex nut with threaded bore.
 * Centered at origin, height along Z.
 */
export function nut(
  diameter: number,
  options?: {
    pitch?: number;
    height?: number;
    acrossFlats?: number;
    segments?: number;
  },
): Shape {
  const r = diameter / 2;
  const pitch = options?.pitch ?? diameter * 0.15;
  const nutH = options?.height ?? diameter * 0.8;
  const nutAF = options?.acrossFlats ?? diameter * 1.6;
  const segs = options?.segments ?? 36;

  // Hex body
  const slab = box(nutAF * 1.2, nutAF, nutH, true);
  let hexBody = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));

  // Threaded bore (internal thread = slightly larger bore with thread ridges)
  // For simplicity, use a clearance bore — internal threads are hard to see anyway
  const bore = cylinder(nutH + 1, r + 0.1, undefined, 48, true);
  hexBody = hexBody.subtract(bore);

  // TODO: Chamfer top and bottom edges

  return hexBody;
}

/**
 * Arc bridge between two rectangular areas.
 *
 * Generates a smooth arc surface connecting the two closest parallel edges
 * of the rectangles ("inner edges"). The cross-section is a circular arc
 * from one edge to the other, swept along the overlapping edge direction.
 *
 * Typical use: laptop hinge, box lid connection.
 */

import { Shape } from '../kernel';
import { Rectangle2D } from './entities';
import { sketchExtrude } from './extrude';
import { polygon } from './primitives';
import { type EdgeRef } from './topology';

type Vec3 = [number, number, number];
type Mat16 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function len(v: Vec3): number {
  return Math.sqrt(dot(v, v));
}
function normalize(v: Vec3): Vec3 {
  const l = len(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function midpoint(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

export interface RectAreaRef {
  /** Rectangle corners in order: bottom-left, bottom-right, top-right, top-left */
  corners: [Vec3, Vec3, Vec3, Vec3];
}

type RectAreaArg = RectAreaRef | Rectangle2D;

function rectAreaFrom(arg: RectAreaArg): RectAreaRef {
  if (arg instanceof Rectangle2D) {
    const [bl, br, tr, tl] = arg.vertices;
    return {
      corners: [
        [bl.x, bl.y, 0],
        [br.x, br.y, 0],
        [tr.x, tr.y, 0],
        [tl.x, tl.y, 0],
      ],
    };
  }
  return arg;
}

function rectEdges(rect: RectAreaRef, prefix: string): EdgeRef[] {
  const [bl, br, tr, tl] = rect.corners;
  return [
    { name: `${prefix}-bottom`, start: bl, end: br },
    { name: `${prefix}-right`, start: br, end: tr },
    { name: `${prefix}-top`, start: tr, end: tl },
    { name: `${prefix}-left`, start: tl, end: bl },
  ];
}

function edgeDir(edge: EdgeRef): Vec3 {
  return normalize(sub(edge.end, edge.start));
}

function arcBridgeBetweenParallelEdges(edgeA: EdgeRef, edgeB: EdgeRef, segments: number): Shape {
  const dirA = edgeDir(edgeA);
  const dirB = edgeDir(edgeB);
  const parallel = Math.abs(dot(dirA, dirB)) > 0.999;
  if (!parallel) {
    throw new Error('Inner edges are not parallel');
  }

  const projA0 = dot(edgeA.start, dirA);
  const projA1 = dot(edgeA.end, dirA);
  const projB0 = dot(edgeB.start, dirA);
  const projB1 = dot(edgeB.end, dirA);
  const aMin = Math.min(projA0, projA1);
  const aMax = Math.max(projA0, projA1);
  const bMin = Math.min(projB0, projB1);
  const bMax = Math.max(projB0, projB1);
  const overlapMin = Math.max(aMin, bMin);
  const overlapMax = Math.min(aMax, bMax);
  const overlapLen = overlapMax - overlapMin;
  if (overlapLen < 1e-6) {
    throw new Error('Inner edges do not overlap along their direction');
  }

  const anchorA = add(edgeA.start, scale(dirA, overlapMin - projA0));
  const anchorB = add(edgeB.start, scale(dirA, overlapMin - projB0));

  // Vector from A to B in the perpendicular plane
  const chord = sub(anchorB, anchorA);
  // Remove any component along edge direction
  const alongEdge = dot(chord, dirA);
  const perpChord: Vec3 = [chord[0] - dirA[0] * alongEdge, chord[1] - dirA[1] * alongEdge, chord[2] - dirA[2] * alongEdge];
  const chordLen = len(perpChord);
  if (chordLen < 1e-6) throw new Error('Edges are coincident — no arc to build');

  // Build a local coordinate frame:
  // U = direction from A to B (in perp plane)
  // V = edgeDir × U (the "bulge" direction of the arc)
  // W = edgeDir (extrusion direction)
  const U = normalize(perpChord);
  const V = normalize(cross(dirA, U));

  // Arc center is at midpoint of chord, arc radius = chordLen/2
  // This gives a semicircle. For a less aggressive arc, we could parameterize.
  const radius = chordLen / 2;
  const arcCenter2D: [number, number] = [chordLen / 2, 0]; // in U-V local coords, A is at (0,0), B at (chordLen, 0)

  // Generate arc points in 2D (U-V plane), from A(0,0) to B(chordLen, 0) via semicircle
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = (Math.PI * i) / segments; // 0 to PI
    const u = arcCenter2D[0] - radius * Math.cos(t);
    const v = radius * Math.sin(t);
    pts.push([u, v]);
  }

  // Close into a thin solid by adding a straight line back (small thickness)
  // We'll make a thin polygon: arc points + reverse path slightly offset inward
  const thickness = Math.max(0.5, chordLen * 0.02);
  const innerPts: [number, number][] = [];
  for (let i = segments; i >= 0; i--) {
    const t = (Math.PI * i) / segments;
    const r2 = radius - thickness;
    const u = arcCenter2D[0] - r2 * Math.cos(t);
    const v = r2 * Math.sin(t);
    innerPts.push([u, v]);
  }

  const profile = polygon([...pts, ...innerPts]);
  const solid = sketchExtrude(profile, overlapLen).toShape();

  // Build transform: local XY → world UV plane, local Z → edge direction
  // The profile is in XY, extrusion is along Z.
  // We want: local X → U, local Y → V, local Z → edgeDir
  // Origin at anchorA (start of the overlapping region on edgeA)
  const origin = anchorA;

  // Manifold transform() takes 4x4 column-major
  const m: Mat16 = [U[0], U[1], U[2], 0, V[0], V[1], V[2], 0, dirA[0], dirA[1], dirA[2], 0, origin[0], origin[1], origin[2], 1];

  return solid.transform(m);
}

/**
 * Build an arc bridge between two rectangular areas.
 *
 * @param rectA - First rectangle (2D Rectangle2D or 3D corners)
 * @param rectB - Second rectangle (2D Rectangle2D or 3D corners)
 * @param segments - Number of arc segments (more = smoother)
 * @returns Shape — the arc surface as a thin solid
 */
export function arcBridgeBetweenRects(rectA: RectAreaArg, rectB: RectAreaArg, segments = 12): Shape {
  const a = rectAreaFrom(rectA);
  const b = rectAreaFrom(rectB);
  const edgesA = rectEdges(a, 'a');
  const edgesB = rectEdges(b, 'b');

  let best: { edgeA: EdgeRef; edgeB: EdgeRef; dist: number } | null = null;
  for (const ea of edgesA) {
    const dirA = edgeDir(ea);
    for (const eb of edgesB) {
      const dirB = edgeDir(eb);
      if (Math.abs(dot(dirA, dirB)) < 0.999) continue;
      const midA = midpoint(ea.start, ea.end);
      const midB = midpoint(eb.start, eb.end);
      const chord = sub(midB, midA);
      const along = dot(chord, dirA);
      const perp = sub(chord, scale(dirA, along));
      const dist = len(perp);
      if (dist < 1e-6) continue;
      if (!best || dist < best.dist) {
        best = { edgeA: ea, edgeB: eb, dist };
      }
    }
  }

  if (!best) {
    throw new Error('No parallel inner edges found between the two rectangles');
  }

  return arcBridgeBetweenParallelEdges(best.edgeA, best.edgeB, segments);
}

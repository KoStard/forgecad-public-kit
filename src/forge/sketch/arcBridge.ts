/**
 * Arc bridge between two parallel edges.
 *
 * Generates a smooth arc surface connecting two parallel straight edges.
 * The cross-section is a circular arc from one edge to the other,
 * swept along the shared edge direction.
 *
 * Typical use: laptop hinge, box lid connection.
 */

import { Shape } from '../kernel';
import { polygon } from './primitives';
import { sketchExtrude } from './extrude';
import { type EdgeRef } from './topology';

type Vec3 = [number, number, number];
type Mat16 = [number,number,number,number,number,number,number,number,number,number,number,number,number,number,number,number];

function sub(a: Vec3, b: Vec3): Vec3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function add(a: Vec3, b: Vec3): Vec3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function scale(v: Vec3, s: number): Vec3 { return [v[0]*s, v[1]*s, v[2]*s]; }
function dot(a: Vec3, b: Vec3): number { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
}
function len(v: Vec3): number { return Math.sqrt(dot(v, v)); }
function normalize(v: Vec3): Vec3 { const l = len(v) || 1; return [v[0]/l, v[1]/l, v[2]/l]; }

/**
 * Build an arc bridge between two parallel edges.
 *
 * @param edgeA - First edge (e.g. top-top of base)
 * @param edgeB - Second edge (e.g. top-bottom of screen), must be parallel to edgeA
 * @param segments - Number of arc segments (more = smoother)
 * @returns Shape — the arc surface as a thin solid
 */
export function arcBridgeBetweenEdges(
  edgeA: EdgeRef,
  edgeB: EdgeRef,
  segments = 12,
): Shape {
  // Edge directions
  const dirA = sub(edgeA.end, edgeA.start);
  const dirB = sub(edgeB.end, edgeB.start);
  const edgeDir = normalize(dirA);
  const edgeLenA = len(dirA);
  const edgeLenB = len(dirB);

  // Use the midpoints of each edge as the arc endpoints in the perpendicular plane
  const midA: Vec3 = [
    (edgeA.start[0] + edgeA.end[0]) / 2,
    (edgeA.start[1] + edgeA.end[1]) / 2,
    (edgeA.start[2] + edgeA.end[2]) / 2,
  ];
  const midB: Vec3 = [
    (edgeB.start[0] + edgeB.end[0]) / 2,
    (edgeB.start[1] + edgeB.end[1]) / 2,
    (edgeB.start[2] + edgeB.end[2]) / 2,
  ];

  // Vector from A to B in the perpendicular plane
  const chord = sub(midB, midA);
  // Remove any component along edge direction
  const alongEdge = dot(chord, edgeDir);
  const perpChord: Vec3 = [
    chord[0] - edgeDir[0] * alongEdge,
    chord[1] - edgeDir[1] * alongEdge,
    chord[2] - edgeDir[2] * alongEdge,
  ];
  const chordLen = len(perpChord);
  if (chordLen < 1e-6) throw new Error('Edges are coincident — no arc to build');

  // Build a local coordinate frame:
  // U = direction from A to B (in perp plane)
  // V = edgeDir × U (the "bulge" direction of the arc)
  // W = edgeDir (extrusion direction)
  const U = normalize(perpChord);
  const V = normalize(cross(edgeDir, U));

  // Arc center is at midpoint of chord, arc radius = chordLen/2
  // This gives a semicircle. For a less aggressive arc, we could parameterize.
  const radius = chordLen / 2;
  const arcCenter2D: [number, number] = [chordLen / 2, 0]; // in U-V local coords, A is at (0,0), B at (chordLen, 0)

  // Generate arc points in 2D (U-V plane), from A(0,0) to B(chordLen, 0) via semicircle
  const pts: [number, number][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = Math.PI * i / segments; // 0 to PI
    const u = arcCenter2D[0] - radius * Math.cos(t);
    const v = radius * Math.sin(t);
    pts.push([u, v]);
  }

  // Close into a thin solid by adding a straight line back (small thickness)
  // We'll make a thin polygon: arc points + reverse path slightly offset inward
  const thickness = Math.max(0.5, chordLen * 0.02);
  const innerPts: [number, number][] = [];
  for (let i = segments; i >= 0; i--) {
    const t = Math.PI * i / segments;
    const r2 = radius - thickness;
    const u = arcCenter2D[0] - r2 * Math.cos(t);
    const v = r2 * Math.sin(t);
    innerPts.push([u, v]);
  }

  const profile = polygon([...pts, ...innerPts]);

  // Extrude along the edge length (use the longer edge)
  const extrudeLen = Math.max(edgeLenA, edgeLenB);
  const solid = sketchExtrude(profile, extrudeLen);

  // Build transform: local XY → world UV plane, local Z → edge direction
  // The profile is in XY, extrusion is along Z.
  // We want: local X → U, local Y → V, local Z → edgeDir
  // Origin at edgeA.start (projected to remove along-edge offset from midA)
  const origin = edgeA.start;

  const m: Mat16 = [
    U[0], V[0], edgeDir[0], origin[0],
    U[1], V[1], edgeDir[1], origin[1],
    U[2], V[2], edgeDir[2], origin[2],
    0,    0,    0,          1,
  ];

  return solid.transform(m);
}

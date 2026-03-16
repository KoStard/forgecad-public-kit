/**
 * Planar arrangement detection for constrained sketches.
 *
 * Given a set of line segments (from a solved ConstraintSketch), computes the
 * planar subdivision — all minimal bounded faces formed by the line arrangement —
 * and returns each face as an independent Sketch.
 *
 * This enables the "real CAD" workflow: draw lines freely with constraints,
 * no explicit loops needed, then call `detectArrangement()` to get every
 * enclosed area ready for extrusion.
 *
 * Algorithm: DCEL-based half-edge face traversal.
 * 1. Collect all non-construction line segments from the definition.
 * 2. Find all pairwise interior intersections; split segments there.
 * 3. Snap nearby nodes (endpoints + intersections) together.
 * 4. Build directed half-edges; at each node sort outgoing edges by angle.
 * 5. Assign next-pointers using the DCEL formula:
 *    next(u→v) = the outgoing half-edge from v immediately preceding (v→u)
 *                in CCW angular order at v.
 * 6. Traverse all face cycles; keep only those with positive (CCW) signed area.
 * 7. Build a polygon Sketch for each bounded face.
 *
 * Circles are not included — they contribute via explicit `addLoopCircle()` /
 * `circle()` calls. Construction lines are always excluded.
 */

import { Sketch } from './core';
import { polygon } from './primitives';
import type { ConstraintDefinition } from './constraints';
import { ConstraintSketch } from './constraints';

type Vec2 = [number, number];

const SNAP_EPS = 1e-6;
const INTERSECT_EPS = 1e-8;
const AREA_EPS = 1e-9;

// ─── Geometry helpers ────────────────────────────────────────────────────────

function pointInPolygon(point: Vec2, poly: Vec2[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (((yi > py) !== (yj > py))
        && (px < ((xj - xi) * (py - yi)) / ((yj - yi) || 1e-20) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Segment-segment intersection ───────────────────────────────────────────

interface Seg { a: Vec2; b: Vec2 }

/**
 * Returns the parameter t ∈ (0, 1) exclusive at which segment p1–p2 is
 * intersected by segment p3–p4, or null if they do not cross at interior
 * points. Endpoint-touching cases (t ≈ 0 or t ≈ 1) are excluded intentionally
 * — shared endpoints are captured naturally as equal node coordinates and then
 * merged by snapNodes.
 */
function segSegT(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): number | null {
  const dx1 = p2[0] - p1[0];
  const dy1 = p2[1] - p1[1];
  const dx2 = p4[0] - p3[0];
  const dy2 = p4[1] - p3[1];
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < INTERSECT_EPS) return null; // parallel or collinear
  const dx3 = p3[0] - p1[0];
  const dy3 = p3[1] - p1[1];
  const t = (dx3 * dy2 - dy3 * dx2) / denom;
  const s = (dx3 * dy1 - dy3 * dx1) / denom;
  if (t > INTERSECT_EPS && t < 1 - INTERSECT_EPS
      && s > INTERSECT_EPS && s < 1 - INTERSECT_EPS) {
    return t;
  }
  return null;
}

// ─── Segment splitting ──────────────────────────────────────────────────────

/**
 * Returns the parameter t ∈ (0, 1) exclusive where point P lies on segment A–B,
 * or null if P is not on the segment's interior (within SNAP_EPS tolerance).
 * Used to detect T-junctions: an endpoint of one segment lying on another's interior.
 */
function pointOnSegT(p: Vec2, a: Vec2, b: Vec2): number | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < INTERSECT_EPS * INTERSECT_EPS) return null; // degenerate segment
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (t <= INTERSECT_EPS || t >= 1 - INTERSECT_EPS) return null;
  // Perpendicular distance from p to the line — must be within snap tolerance
  const perpDist = Math.abs((p[1] - a[1]) * dx - (p[0] - a[0]) * dy) / Math.sqrt(len2);
  return perpDist < SNAP_EPS ? t : null;
}

/**
 * Split every segment at all intersections with other segments.
 *
 * Handles both X-crossings (two segment interiors cross) and T-junctions
 * (an endpoint of one segment lies on the interior of another). T-junction
 * handling is critical for correct arrangement detection when dividers touch
 * the boundary of an enclosing box.
 */
function splitAtIntersections(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i += 1) {
    const rawTs: number[] = [0, 1];
    for (let j = 0; j < segs.length; j += 1) {
      if (i === j) continue;
      // Interior × interior intersection
      const t = segSegT(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (t !== null) rawTs.push(t);
      // T-junction: endpoint of j lies on interior of i
      const ta = pointOnSegT(segs[j].a, segs[i].a, segs[i].b);
      if (ta !== null) rawTs.push(ta);
      const tb = pointOnSegT(segs[j].b, segs[i].a, segs[i].b);
      if (tb !== null) rawTs.push(tb);
    }

    rawTs.sort((x, y) => x - y);
    // Deduplicate t values that are closer than INTERSECT_EPS
    const dedupTs: number[] = [rawTs[0]];
    for (let k = 1; k < rawTs.length; k += 1) {
      if (rawTs[k] - dedupTs[dedupTs.length - 1] > INTERSECT_EPS) {
        dedupTs.push(rawTs[k]);
      }
    }

    const { a, b } = segs[i];
    for (let k = 0; k < dedupTs.length - 1; k += 1) {
      const t0 = dedupTs[k];
      const t1 = dedupTs[k + 1];
      if (t1 - t0 < INTERSECT_EPS) continue;
      out.push({
        a: [a[0] + t0 * (b[0] - a[0]), a[1] + t0 * (b[1] - a[1])],
        b: [a[0] + t1 * (b[0] - a[0]), a[1] + t1 * (b[1] - a[1])],
      });
    }
  }
  return out;
}

// ─── Node snapping + graph building ─────────────────────────────────────────

interface PlaneGraph {
  nodes: Vec2[];
  edges: [number, number][];
}

/** Merge nearby endpoints, deduplicate edges, produce a clean planar graph. */
function buildPlaneGraph(segs: Seg[]): PlaneGraph {
  const nodes: Vec2[] = [];

  const nodeIndex = (p: Vec2): number => {
    for (let i = 0; i < nodes.length; i += 1) {
      if (Math.abs(nodes[i][0] - p[0]) < SNAP_EPS
          && Math.abs(nodes[i][1] - p[1]) < SNAP_EPS) {
        return i;
      }
    }
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };

  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const seg of segs) {
    const a = nodeIndex(seg.a);
    const b = nodeIndex(seg.b);
    if (a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push([a, b]);
    }
  }

  return { nodes, edges };
}

// ─── DCEL face traversal ─────────────────────────────────────────────────────

/**
 * Traverse all face cycles and return each bounded face (positive signed area)
 * as an array of polygon vertices.
 *
 * DCEL half-edge convention:
 *   edge i → half-edge 2i  = nodes[edges[i][0]] → nodes[edges[i][1]]
 *             half-edge 2i+1 = reverse
 *
 * next(u→v) formula:
 *   At vertex v, sort outgoing half-edges by polar angle.
 *   next(u→v) = the outgoing half-edge from v immediately preceding twin(u→v)
 *               in CCW order (i.e., the one at position (pos−1) in the sorted
 *               list, wrapping around).
 *
 * This traces the face boundary to the LEFT of each directed half-edge.
 * Faces with negative area are the unbounded outer face (CW winding) — excluded.
 */
function traverseFaces(graph: PlaneGraph): Vec2[][] {
  const { nodes, edges } = graph;
  if (edges.length === 0) return [];

  const totalHE = edges.length * 2;

  // Build per-node outgoing half-edge lists
  const outgoing: number[][] = nodes.map(() => []);
  for (let i = 0; i < edges.length; i += 1) {
    outgoing[edges[i][0]].push(2 * i);     // forward: a→b
    outgoing[edges[i][1]].push(2 * i + 1); // reverse: b→a
  }

  // Sort outgoing at each node by polar angle
  const heAngle = (he: number): number => {
    const ei = he >> 1;
    const [a, b] = edges[ei];
    const from = (he & 1) === 0 ? a : b;
    const to   = (he & 1) === 0 ? b : a;
    return Math.atan2(nodes[to][1] - nodes[from][1], nodes[to][0] - nodes[from][0]);
  };
  for (const out of outgoing) {
    out.sort((x, y) => heAngle(x) - heAngle(y));
  }

  const heFrom = (he: number): number => {
    const ei = he >> 1;
    return (he & 1) === 0 ? edges[ei][0] : edges[ei][1];
  };
  const heTo = (he: number): number => {
    const ei = he >> 1;
    return (he & 1) === 0 ? edges[ei][1] : edges[ei][0];
  };

  const nextHE = (he: number): number => {
    const v = heTo(he);
    const tw = he ^ 1; // twin = (v→from) direction
    const out = outgoing[v];
    const pos = out.indexOf(tw);
    if (pos === -1) return -1; // dangling edge — safety guard
    return out[(pos - 1 + out.length) % out.length];
  };

  const visited = new Uint8Array(totalHE);
  const faces: Vec2[][] = [];

  for (let startHE = 0; startHE < totalHE; startHE += 1) {
    if (visited[startHE]) continue;

    const nodeIds: number[] = [];
    let he = startHE;
    let guard = totalHE + 4;

    do {
      if (visited[he]) { nodeIds.length = 0; break; }
      visited[he] = 1;
      nodeIds.push(heFrom(he));
      he = nextHE(he);
      if (he === -1) { nodeIds.length = 0; break; }
      if (--guard < 0) { nodeIds.length = 0; break; }
    } while (he !== startHE);

    if (nodeIds.length < 3) continue;

    const pts: Vec2[] = nodeIds.map((nid) => nodes[nid]);
    let area = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      area += x1 * y2 - x2 * y1;
    }
    if (area * 0.5 > AREA_EPS) {
      faces.push(pts);
    }
  }

  return faces;
}

// ─── Internal helper used by ConstraintSketch methods ───────────────────────

function arrangementFacesFromDef(def: ConstraintDefinition): Vec2[][] {
  const pointMap = new Map(def.points.map((p) => [p.id, p] as const));
  const segs: Seg[] = [];
  for (const l of def.lines) {
    if (l.construction) continue;
    const a = pointMap.get(l.a);
    const b = pointMap.get(l.b);
    if (a && b) segs.push({ a: [a.x, a.y], b: [b.x, b.y] });
  }
  if (segs.length === 0) return [];
  return traverseFaces(buildPlaneGraph(splitAtIntersections(segs)));
}

// ─── ConstraintSketch method implementations ─────────────────────────────────

/**
 * Enumerate all bounded regions formed by this sketch's non-construction lines.
 * Explicit loops (added via `addLoop` / `moveTo+lineTo+close`) are ignored —
 * only the raw line geometry is used to find enclosed areas.
 *
 * Regions are returned largest-first by area.
 *
 * The typical workflow:
 *   1. Build a `ConstrainedSketchBuilder` with only lines (and constraints).
 *   2. Do NOT call `addLoop()`.
 *   3. Call `.solve()` to get a `ConstraintSketch`.
 *   4. Call `.detectArrangement()` to get all enclosed areas.
 *   5. Extrude or otherwise use the region sketches.
 *
 * @example
 * // Two rectangles sharing a wall
 * const b = constrainedSketch();
 * const p = (x: number, y: number) => b.point(x, y);
 * // outer box
 * const [p00, p10, p11, p01] = [p(0,0), p(100,0), p(100,60), p(0,60)];
 * // vertical divider at x=50
 * const [pm0, pm1] = [p(50,0), p(50,60)];
 * b.line(p00,p10); b.line(p10,p11); b.line(p11,p01); b.line(p01,p00);
 * b.line(pm0,pm1);
 * b.fix(p00,0,0); b.length(b.lineAt(0),100); b.length(b.lineAt(1),60);
 * const sketch = b.solve();
 * const [left, right] = sketch.detectArrangement();
 * left.extrude(10);
 */
(ConstraintSketch.prototype as any).detectArrangement = function (
  this: ConstraintSketch,
): Sketch[] {
  const faces = arrangementFacesFromDef(this.definition);
  const sketches = faces.map((pts) => polygon(pts));
  sketches.sort((a, b) => b.area() - a.area());
  return sketches;
};

/**
 * Select the single arrangement region that contains the given 2D seed point.
 *
 * Throws if no bounded face contains the seed.
 *
 * @param seed - A 2D point `[x, y]` strictly inside the desired face.
 *
 * @example
 * const sketch = b.solve();
 * // Pick left half of a divided rectangle
 * const leftHalf = sketch.detectArrangementRegion([25, 30]);
 * leftHalf.extrude(10);
 */
(ConstraintSketch.prototype as any).detectArrangementRegion = function (
  this: ConstraintSketch,
  seed: [number, number],
): Sketch {
  const faces = arrangementFacesFromDef(this.definition);
  if (faces.length === 0) {
    throw new Error(
      'detectArrangementRegion(): no bounded regions found. '
      + 'Ensure the sketch has non-construction lines that form closed loops.',
    );
  }
  for (const pts of faces) {
    if (pointInPolygon(seed, pts)) {
      return polygon(pts);
    }
  }
  throw new Error(
    `detectArrangementRegion(): seed point [${seed[0]}, ${seed[1]}] is not inside any of the `
    + `${faces.length} detected region(s). The seed must lie strictly inside an enclosed area.`,
  );
};

// ─── Public standalone exports ───────────────────────────────────────────────

/**
 * Compute all bounded planar faces from the constraint definition's lines.
 * Low-level building block — prefer the `.detectArrangement()` method on
 * `ConstraintSketch` for the ergonomic API.
 */
export function computeArrangementFaces(def: ConstraintDefinition): Vec2[][] {
  return arrangementFacesFromDef(def);
}

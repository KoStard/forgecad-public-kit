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

import { computeFacesFromSegments, pointInPolygon } from './arrangement-core';
import type { ConstraintDefinition } from './constraints';
import { ConstraintSketch } from './constraints';
import { Sketch } from './core';
import { polygon } from './primitives';

type Vec2 = [number, number];

// ─── Internal helper: extract segments and run DCEL face detection ──────────

function arrangementFacesFromDef(def: ConstraintDefinition): Vec2[][] {
  const pointMap = new Map(def.points.map((p) => [p.id, p] as const));
  const segs: { a: Vec2; b: Vec2 }[] = [];
  for (const l of def.lines) {
    if (l.construction) continue;
    const a = pointMap.get(l.a);
    const b = pointMap.get(l.b);
    if (a && b) segs.push({ a: [a.x, a.y], b: [b.x, b.y] });
  }
  return computeFacesFromSegments(segs);
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
(ConstraintSketch.prototype as any).detectArrangement = function (this: ConstraintSketch): Sketch[] {
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
(ConstraintSketch.prototype as any).detectArrangementRegion = function (this: ConstraintSketch, seed: [number, number]): Sketch {
  const faces = arrangementFacesFromDef(this.definition);
  if (faces.length === 0) {
    throw new Error(
      'detectArrangementRegion(): no bounded regions found. ' + 'Ensure the sketch has non-construction lines that form closed loops.',
    );
  }
  for (const pts of faces) {
    if (pointInPolygon(seed, pts)) {
      return polygon(pts);
    }
  }
  throw new Error(
    `detectArrangementRegion(): seed point [${seed[0]}, ${seed[1]}] is not inside any of the ` +
      `${faces.length} detected region(s). The seed must lie strictly inside an enclosed area.`,
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

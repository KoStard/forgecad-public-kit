/**
 * Sketch region decomposition.
 *
 * Exposes `sketch.regions()` and `sketch.region(seed)` which decompose a
 * Manifold CrossSection into its disconnected filled areas, properly handling
 * outer-boundary / hole nesting.
 *
 * This is the public API surface extracted from the same algorithm used
 * internally by the SVG import pipeline.
 */

import { difference2d } from './booleans';
import { copySketchPlacement3D, Sketch } from './core';
import { polygon } from './primitives';

type Vec2 = [number, number];

const EPS = 1e-9;
const MIN_POINT_DIST = 1e-7;

// ─── Geometry helpers ────────────────────────────────────────────────────────

function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function signedArea(pts: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area += x1 * y2 - x2 * y1;
  }
  return area * 0.5;
}

function polygonCentroid(pts: Vec2[]): Vec2 {
  let cx = 0;
  let cy = 0;
  let a2 = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    const cross = x1 * y2 - x2 * y1;
    a2 += cross;
    cx += (x1 + x2) * cross;
    cy += (y1 + y2) * cross;
  }
  if (Math.abs(a2) < EPS) {
    // degenerate polygon — fall back to arithmetic centroid
    let sx = 0;
    let sy = 0;
    for (const [x, y] of pts) {
      sx += x;
      sy += y;
    }
    return pts.length > 0 ? [sx / pts.length, sy / pts.length] : [0, 0];
  }
  const f = 1 / (3 * a2);
  return [cx * f, cy * f];
}

function removeDuplicateClose(pts: Vec2[]): Vec2[] {
  if (pts.length <= 1) return pts;
  if (dist2(pts[0], pts[pts.length - 1]) <= MIN_POINT_DIST) {
    return pts.slice(0, -1);
  }
  return pts;
}

function pointInPolygon(point: Vec2, poly: Vec2[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-20) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Region extraction ───────────────────────────────────────────────────────

interface LoopInfo {
  points: Vec2[];
  area: number;
  absArea: number;
  sample: Vec2;
}

interface RegionCandidate {
  sketch: Sketch;
  area: number;
  outerPoints: Vec2[];
  holePoints: Vec2[][];
}

function extractRegionCandidates(sketch: Sketch): RegionCandidate[] {
  const rawLoops = sketch.toPolygons() as number[][][];
  const loops: LoopInfo[] = rawLoops
    .map((loop) => loop.map(([x, y]) => [x, y] as Vec2))
    .map((pts) => removeDuplicateClose(pts))
    .filter((pts) => pts.length >= 3)
    .map((pts) => {
      const area = signedArea(pts);
      return { points: pts, area, absArea: Math.abs(area), sample: polygonCentroid(pts) };
    })
    .filter((loop) => loop.absArea > EPS);

  if (loops.length === 0) return [];

  const outers = loops.filter((l) => l.area > 0);
  const holes = loops.filter((l) => l.area < 0);

  if (outers.length === 0) {
    // All contours wound CW — treat largest as outer
    const fallbackPts = loops[0].points;
    const fb = polygon(fallbackPts);
    return fb.isEmpty() ? [] : [{ sketch: fb, area: fb.area(), outerPoints: fallbackPts, holePoints: [] }];
  }

  // Nest holes into their smallest containing outer boundary
  const regions = outers.map((outer) => ({
    outer,
    holes: [] as LoopInfo[],
  }));
  for (const hole of holes) {
    const containers = regions.filter((r) => pointInPolygon(hole.sample, r.outer.points)).sort((a, b) => a.outer.absArea - b.outer.absArea);
    if (containers.length > 0) {
      containers[0].holes.push(hole);
    }
  }

  const built: RegionCandidate[] = [];
  for (const region of regions) {
    let regionSketch = polygon(region.outer.points);
    if (region.holes.length > 0) {
      const holeSketches = region.holes.map((h) => polygon(h.points));
      regionSketch = difference2d(regionSketch, ...holeSketches);
    }
    if (!regionSketch.isEmpty()) {
      built.push({
        area: Math.abs(regionSketch.area()),
        sketch: regionSketch,
        outerPoints: region.outer.points,
        holePoints: region.holes.map((h) => h.points),
      });
    }
  }

  built.sort((a, b) => b.area - a.area);
  return built;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Decompose a sketch into its distinct filled regions.
 *
 * A single Manifold CrossSection can contain several disconnected filled areas
 * (e.g., two separate rectangles, a ring shape with a hole, or the result of a
 * boolean operation that leaves multiple islands). This function enumerates all
 * top-level connected regions as independent `Sketch` objects, each carrying
 * one outer boundary with its associated holes.
 *
 * Regions are returned largest-first by area. The sketch's 3D placement is
 * forwarded to every returned region sketch.
 *
 * @example
 * // Frame shape — one ring-shaped region
 * const frame = rect(100, 60).subtract(rect(80, 40, true));
 * const [ring] = frame.regions(); // one region: the ring
 *
 * @example
 * // Two disconnected rectangles
 * const twoRects = union2d(rect(40, 40), rect(40, 40).translate(60, 0));
 * const [left, right] = twoRects.regions(); // largest first
 * left.extrude(5);
 * right.extrude(5);
 *
 * @example
 * // Donut — pick the ring via region(), then extrude just the ring
 * const donut = circle2d(50).subtract(circle2d(30));
 * const [ring] = donut.regions();
 * ring.extrude(10);
 */
export function sketchRegions(sketch: Sketch): Sketch[] {
  return extractRegionCandidates(sketch).map((r) => copySketchPlacement3D(sketch, r.sketch));
}

/**
 * Select the single filled region that contains the given 2D seed point.
 *
 * This lets you pick any enclosed area from a complex sketch using an
 * interior point rather than having to enumerate all regions first.
 * The seed point must lie strictly inside the filled area (not on a boundary
 * or inside a hole).
 *
 * Throws a descriptive error if the seed point is outside all regions.
 *
 * @param seed - A 2D point `[x, y]` inside the desired region.
 *
 * @example
 * // Donut — select the ring area with a point at radius 40
 * const donut = circle2d(50).subtract(circle2d(30));
 * donut.region([40, 0]).extrude(10);
 *
 * @example
 * // Two disconnected boxes — pick the right one
 * const pair = union2d(rect(40, 40), rect(40, 40).translate(60, 0));
 * pair.region([80, 20]).extrude(5); // seed is inside right box
 *
 * @example
 * // Frame — seed inside the frame wall area
 * const frame = rect(100, 60).subtract(rect(80, 40, true));
 * frame.region([2, 2]).extrude(3); // corner of the frame wall
 */
export function sketchRegion(sketch: Sketch, seed: [number, number]): Sketch {
  const candidates = extractRegionCandidates(sketch);

  if (candidates.length === 0) {
    throw new Error('sketch.region(): the sketch has no filled area');
  }

  for (const r of candidates) {
    if (!pointInPolygon(seed, r.outerPoints)) continue;
    // Confirm the seed is not inside a hole
    if (r.holePoints.some((h) => pointInPolygon(seed, h))) continue;
    return copySketchPlacement3D(sketch, r.sketch);
  }

  throw new Error(
    `sketch.region(): seed point [${seed[0]}, ${seed[1]}] is not inside any of the ` +
      `${candidates.length} filled region(s). The seed must lie strictly inside the filled area ` +
      '(not on a boundary edge or inside a hole).',
  );
}

// ─── Patch onto Sketch prototype ─────────────────────────────────────────────
// Implementations are registered here; stubs live in core.ts.
(Sketch.prototype as any).regions = function (this: Sketch): Sketch[] {
  return sketchRegions(this);
};
(Sketch.prototype as any).region = function (this: Sketch, seed: [number, number]): Sketch {
  return sketchRegion(this, seed);
};

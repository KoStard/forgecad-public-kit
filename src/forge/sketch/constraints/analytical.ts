/**
 * Analytical sub-solvers for common geometric patterns.
 *
 * Recognizes constraint patterns that have closed-form solutions and solves
 * them directly without LM iteration.  Called BEFORE the numerical solver to
 * reduce the numerical problem size.
 *
 * Supported patterns:
 *   1. Direct placement: fixed point, or hDistance+vDistance from a fixed point
 *   2. Circle-circle intersection: two distance constraints from two known points
 *   3. Line-circle intersection: distance + horizontal/vertical/pointOnLine
 *   4. Horizontal/vertical + distance from known point
 *   5. Coincident propagation: coincident with a known point
 */

import type {
  ConstraintDefinition,
  PointId,
  SketchConstraint,
  SketchPoint,
  SketchLine,
} from './types';

// ─── Types ──────────────────────────────────────────────────────────────────────

/** A point that has been analytically determined (coordinates are known). */
interface KnownPoint {
  id: PointId;
  x: number;
  y: number;
}

/** A construction step in the solve plan. */
export interface ConstructionStep {
  kind: 'direct' | 'circle-circle' | 'line-circle' | 'coincident';
  /** The point being placed. */
  target: PointId;
  /** Constraint IDs consumed by this step. */
  constraintIds: string[];
  /** Execute the step, placing the target point. Returns true if successful. */
  execute: () => boolean;
}

/** Result of analytical pre-solve. */
export interface AnalyticalResult {
  /** Points that were analytically determined. */
  solvedPoints: Set<PointId>;
  /** Constraints that were fully consumed by analytical steps. */
  consumedConstraints: Set<string>;
  /** The ordered construction steps that were executed. */
  steps: ConstructionStep[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Extract all entity IDs from a constraint (same logic as decompose.ts). */
function extractEntityIds(constraint: SketchConstraint): string[] {
  const ids: string[] = [];
  for (const [key, val] of Object.entries(constraint)) {
    if (key === 'id' || key === 'type') continue;
    if (typeof val === 'string') ids.push(val);
    else if (Array.isArray(val)) {
      for (const v of val) { if (typeof v === 'string') ids.push(v); }
    }
  }
  return ids;
}

/**
 * Intersect two circles.  Returns 0, 1, or 2 solutions.
 * Circle 1: center (x1,y1), radius r1
 * Circle 2: center (x2,y2), radius r2
 */
function circleCircleIntersect(
  x1: number, y1: number, r1: number,
  x2: number, y2: number, r2: number,
): [number, number][] {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const d = Math.hypot(dx, dy);

  if (d < 1e-12) return []; // concentric
  if (d > r1 + r2 + 1e-9) return []; // too far apart
  if (d < Math.abs(r1 - r2) - 1e-9) return []; // one inside the other

  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  const h = h2 > 0 ? Math.sqrt(h2) : 0;

  const mx = x1 + a * dx / d;
  const my = y1 + a * dy / d;

  if (h < 1e-12) {
    // Tangent — one solution
    return [[mx, my]];
  }

  const px = -dy / d * h;
  const py = dx / d * h;

  return [
    [mx + px, my + py],
    [mx - px, my - py],
  ];
}

/**
 * Intersect a line (defined by point + direction) with a circle.
 * Line: point (px,py) + t*(dx,dy) for all t
 * Circle: center (cx,cy), radius r
 */
function lineCircleIntersect(
  px: number, py: number, dx: number, dy: number,
  cx: number, cy: number, r: number,
): [number, number][] {
  const fx = px - cx;
  const fy = py - cy;
  const a = dx * dx + dy * dy;
  if (a < 1e-18) return [];
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;

  if (disc < -1e-9) return [];

  const sqrtDisc = disc > 0 ? Math.sqrt(disc) : 0;
  const t1 = (-b + sqrtDisc) / (2 * a);
  const t2 = (-b - sqrtDisc) / (2 * a);

  if (Math.abs(t1 - t2) < 1e-12) {
    return [[px + t1 * dx, py + t1 * dy]];
  }

  return [
    [px + t1 * dx, py + t1 * dy],
    [px + t2 * dx, py + t2 * dy],
  ];
}

/** Pick the solution closest to a reference point. */
function pickClosest(solutions: [number, number][], refX: number, refY: number): [number, number] | null {
  if (solutions.length === 0) return null;
  if (solutions.length === 1) return solutions[0];

  let best = solutions[0];
  let bestDist = Math.hypot(best[0] - refX, best[1] - refY);
  for (let i = 1; i < solutions.length; i++) {
    const d = Math.hypot(solutions[i][0] - refX, solutions[i][1] - refY);
    if (d < bestDist) {
      bestDist = d;
      best = solutions[i];
    }
  }
  return best;
}

// ─── Constraint Index ───────────────────────────────────────────────────────────

/**
 * Index structure for fast lookup of constraints by type and entity.
 */
interface ConstraintIndex {
  /** All constraints grouped by type. */
  byType: Map<string, SketchConstraint[]>;
  /** Constraints referencing a given point ID. */
  byPoint: Map<PointId, SketchConstraint[]>;
  /** Map from line ID to its SketchLine definition. */
  lineMap: Map<string, SketchLine>;
  /** Map from point ID to its SketchPoint. */
  pointMap: Map<PointId, SketchPoint>;
}

function buildIndex(def: ConstraintDefinition): ConstraintIndex {
  const byType = new Map<string, SketchConstraint[]>();
  const byPoint = new Map<PointId, SketchConstraint[]>();
  const lineMap = new Map(def.lines.map(l => [l.id, l]));
  const pointMap = new Map(def.points.map(p => [p.id, p]));

  for (const c of def.constraints) {
    const arr = byType.get(c.type) ?? [];
    arr.push(c);
    byType.set(c.type, arr);

    // Index by referenced point IDs (expand lines to their endpoints).
    const entityIds = extractEntityIds(c);
    const pointIds = new Set<PointId>();
    for (const id of entityIds) {
      if (pointMap.has(id)) {
        pointIds.add(id);
      }
      const line = lineMap.get(id);
      if (line) {
        pointIds.add(line.a);
        pointIds.add(line.b);
      }
    }
    for (const pid of pointIds) {
      const arr2 = byPoint.get(pid) ?? [];
      arr2.push(c);
      byPoint.set(pid, arr2);
    }
  }

  return { byType, byPoint, lineMap, pointMap };
}

// ─── Pattern Matchers ───────────────────────────────────────────────────────────

/**
 * Try to find a direct-placement pattern for a free point:
 *   - hDistance from a known point (determines x)
 *   - vDistance from a known point (determines y)
 */
function tryDirectPlacement(
  pointId: PointId,
  point: SketchPoint,
  index: ConstraintIndex,
  known: Map<PointId, KnownPoint>,
): ConstructionStep | null {
  const constraints = index.byPoint.get(pointId) ?? [];

  let xConstraint: SketchConstraint | null = null;
  let yConstraint: SketchConstraint | null = null;
  let resolvedX: number | null = null;
  let resolvedY: number | null = null;

  for (const c of constraints) {
    const data = c as any;

    if (c.type === 'hDistance') {
      // b.x - a.x = value
      const other = data.a === pointId ? data.b : data.a;
      const knownOther = known.get(other);
      if (!knownOther) continue;
      if (data.a === pointId) {
        // hDistance: b.x - a.x = value. Since data.a === pointId, other is data.b (known).
        // Solving for a.x: a.x = b.x - value
        resolvedX = knownOther.x - data.value;
      } else {
        // pointId is 'b': b.x - a.x = value → b.x = a.x + value
        resolvedX = knownOther.x + data.value;
      }
      xConstraint = c;
    } else if (c.type === 'vDistance') {
      const other = data.a === pointId ? data.b : data.a;
      const knownOther = known.get(other);
      if (!knownOther) continue;
      if (data.a === pointId) {
        resolvedY = knownOther.y - data.value;
      } else {
        resolvedY = knownOther.y + data.value;
      }
      yConstraint = c;
    }
  }

  if (resolvedX !== null && resolvedY !== null && xConstraint && yConstraint) {
    return {
      kind: 'direct',
      target: pointId,
      constraintIds: [xConstraint.id, yConstraint.id],
      execute: () => {
        point.x = resolvedX!;
        point.y = resolvedY!;
        return true;
      },
    };
  }

  return null;
}

/**
 * Try to find a coincident-propagation pattern:
 *   - Point is coincident with a known point
 */
function tryCoincidentPropagation(
  pointId: PointId,
  point: SketchPoint,
  index: ConstraintIndex,
  known: Map<PointId, KnownPoint>,
): ConstructionStep | null {
  const constraints = index.byPoint.get(pointId) ?? [];

  for (const c of constraints) {
    if (c.type !== 'coincident') continue;
    const data = c as any;
    const other = data.a === pointId ? data.b : data.a;
    const knownOther = known.get(other);
    if (!knownOther) continue;

    return {
      kind: 'coincident',
      target: pointId,
      constraintIds: [c.id],
      execute: () => {
        point.x = knownOther.x;
        point.y = knownOther.y;
        return true;
      },
    };
  }

  return null;
}

/**
 * Try to find a circle-circle intersection pattern:
 *   - Two distance constraints from two different known points
 */
function tryCircleCircleIntersection(
  pointId: PointId,
  point: SketchPoint,
  index: ConstraintIndex,
  known: Map<PointId, KnownPoint>,
): ConstructionStep | null {
  const constraints = index.byPoint.get(pointId) ?? [];

  // Collect distance constraints to known points.
  const distConstraints: Array<{ constraint: SketchConstraint; knownPoint: KnownPoint; radius: number }> = [];

  for (const c of constraints) {
    if (c.type !== 'distance') continue;
    const data = c as any;
    const other = data.a === pointId ? data.b : data.a;
    const knownOther = known.get(other);
    if (!knownOther) continue;
    distConstraints.push({ constraint: c, knownPoint: knownOther, radius: data.value });
  }

  if (distConstraints.length < 2) return null;

  // Use first two distance constraints.
  const d1 = distConstraints[0];
  const d2 = distConstraints[1];

  return {
    kind: 'circle-circle',
    target: pointId,
    constraintIds: [d1.constraint.id, d2.constraint.id],
    execute: () => {
      const solutions = circleCircleIntersect(
        d1.knownPoint.x, d1.knownPoint.y, d1.radius,
        d2.knownPoint.x, d2.knownPoint.y, d2.radius,
      );
      const result = pickClosest(solutions, point.x, point.y);
      if (!result) return false;
      point.x = result[0];
      point.y = result[1];
      return true;
    },
  };
}

/**
 * Try to find a line-circle intersection pattern:
 *   - One distance from a known point (circle)
 *   - Plus one of: horizontal constraint on a line through this point,
 *     vertical constraint, or pointOnLine
 */
function tryLineCircleIntersection(
  pointId: PointId,
  point: SketchPoint,
  index: ConstraintIndex,
  known: Map<PointId, KnownPoint>,
): ConstructionStep | null {
  const constraints = index.byPoint.get(pointId) ?? [];

  // Find a distance constraint to a known point.
  let distConstraint: SketchConstraint | null = null;
  let distKnown: KnownPoint | null = null;
  let distValue = 0;

  for (const c of constraints) {
    if (c.type !== 'distance') continue;
    const data = c as any;
    const other = data.a === pointId ? data.b : data.a;
    const knownOther = known.get(other);
    if (!knownOther) continue;
    distConstraint = c;
    distKnown = knownOther;
    distValue = data.value;
    break;
  }

  if (!distConstraint || !distKnown) return null;

  // Find a line constraint that defines a line through this point.
  for (const c of constraints) {
    const data = c as any;

    if (c.type === 'horizontal') {
      // Line is horizontal → dy = 0. Need to find the line and the other endpoint.
      const line = index.lineMap.get(data.line);
      if (!line) continue;
      const otherPtId = line.a === pointId ? line.b : line.a;
      const otherKnown = known.get(otherPtId);
      if (!otherKnown) continue;

      // Horizontal line through otherKnown.y
      const lineY = otherKnown.y;
      return {
        kind: 'line-circle',
        target: pointId,
        constraintIds: [distConstraint.id, c.id],
        execute: () => {
          const solutions = lineCircleIntersect(
            0, lineY, 1, 0, // horizontal line at y=lineY
            distKnown!.x, distKnown!.y, distValue,
          );
          const result = pickClosest(solutions, point.x, point.y);
          if (!result) return false;
          point.x = result[0];
          point.y = result[1];
          return true;
        },
      };
    }

    if (c.type === 'vertical') {
      const line = index.lineMap.get(data.line);
      if (!line) continue;
      const otherPtId = line.a === pointId ? line.b : line.a;
      const otherKnown = known.get(otherPtId);
      if (!otherKnown) continue;

      const lineX = otherKnown.x;
      return {
        kind: 'line-circle',
        target: pointId,
        constraintIds: [distConstraint.id, c.id],
        execute: () => {
          const solutions = lineCircleIntersect(
            lineX, 0, 0, 1, // vertical line at x=lineX
            distKnown!.x, distKnown!.y, distValue,
          );
          const result = pickClosest(solutions, point.x, point.y);
          if (!result) return false;
          point.x = result[0];
          point.y = result[1];
          return true;
        },
      };
    }

    if (c.type === 'pointOnLine') {
      if (data.point !== pointId) continue;
      const line = index.lineMap.get(data.line);
      if (!line) continue;
      const la = known.get(line.a);
      const lb = known.get(line.b);
      if (!la || !lb) continue;

      return {
        kind: 'line-circle',
        target: pointId,
        constraintIds: [distConstraint.id, c.id],
        execute: () => {
          const dx = lb!.x - la!.x;
          const dy = lb!.y - la!.y;
          const solutions = lineCircleIntersect(
            la!.x, la!.y, dx, dy,
            distKnown!.x, distKnown!.y, distValue,
          );
          const result = pickClosest(solutions, point.x, point.y);
          if (!result) return false;
          point.x = result[0];
          point.y = result[1];
          return true;
        },
      };
    }
  }

  // Check for horizontal/vertical + distance from a known point (1 DOF each)
  // where the horizontal/vertical constraint is on a line containing this point
  // and the OTHER endpoint of that line is also known.
  // This is a variant: distance from known + the other endpoint known + H/V
  // Already handled above.

  return null;
}

/**
 * Try hDistance + distance (determines y via circle intersection with horizontal band).
 */
function tryHDistancePlusDistance(
  pointId: PointId,
  point: SketchPoint,
  index: ConstraintIndex,
  known: Map<PointId, KnownPoint>,
): ConstructionStep | null {
  const constraints = index.byPoint.get(pointId) ?? [];

  let hDistC: SketchConstraint | null = null;
  let hDistKnown: KnownPoint | null = null;
  let resolvedX: number | null = null;

  let distC: SketchConstraint | null = null;
  let distKnown: KnownPoint | null = null;
  let distValue = 0;

  for (const c of constraints) {
    const data = c as any;
    if (c.type === 'hDistance') {
      const other = data.a === pointId ? data.b : data.a;
      const ko = known.get(other);
      if (!ko) continue;
      hDistC = c;
      hDistKnown = ko;
      resolvedX = data.a === pointId ? ko.x - data.value : ko.x + data.value;
    } else if (c.type === 'distance') {
      const other = data.a === pointId ? data.b : data.a;
      const ko = known.get(other);
      if (!ko) continue;
      distC = c;
      distKnown = ko;
      distValue = data.value;
    }
  }

  if (hDistC && resolvedX !== null && distC && distKnown) {
    // x is known. Distance from distKnown: (x-cx)^2 + (y-cy)^2 = d^2
    // y^2 - 2*cy*y + (cy^2 + (x-cx)^2 - d^2) = 0
    return {
      kind: 'line-circle',
      target: pointId,
      constraintIds: [hDistC.id, distC.id],
      execute: () => {
        const x = resolvedX!;
        const cx = distKnown!.x;
        const cy = distKnown!.y;
        const d = distValue;
        const dxSq = (x - cx) * (x - cx);
        const disc = d * d - dxSq;
        if (disc < -1e-9) return false;
        const sqrtDisc = disc > 0 ? Math.sqrt(disc) : 0;
        const y1 = cy + sqrtDisc;
        const y2 = cy - sqrtDisc;
        const solutions: [number, number][] = [[x, y1], [x, y2]];
        const result = pickClosest(solutions, point.x, point.y);
        if (!result) return false;
        point.x = result[0];
        point.y = result[1];
        return true;
      },
    };
  }

  return null;
}

/**
 * Try vDistance + distance (determines x via circle intersection with vertical band).
 */
function tryVDistancePlusDistance(
  pointId: PointId,
  point: SketchPoint,
  index: ConstraintIndex,
  known: Map<PointId, KnownPoint>,
): ConstructionStep | null {
  const constraints = index.byPoint.get(pointId) ?? [];

  let vDistC: SketchConstraint | null = null;
  let resolvedY: number | null = null;

  let distC: SketchConstraint | null = null;
  let distKnown: KnownPoint | null = null;
  let distValue = 0;

  for (const c of constraints) {
    const data = c as any;
    if (c.type === 'vDistance') {
      const other = data.a === pointId ? data.b : data.a;
      const ko = known.get(other);
      if (!ko) continue;
      vDistC = c;
      resolvedY = data.a === pointId ? ko.y - data.value : ko.y + data.value;
    } else if (c.type === 'distance') {
      const other = data.a === pointId ? data.b : data.a;
      const ko = known.get(other);
      if (!ko) continue;
      distC = c;
      distKnown = ko;
      distValue = data.value;
    }
  }

  if (vDistC && resolvedY !== null && distC && distKnown) {
    return {
      kind: 'line-circle',
      target: pointId,
      constraintIds: [vDistC.id, distC.id],
      execute: () => {
        const y = resolvedY!;
        const cx = distKnown!.x;
        const cy = distKnown!.y;
        const d = distValue;
        const dySq = (y - cy) * (y - cy);
        const disc = d * d - dySq;
        if (disc < -1e-9) return false;
        const sqrtDisc = disc > 0 ? Math.sqrt(disc) : 0;
        const x1 = cx + sqrtDisc;
        const x2 = cx - sqrtDisc;
        const solutions: [number, number][] = [[x1, y], [x2, y]];
        const result = pickClosest(solutions, point.x, point.y);
        if (!result) return false;
        point.x = result[0];
        point.y = result[1];
        return true;
      },
    };
  }

  return null;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────────

/**
 * Run analytical pre-solve on a constraint definition.
 *
 * Identifies points that can be placed via closed-form geometry and places
 * them directly.  Points placed this way are marked as fixed for the
 * remainder of the solve so the numerical solver sees a smaller system.
 *
 * IMPORTANT: This function mutates `def` in place (point coordinates and
 * fixed flags).  The caller should clone first if needed.
 */
export function analyticalPreSolve(def: ConstraintDefinition): AnalyticalResult {
  const result: AnalyticalResult = {
    solvedPoints: new Set(),
    consumedConstraints: new Set(),
    steps: [],
  };

  const index = buildIndex(def);

  // Seed: all fixed points are known.
  const known = new Map<PointId, KnownPoint>();
  for (const p of def.points) {
    if (p.fixed) {
      known.set(p.id, { id: p.id, x: p.x, y: p.y });
    }
  }

  // Iterative forward propagation: keep trying to determine unknown points.
  let progress = true;
  while (progress) {
    progress = false;

    for (const p of def.points) {
      if (known.has(p.id)) continue;

      // Try each pattern in priority order.
      const step =
        tryCoincidentPropagation(p.id, p, index, known) ??
        tryDirectPlacement(p.id, p, index, known) ??
        tryCircleCircleIntersection(p.id, p, index, known) ??
        tryLineCircleIntersection(p.id, p, index, known) ??
        tryHDistancePlusDistance(p.id, p, index, known) ??
        tryVDistancePlusDistance(p.id, p, index, known);

      if (step && step.execute()) {
        known.set(p.id, { id: p.id, x: p.x, y: p.y });
        result.solvedPoints.add(p.id);
        for (const cid of step.constraintIds) {
          result.consumedConstraints.add(cid);
        }
        result.steps.push(step);
        progress = true;
      }
    }
  }

  // Mark analytically solved points as fixed for the numerical solver.
  // This reduces the numerical problem size.
  for (const p of def.points) {
    if (result.solvedPoints.has(p.id)) {
      p.fixed = true;
    }
  }

  return result;
}

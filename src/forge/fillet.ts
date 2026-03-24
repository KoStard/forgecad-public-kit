/**
 * ForgeCAD — Backend-Agnostic Fillet & Chamfer API
 *
 * High-level fillet() and chamfer() functions that accept geometric edge queries
 * and build compile plan nodes. The actual fillet/chamfer is applied at lowering
 * time by each backend (OCCT native or Manifold CSG).
 *
 * Supports:
 * - Single edge or multiple edges in one call
 * - Inline edge queries (no separate selectEdges step needed)
 * - Curved edges (OCCT backend handles natively; Manifold per-segment)
 * - Both convex and concave edges
 */

import type { ShapeCompilePlan } from './compilePlan';
import { type EdgeQuery, selectEdges } from './query/edgeQuery';
import { buildShapeFromCompilePlan, getShapeCompilePlan, Shape } from './kernel';
import type { EdgeSegment } from './mesh/meshEdgeExtraction';
import type { EdgeFeatureTarget } from './shapeBackend';
import { TrackedShape } from './sketch/topology';

// ─── Types ──────────────────────────────────────────────────────────────────────

/**
 * Edge selector: what to fillet.
 * - EdgeSegment: a single edge from selectEdge()
 * - EdgeSegment[]: multiple edges from selectEdges()
 * - EdgeQuery: inline query (same options as selectEdges)
 * - undefined: all sharp edges on the shape
 */
export type EdgeSelector = EdgeSegment | EdgeSegment[] | EdgeQuery;

// ─── Internals ──────────────────────────────────────────────────────────────────

type ShapeArg = Shape | TrackedShape;

function unwrapShape(value: ShapeArg): Shape {
  return value instanceof TrackedShape ? value.toShape() : value;
}

function resolveEdges(shape: Shape, edges?: EdgeSelector): EdgeSegment[] {
  if (!edges) {
    return selectEdges(shape);
  }
  if (Array.isArray(edges)) {
    return edges;
  }
  if (isEdgeSegment(edges)) {
    return [edges];
  }
  return selectEdges(shape, edges);
}

function isEdgeSegment(value: unknown): value is EdgeSegment {
  return (
    typeof value === 'object' &&
    value !== null &&
    'start' in value &&
    'end' in value &&
    'midpoint' in value &&
    'direction' in value &&
    'dihedralAngle' in value &&
    'normalA' in value &&
    'normalB' in value
  );
}

/** Convert EdgeSegments to backend-agnostic EdgeFeatureTargets for the compile plan. */
function edgesToTargets(edges: EdgeSegment[]): EdgeFeatureTarget[] {
  return edges.map((e) => ({
    midpoint: [e.midpoint[0], e.midpoint[1], e.midpoint[2]] as [number, number, number],
    start: [e.start[0], e.start[1], e.start[2]] as [number, number, number],
    end: [e.end[0], e.end[1], e.end[2]] as [number, number, number],
    convex: e.convex,
  }));
}

// ─── Public API ─────────────────────────────────────────────────────────────────

/**
 * Apply fillets (rounded edges) to one or more edges of a shape.
 *
 * Works on both straight and curved edges. Supports OCCT and Manifold backends.
 * When using OCCT, all edges are filleted in a single kernel operation for
 * best quality. When using Manifold, edges are filleted sequentially.
 *
 * @param shape - The solid to modify
 * @param radius - Fillet radius
 * @param edges - Which edges to fillet:
 *   - EdgeSegment: a single edge from selectEdge()
 *   - EdgeSegment[]: multiple edges from selectEdges()
 *   - EdgeQuery: inline query (same options as selectEdges)
 *   - undefined: all sharp edges on the shape
 * @param segments - Arc resolution for Manifold backend (default: 16)
 *
 * @example
 * // Fillet all edges
 * fillet(myShape, 2)
 *
 * // Fillet edges at the top
 * fillet(myShape, 1.5, { atZ: 20, convex: true })
 *
 * // Fillet specific edges
 * const edges = selectEdges(myShape, { parallel: [0, 0, 1] })
 * fillet(myShape, 3, edges)
 */
export function fillet(shape: ShapeArg, radius: number, edges?: EdgeSelector, segments = 16): Shape {
  if (!Number.isFinite(radius) || !(radius > 0)) {
    throw new Error('fillet() requires a positive finite radius.');
  }

  const target = unwrapShape(shape);
  const resolvedEdges = resolveEdges(target, edges);

  if (resolvedEdges.length === 0) {
    throw new Error('fillet(): no edges match the given selection.');
  }

  const basePlan = getShapeCompilePlan(target);
  const plan: ShapeCompilePlan = {
    kind: 'filletEdges',
    base: basePlan,
    radius,
    segments: Math.max(2, Math.round(segments)),
    edgeTargets: edgesToTargets(resolvedEdges),
  };

  return buildShapeFromCompilePlan(plan, target.colorHex, {
    sources: ['fillet'],
  });
}

/**
 * Apply chamfers (beveled edges) to one or more edges of a shape.
 *
 * Works on both straight and curved edges. Supports OCCT and Manifold backends.
 *
 * @param shape - The solid to modify
 * @param size - Chamfer size (distance from edge)
 * @param edges - Which edges to chamfer (same options as fillet)
 *
 * @example
 * // Chamfer all edges
 * chamfer(myShape, 1)
 *
 * // Chamfer vertical edges only
 * chamfer(myShape, 2, { parallel: [0, 0, 1] })
 */
export function chamfer(shape: ShapeArg, size: number, edges?: EdgeSelector): Shape {
  if (!Number.isFinite(size) || !(size > 0)) {
    throw new Error('chamfer() requires a positive finite size.');
  }

  const target = unwrapShape(shape);
  const resolvedEdges = resolveEdges(target, edges);

  if (resolvedEdges.length === 0) {
    throw new Error('chamfer(): no edges match the given selection.');
  }

  const basePlan = getShapeCompilePlan(target);
  const plan: ShapeCompilePlan = {
    kind: 'chamferEdges',
    base: basePlan,
    size,
    edgeTargets: edgesToTargets(resolvedEdges),
  };

  return buildShapeFromCompilePlan(plan, target.colorHex, {
    sources: ['chamfer'],
  });
}

/**
 * Apply a draft angle (taper) to all faces of a solid for mold extraction.
 *
 * Draft angle is a manufacturing feature that adds taper to the vertical faces
 * of a solid so that it can be extracted from a mold. The neutral plane is where
 * the draft angle is zero — faces above and below are tapered symmetrically.
 *
 * Requires the OCCT backend. Throws on Manifold.
 *
 * @param shape - The solid to modify
 * @param angleDeg - Draft angle in degrees (typically 1-5 for injection molding)
 * @param pullDirection - Mold pull direction, default [0, 0, 1] (Z-up)
 * @param neutralPlaneOffset - Z-offset of the neutral plane (default: 0)
 *
 * @example
 * // Add 3° draft to a box for injection molding
 * draft(myBox, 3)
 *
 * // Draft with custom pull direction and neutral plane
 * draft(myShape, 2, [0, 0, 1], 10)
 */
export function draft(
  shape: ShapeArg,
  angleDeg: number,
  pullDirection: [number, number, number] = [0, 0, 1],
  neutralPlaneOffset: number = 0,
): Shape {
  if (!Number.isFinite(angleDeg) || angleDeg === 0) {
    throw new Error('draft() requires a non-zero finite angle in degrees.');
  }
  if (!Number.isFinite(neutralPlaneOffset)) {
    throw new Error('draft() requires a finite neutralPlaneOffset.');
  }
  const len = Math.hypot(pullDirection[0], pullDirection[1], pullDirection[2]);
  if (len < 1e-12) {
    throw new Error('draft() requires a non-zero pullDirection vector.');
  }

  const target = unwrapShape(shape);
  const basePlan = getShapeCompilePlan(target);
  const plan: ShapeCompilePlan = {
    kind: 'draft',
    base: basePlan,
    angleDeg,
    pullDirection: [...pullDirection] as [number, number, number],
    neutralPlaneOffset,
  };

  return buildShapeFromCompilePlan(plan, target.colorHex, {
    sources: ['draft'],
  });
}

/**
 * Uniformly offset all surfaces of a solid inward or outward by a thickness value.
 *
 * Unlike shell(), which hollows a solid, offsetSolid() produces a new solid
 * whose surfaces are all shifted by the given thickness. Positive = outward,
 * negative = inward.
 *
 * Requires the OCCT backend. Throws on Manifold.
 *
 * @param shape - The solid to offset
 * @param thickness - Offset distance (positive = outward, negative = inward)
 *
 * @example
 * // Grow a box outward by 1mm on all sides
 * offsetSolid(myBox, 1)
 *
 * // Shrink a shape inward by 0.5mm
 * offsetSolid(myShape, -0.5)
 */
export function offsetSolid(shape: ShapeArg, thickness: number): Shape {
  if (!Number.isFinite(thickness) || thickness === 0) {
    throw new Error('offsetSolid() requires a non-zero finite thickness.');
  }

  const target = unwrapShape(shape);
  const basePlan = getShapeCompilePlan(target);
  const plan: ShapeCompilePlan = {
    kind: 'offsetSolid',
    base: basePlan,
    thickness,
  };

  return buildShapeFromCompilePlan(plan, target.colorHex, {
    sources: ['offsetSolid'],
  });
}

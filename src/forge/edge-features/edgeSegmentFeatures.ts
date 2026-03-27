/**
 * ForgeCAD — Edge Segment Features
 *
 * Apply fillet / chamfer operations to edges selected via the geometric
 * edge query API (selectEdge / selectEdges). Bypasses the TrackedShape
 * topology system and works directly with mesh-extracted EdgeSegments.
 */

import { requireManifoldShapeBackend, wrapManifoldShapeBackend } from '../backends/manifold';
import {
  applyChamferSelectionToManifold,
  applyConcaveChamferSelectionToManifold,
  applyConcaveFilletSelectionToManifold,
  applyFilletSelectionToManifold,
} from '../backends/manifold/edgeFeatureRuntime';
import { isOCCTShapeBackend } from '../backends/occt/shapeBackend';
import type { ResolvedEdgeFeatureSelection } from './edgeFeatureModel';
import {
  getShapeCompilePlan,
  getShapeDimensions,
  getShapeGeometryInfo,
  getShapePlacementReferences,
  getShapeRuntimeBackend,
  getWasm,
  Shape,
  setShapeCompilePlan,
  setShapeDimensions,
  setShapeGeometryInfo,
  setShapePlacementReferences,
} from '../kernel';
import type { EdgeSegment } from '../mesh/meshEdgeExtraction';
import type { ShapeBackend } from '../shapeBackend';
import { TrackedShape } from '../sketch/topology';
import type { Vec3 } from '../transform';

type ShapeArg = Shape | TrackedShape;

function unwrapShape(value: ShapeArg): Shape {
  return value instanceof TrackedShape ? value.toShape() : value;
}

/**
 * Convert an EdgeSegment (from mesh extraction) into a ResolvedEdgeFeatureSelection
 * that the fillet/chamfer runtime can consume.
 *
 * The key challenge: computing basisX, basisY, and quadrant from the two adjacent
 * face normals. The basis vectors define the plane perpendicular to the edge, and
 * the quadrant tells which corner to remove.
 */
function edgeSegmentToSelection(segment: EdgeSegment): ResolvedEdgeFeatureSelection {
  const { start, end, direction: axis, normalA, normalB, convex } = segment;

  // Project normalA onto the plane perpendicular to axis
  const dotA = normalA[0] * axis[0] + normalA[1] * axis[1] + normalA[2] * axis[2];
  let bx = normalA[0] - dotA * axis[0];
  let by = normalA[1] - dotA * axis[1];
  let bz = normalA[2] - dotA * axis[2];
  let bLen = Math.sqrt(bx * bx + by * by + bz * bz);

  if (bLen < 1e-10) {
    // normalA is parallel to edge axis — fall back to normalB
    const dotB = normalB[0] * axis[0] + normalB[1] * axis[1] + normalB[2] * axis[2];
    bx = normalB[0] - dotB * axis[0];
    by = normalB[1] - dotB * axis[1];
    bz = normalB[2] - dotB * axis[2];
    bLen = Math.sqrt(bx * bx + by * by + bz * bz);
  }

  if (bLen < 1e-10) {
    throw new Error('Cannot compute fillet basis: edge normals are degenerate.');
  }

  bx /= bLen;
  by /= bLen;
  bz /= bLen;
  const basisX: Vec3 = [bx, by, bz];

  // basisY = axis × basisX
  const basisY: Vec3 = [axis[1] * bz - axis[2] * by, axis[2] * bx - axis[0] * bz, axis[0] * by - axis[1] * bx];

  // --- Compute surface directions in the (basisX, basisY) cross-section plane ---

  // Project both normals into the 2D cross-section plane
  const nAx = normalA[0] * basisX[0] + normalA[1] * basisX[1] + normalA[2] * basisX[2];
  const nAy = normalA[0] * basisY[0] + normalA[1] * basisY[1] + normalA[2] * basisY[2];
  const nBx = normalB[0] * basisX[0] + normalB[1] * basisX[1] + normalB[2] * basisX[2];
  const nBy = normalB[0] * basisY[0] + normalB[1] * basisY[1] + normalB[2] * basisY[2];

  // Average outward normal in 2D — points away from material
  const avgX = nAx + nBx;
  const avgY = nAy + nBy;

  // For each normal, compute the perpendicular that points toward the sharp feature:
  //   - Convex: into material (negative dot with avg outward normal)
  //   - Concave: into groove/air (positive dot with avg outward normal)
  // In both cases, the resulting directions define the wedge that the fillet replaces.
  function pickSurfaceDir(nx: number, ny: number): [number, number] {
    // Two perpendiculars of (nx, ny): (-ny, nx) and (ny, -nx)
    const perpAx = -ny,
      perpAy = nx;
    const perpBx = ny,
      perpBy = -nx;
    const dotA2 = perpAx * avgX + perpAy * avgY;
    const dotB2 = perpBx * avgX + perpBy * avgY;
    // For convex: pick negative dot. For concave: pick positive dot.
    if (convex) {
      return dotA2 < dotB2 ? [perpAx, perpAy] : [perpBx, perpBy];
    } else {
      return dotA2 > dotB2 ? [perpAx, perpAy] : [perpBx, perpBy];
    }
  }

  const surfaceDirA = pickSurfaceDir(nAx, nAy);
  const surfaceDirB = pickSurfaceDir(nBx, nBy);

  // Legacy quadrant (for backward compat with tracked-edge path)
  const projX = avgX;
  const projY = avgY;
  const sign = convex ? -1 : 1;
  const quadrant: [number, number] = [projX >= 0 ? sign : -sign, projY >= 0 ? sign : -sign];

  return {
    kind: 'line-segment',
    edgeName: `mesh-edge-${segment.index}`,
    start: [start[0], start[1], start[2]],
    end: [end[0], end[1], end[2]],
    midpoint: [(start[0] + end[0]) * 0.5, (start[1] + end[1]) * 0.5, (start[2] + end[2]) * 0.5],
    axis: [axis[0], axis[1], axis[2]],
    basisX,
    basisY,
    quadrant,
    dihedralAngleDeg: segment.dihedralAngle,
    surfaceDirA,
    surfaceDirB,
    isConvex: convex,
  };
}

function buildResult(target: Shape, backend: ShapeBackend, source: string): Shape {
  const targetInfo = getShapeGeometryInfo(target);
  const result = new Shape(backend, target.colorHex);
  setShapeDimensions(result, getShapeDimensions(target));
  setShapePlacementReferences(result, getShapePlacementReferences(target), { merge: false });
  setShapeGeometryInfo(result, {
    backend: targetInfo.backend,
    representation: targetInfo.representation,
    fidelity: isOCCTShapeBackend(backend) ? 'kernel-native' : 'deformed',
    topology: 'none',
    sources: [source as any, ...targetInfo.sources],
  });
  setShapeCompilePlan(result, getShapeCompilePlan(target));
  return result;
}

/**
 * Apply a fillet (rounded edge) to a mesh-selected edge.
 *
 * Works on any straight edge of any shape — not limited to tracked box edges.
 * The edge must have been obtained from selectEdge() / selectEdges().
 *
 * @param shape - The solid to modify
 * @param segment - Edge segment from selectEdge() / selectEdges()
 * @param radius - Fillet radius
 * @param segments - Number of arc segments (default: 16)
 */
export function filletEdgeSegment(shape: ShapeArg, segment: EdgeSegment, radius: number, segments = 16): Shape {
  if (!Number.isFinite(radius) || !(radius > 0)) {
    throw new Error('filletEdgeSegment() requires a positive finite radius.');
  }
  if (!Number.isFinite(segments) || segments < 2) {
    throw new Error('filletEdgeSegment() requires at least 2 segments.');
  }
  if (segment.length < 1e-6) {
    throw new Error('filletEdgeSegment(): edge is too short to fillet.');
  }

  const target = unwrapShape(shape);
  const backend = getShapeRuntimeBackend(target);

  if (isOCCTShapeBackend(backend)) {
    const edgeTarget = {
      midpoint: segment.midpoint as [number, number, number],
      start: segment.start as [number, number, number],
      end: segment.end as [number, number, number],
      convex: segment.convex,
    };
    const result = backend.filletEdgeByMidpoint(edgeTarget, radius);
    return buildResult(target, result, 'fillet');
  }

  const manifold = requireManifoldShapeBackend(backend, 'filletEdgeSegment()');
  const wasm = getWasm();
  const selection = edgeSegmentToSelection(segment);
  const apply = segment.convex ? applyFilletSelectionToManifold : applyConcaveFilletSelectionToManifold;
  const manifoldResult = apply(manifold, selection, radius, Math.round(segments), wasm);
  return buildResult(target, wrapManifoldShapeBackend(manifoldResult), 'fillet');
}

/**
 * Apply a chamfer (beveled edge) to a mesh-selected edge.
 *
 * Works on any straight edge of any shape — not limited to tracked box edges.
 *
 * @param shape - The solid to modify
 * @param segment - Edge segment from selectEdge() / selectEdges()
 * @param size - Chamfer size (distance from edge)
 */
export function chamferEdgeSegment(shape: ShapeArg, segment: EdgeSegment, size: number): Shape {
  if (!Number.isFinite(size) || !(size > 0)) {
    throw new Error('chamferEdgeSegment() requires a positive finite size.');
  }
  if (segment.length < 1e-6) {
    throw new Error('chamferEdgeSegment(): edge is too short to chamfer.');
  }

  const target = unwrapShape(shape);
  const backend = getShapeRuntimeBackend(target);

  if (isOCCTShapeBackend(backend)) {
    const edgeTarget = {
      midpoint: segment.midpoint as [number, number, number],
      start: segment.start as [number, number, number],
      end: segment.end as [number, number, number],
      convex: segment.convex,
    };
    const result = backend.chamferEdgeByMidpoint(edgeTarget, size);
    return buildResult(target, result, 'chamfer');
  }

  const manifold = requireManifoldShapeBackend(backend, 'chamferEdgeSegment()');
  const wasm = getWasm();
  const selection = edgeSegmentToSelection(segment);
  const apply = segment.convex ? applyChamferSelectionToManifold : applyConcaveChamferSelectionToManifold;
  const manifoldResult = apply(manifold, selection, size, wasm);
  return buildResult(target, wrapManifoldShapeBackend(manifoldResult), 'chamfer');
}

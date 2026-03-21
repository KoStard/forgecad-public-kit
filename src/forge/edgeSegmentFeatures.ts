/**
 * ForgeCAD — Edge Segment Features
 *
 * Apply fillet / chamfer operations to edges selected via the geometric
 * edge query API (selectEdge / selectEdges). Bypasses the TrackedShape
 * topology system and works directly with mesh-extracted EdgeSegments.
 */

import {
  Shape,
  getWasm,
  getShapeGeometryInfo,
  setShapeGeometryInfo,
  getShapeDimensions,
  setShapeDimensions,
  getShapePlacementReferences,
  setShapePlacementReferences,
  getShapeRuntimeBackend,
} from './kernel';
import { requireManifoldShapeBackend, wrapManifoldShapeBackend } from './shapeBackend';
import { TrackedShape } from './sketch/topology';
import type { EdgeSegment } from './meshEdgeExtraction';
import type { ResolvedEdgeFeatureSelection } from './edgeFeatureModel';
import type { Vec3 } from './transform';
import { applyFilletSelectionToManifold, applyChamferSelectionToManifold } from './edgeFeatureRuntime';

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
  const { start, end, direction: axis, normalA, normalB } = segment;

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

  bx /= bLen; by /= bLen; bz /= bLen;
  const basisX: Vec3 = [bx, by, bz];

  // basisY = axis × basisX
  const basisY: Vec3 = [
    axis[1] * bz - axis[2] * by,
    axis[2] * bx - axis[0] * bz,
    axis[0] * by - axis[1] * bx,
  ];

  // Quadrant: for a convex edge, the material is on the OPPOSITE side of both normals.
  // Project the average outward normal (nA + nB) onto basisX and basisY.
  // The material is in the direction opposite to the outward normal.
  const avgNx = normalA[0] + normalB[0];
  const avgNy = normalA[1] + normalB[1];
  const avgNz = normalA[2] + normalB[2];

  const projX = avgNx * basisX[0] + avgNy * basisX[1] + avgNz * basisX[2];
  const projY = avgNx * basisY[0] + avgNy * basisY[1] + avgNz * basisY[2];

  // Material is opposite the outward normal direction
  const quadrant: [number, number] = [
    projX >= 0 ? -1 : 1,
    projY >= 0 ? -1 : 1,
  ];

  return {
    kind: 'line-segment',
    edgeName: `mesh-edge-${segment.index}`,
    start: [start[0], start[1], start[2]],
    end: [end[0], end[1], end[2]],
    midpoint: [
      (start[0] + end[0]) * 0.5,
      (start[1] + end[1]) * 0.5,
      (start[2] + end[2]) * 0.5,
    ],
    axis: [axis[0], axis[1], axis[2]],
    basisX,
    basisY,
    quadrant,
  };
}

function buildResult(target: Shape, manifold: import('manifold-3d').Manifold, source: string): Shape {
  const targetInfo = getShapeGeometryInfo(target);
  const result = new Shape(wrapManifoldShapeBackend(manifold), target.colorHex);
  setShapeDimensions(result, getShapeDimensions(target));
  setShapePlacementReferences(result, getShapePlacementReferences(target), { merge: false });
  setShapeGeometryInfo(result, {
    backend: targetInfo.backend,
    representation: targetInfo.representation,
    fidelity: 'deformed',
    topology: 'none',
    sources: [source as any, ...targetInfo.sources],
  });
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
export function filletEdgeSegment(
  shape: ShapeArg,
  segment: EdgeSegment,
  radius: number,
  segments = 16,
): Shape {
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
  const manifold = requireManifoldShapeBackend(backend, 'filletEdgeSegment()');
  const wasm = getWasm();

  const selection = edgeSegmentToSelection(segment);
  const result = applyFilletSelectionToManifold(manifold, selection, radius, Math.round(segments), wasm);

  return buildResult(target, result, 'fillet');
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
export function chamferEdgeSegment(
  shape: ShapeArg,
  segment: EdgeSegment,
  size: number,
): Shape {
  if (!Number.isFinite(size) || !(size > 0)) {
    throw new Error('chamferEdgeSegment() requires a positive finite size.');
  }
  if (segment.length < 1e-6) {
    throw new Error('chamferEdgeSegment(): edge is too short to chamfer.');
  }

  const target = unwrapShape(shape);
  const backend = getShapeRuntimeBackend(target);
  const manifold = requireManifoldShapeBackend(backend, 'chamferEdgeSegment()');
  const wasm = getWasm();

  const selection = edgeSegmentToSelection(segment);
  const result = applyChamferSelectionToManifold(manifold, selection, size, wasm);

  return buildResult(target, result, 'chamfer');
}

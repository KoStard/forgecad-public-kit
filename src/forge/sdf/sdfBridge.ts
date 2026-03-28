/**
 * SDF → Shape bridge — connects the SDF API to the kernel compile plan system.
 */

import { createOwnedShapeCompilePlan, type ShapeCompilePlan } from '../compilePlan';
import { buildShapeFromCompilePlan, type Shape } from '../kernel';
import { scaleLevelSetEdgeLength } from '../quality';
import type { SdfBounds } from './sdfEval';
import type { SdfNode, Vec3 } from './sdfNode';

/**
 * Build a ForgeCAD Shape from an SDF node tree.
 * Called by SdfShape.toShape() — wires the SDF into the compile plan pipeline.
 */
export function buildShapeFromSdfPlan(tree: SdfNode, edgeLength: number, bounds: SdfBounds): Shape {
  const scaledEdgeLength = scaleLevelSetEdgeLength(edgeLength);

  // Pad bounds generously so the SDF surface never touches the bounding box.
  // Manifold.levelSet() creates a watertight mesh — if the isosurface reaches
  // the box boundary, it caps with flat faces (visible as cubes in solid view).
  const dx = bounds.max[0] - bounds.min[0];
  const dy = bounds.max[1] - bounds.min[1];
  const dz = bounds.max[2] - bounds.min[2];
  const maxDim = Math.max(dx, dy, dz, 1);
  const pad = Math.max(scaledEdgeLength * 3, maxDim * 0.1);
  const paddedBounds: { min: Vec3; max: Vec3 } = {
    min: [bounds.min[0] - pad, bounds.min[1] - pad, bounds.min[2] - pad],
    max: [bounds.max[0] + pad, bounds.max[1] + pad, bounds.max[2] + pad],
  };

  const plan: ShapeCompilePlan = {
    kind: 'sdf',
    tree,
    edgeLength: scaledEdgeLength,
    bounds: paddedBounds,
  };

  return buildShapeFromCompilePlan(createOwnedShapeCompilePlan(plan, 'sdf')!, undefined, {
    fidelity: 'sampled',
    sources: ['level-set'],
  });
}

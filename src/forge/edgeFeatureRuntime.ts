import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Mat4 } from './transform';
import type { ResolvedEdgeFeatureSelection } from './edgeFeatureModel';

const EDGE_PAD = 0.01;

function edgeFrameMatrix(selection: ResolvedEdgeFeatureSelection, originOffset = 0): Mat4 {
  const origin: [number, number, number] = [
    selection.start[0] + selection.axis[0] * originOffset,
    selection.start[1] + selection.axis[1] * originOffset,
    selection.start[2] + selection.axis[2] * originOffset,
  ];

  return [
    selection.basisX[0], selection.basisX[1], selection.basisX[2], 0,
    selection.basisY[0], selection.basisY[1], selection.basisY[2], 0,
    selection.axis[0], selection.axis[1], selection.axis[2], 0,
    origin[0], origin[1], origin[2], 1,
  ];
}

function edgeLength(selection: ResolvedEdgeFeatureSelection): number {
  const dx = selection.end[0] - selection.start[0];
  const dy = selection.end[1] - selection.start[1];
  const dz = selection.end[2] - selection.start[2];
  return Math.hypot(dx, dy, dz);
}

export function applyFilletSelectionToManifold(
  base: Manifold,
  selection: ResolvedEdgeFeatureSelection,
  radius: number,
  segments: number,
  wasm: ManifoldToplevel,
): Manifold {
  const height = edgeLength(selection);
  if (!(height > 1e-6)) return base;

  const [qx, qy] = selection.quadrant;
  const span = height + EDGE_PAD * 2;
  const frame = edgeFrameMatrix(selection, -EDGE_PAD);

  // Corner block covering the sharp edge region
  const corner = wasm.CrossSection.square([radius, radius], false)
    .translate(qx > 0 ? 0 : -radius, qy > 0 ? 0 : -radius)
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  // Cylinder offset to the inner corner of the block (INSIDE the body).
  // For a 90° edge the center is at (qx*r, qy*r) in local frame — exactly
  // where the two faces' offset-by-r planes intersect.
  const cylinder = wasm.CrossSection.circle(radius, Math.max(3, segments))
    .translate(qx * radius, qy * radius)
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  // The "crescent" is the sharp material between the corner block and the
  // cylinder arc — exactly the region to carve away for a smooth fillet.
  const crescent = wasm.Manifold.difference([corner, cylinder]);
  return wasm.Manifold.difference([base, crescent]);
}

/**
 * Concave fillet: fill the sharp groove with material up to a smooth arc.
 * Opposite of convex: we ADD the crescent (corner minus cylinder) to fill
 * the sharp interior corner with a smooth curve.
 */
export function applyConcaveFilletSelectionToManifold(
  base: Manifold,
  selection: ResolvedEdgeFeatureSelection,
  radius: number,
  segments: number,
  wasm: ManifoldToplevel,
): Manifold {
  const height = edgeLength(selection);
  if (!(height > 1e-6)) return base;

  const [qx, qy] = selection.quadrant;
  const span = height + EDGE_PAD * 2;
  const frame = edgeFrameMatrix(selection, -EDGE_PAD);

  const corner = wasm.CrossSection.square([radius, radius], false)
    .translate(qx > 0 ? 0 : -radius, qy > 0 ? 0 : -radius)
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  const cylinder = wasm.CrossSection.circle(radius, Math.max(3, segments))
    .translate(qx * radius, qy * radius)
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  // Crescent = corner minus cylinder arc. For concave edges, this is the
  // material to ADD to fill the groove up to the smooth arc surface.
  const crescent = wasm.Manifold.difference([corner, cylinder]);
  return wasm.Manifold.union([base, crescent]);
}

export function applyConcaveChamferSelectionToManifold(
  base: Manifold,
  selection: ResolvedEdgeFeatureSelection,
  size: number,
  wasm: ManifoldToplevel,
): Manifold {
  const height = edgeLength(selection);
  if (!(height > 1e-6)) return base;

  const [qx, qy] = selection.quadrant;
  const span = height + EDGE_PAD * 2;
  const frame = edgeFrameMatrix(selection, -EDGE_PAD);
  const triangle = new wasm.CrossSection([[
    [0, 0],
    [qx * size, 0],
    [0, qy * size],
  ]]);
  const chamfer = triangle
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  // For concave chamfer: add the triangle (fill groove)
  return wasm.Manifold.union([base, chamfer]);
}

export function applyChamferSelectionToManifold(
  base: Manifold,
  selection: ResolvedEdgeFeatureSelection,
  size: number,
  wasm: ManifoldToplevel,
): Manifold {
  const height = edgeLength(selection);
  if (!(height > 1e-6)) return base;

  const [qx, qy] = selection.quadrant;
  const span = height + EDGE_PAD * 2;
  const frame = edgeFrameMatrix(selection, -EDGE_PAD);
  const triangle = new wasm.CrossSection([[
    [0, 0],
    [qx * size, 0],
    [0, qy * size],
  ]]);
  const chamfer = triangle
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  return wasm.Manifold.difference([base, chamfer]);
}

import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { Mat4 } from './transform';
import type { ResolvedEdgeFeatureSelection } from './edgeFeatureModel';

/**
 * Minimum extrusion overshoot past each end of the edge.
 * The actual pad is max(MIN_EDGE_PAD, featureSize) — extending by at least
 * the fillet radius or chamfer size handles non-perpendicular adjacent faces.
 * Since the crescent is boolean'd with the body, overshooting is safe.
 */
const MIN_EDGE_PAD = 0.01;
/** Small absolute extension past tangent points to ensure clean boolean cuts */
const WEDGE_PAD = 0.02;

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

/**
 * Build the angle-aware wedge polygon and cylinder center for a fillet.
 *
 * The wedge is the triangular region at the sharp edge that the fillet arc replaces.
 * Its shape depends on the actual dihedral angle — NOT always a square.
 *
 * Math (same as buildCornerGeometry in sketch/fillets.ts):
 *   α = dihedralAngle (opening angle of the material wedge)
 *   tangentDist = r / tan(α/2)   — distance from vertex to tangent point on each face
 *   centerDist  = r / sin(α/2)   — distance from vertex to arc center along bisector
 */
function buildFilletCrossSection(
  selection: ResolvedEdgeFeatureSelection,
  radius: number,
  segments: number,
  wasm: ManifoldToplevel,
): { wedge: import('manifold-3d').CrossSection; cylinder: import('manifold-3d').CrossSection } | null {
  const { surfaceDirA, surfaceDirB, dihedralAngleDeg } = selection;
  if (!surfaceDirA || !surfaceDirB || dihedralAngleDeg == null) return null;

  const alpha = dihedralAngleDeg * Math.PI / 180; // opening angle in radians
  // Clamp to avoid degenerate geometry at extreme angles
  if (alpha < 5 * Math.PI / 180 || alpha > 175 * Math.PI / 180) return null;

  const halfAlpha = alpha / 2;
  const tangentDist = radius / Math.tan(halfAlpha);

  // Cylinder center: on the bisector of the two surface directions, at centerDist
  const bisX = surfaceDirA[0] + surfaceDirB[0];
  const bisY = surfaceDirA[1] + surfaceDirB[1];
  const bisLen = Math.sqrt(bisX * bisX + bisY * bisY);
  if (bisLen < 1e-10) return null;

  const centerDist = radius / Math.sin(halfAlpha);
  const bNx = bisX / bisLen;
  const bNy = bisY / bisLen;
  const cx = bNx * centerDist;
  const cy = bNy * centerDist;

  // Kite polygon: the correct shape for any dihedral angle.
  // Vertices: origin (edge vertex), tangent point A, cylinder center, tangent point B.
  // For 90° edges this degenerates to the same square as the legacy approach.
  const tAx = surfaceDirA[0] * tangentDist;
  const tAy = surfaceDirA[1] * tangentDist;
  const tBx = surfaceDirB[0] * tangentDist;
  const tBy = surfaceDirB[1] * tangentDist;

  // Extend center vertex slightly past cylinder center for clean boolean cut
  const cxExt = cx + bNx * WEDGE_PAD;
  const cyExt = cy + bNy * WEDGE_PAD;

  // Ensure counter-clockwise winding.
  // Check signed area of (origin, tangentA, center, tangentB).
  // Using shoelace: sum of cross products of consecutive edge vectors.
  const crossWinding = (tAx * cyExt - tAy * cxExt)
    + (cxExt * tBy - cyExt * tBx);
  const kiteVerts: [number, number][] = crossWinding >= 0
    ? [[0, 0], [tAx, tAy], [cxExt, cyExt], [tBx, tBy]]
    : [[0, 0], [tBx, tBy], [cxExt, cyExt], [tAx, tAy]];

  const wedge = new wasm.CrossSection([kiteVerts]);

  const cylinder = wasm.CrossSection.circle(radius, Math.max(3, segments))
    .translate(cx, cy);

  return { wedge, cylinder };
}

/**
 * Build angle-aware chamfer cross-section: a triangle from the edge vertex
 * to points on each face surface at the given chamfer size.
 */
function buildChamferCrossSection(
  selection: ResolvedEdgeFeatureSelection,
  size: number,
  wasm: ManifoldToplevel,
): import('manifold-3d').CrossSection | null {
  const { surfaceDirA, surfaceDirB } = selection;
  if (!surfaceDirA || !surfaceDirB) return null;

  return new wasm.CrossSection([[
    [0, 0],
    [surfaceDirA[0] * size, surfaceDirA[1] * size],
    [surfaceDirB[0] * size, surfaceDirB[1] * size],
  ]]);
}

// --- Legacy 90°-only construction (for tracked-edge path) ---

function legacyFilletCrossSection(
  selection: ResolvedEdgeFeatureSelection,
  radius: number,
  segments: number,
  wasm: ManifoldToplevel,
): { wedge: import('manifold-3d').CrossSection; cylinder: import('manifold-3d').CrossSection } {
  const [qx, qy] = selection.quadrant;
  const wedge = wasm.CrossSection.square([radius, radius], false)
    .translate(qx > 0 ? 0 : -radius, qy > 0 ? 0 : -radius);
  const cylinder = wasm.CrossSection.circle(radius, Math.max(3, segments))
    .translate(qx * radius, qy * radius);
  return { wedge, cylinder };
}

function legacyChamferCrossSection(
  selection: ResolvedEdgeFeatureSelection,
  size: number,
  wasm: ManifoldToplevel,
): import('manifold-3d').CrossSection {
  const [qx, qy] = selection.quadrant;
  return new wasm.CrossSection([[
    [0, 0],
    [qx * size, 0],
    [0, qy * size],
  ]]);
}

// --- Public API ---

export function applyFilletSelectionToManifold(
  base: Manifold,
  selection: ResolvedEdgeFeatureSelection,
  radius: number,
  segments: number,
  wasm: ManifoldToplevel,
): Manifold {
  const height = edgeLength(selection);
  if (!(height > 1e-6)) return base;

  // Extend past both ends by at least the fillet radius so that non-perpendicular
  // adjacent faces are fully covered. The boolean clips the overshoot safely.
  const pad = Math.max(MIN_EDGE_PAD, radius);
  const span = height + pad * 2;
  const frame = edgeFrameMatrix(selection, -pad);

  // Use angle-aware construction when surface direction data is available,
  // fall back to legacy 90°-only square for tracked-edge path.
  const cs = buildFilletCrossSection(selection, radius, segments, wasm)
    ?? legacyFilletCrossSection(selection, radius, segments, wasm);

  const corner = cs.wedge
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  const cyl = cs.cylinder
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  const crescent = wasm.Manifold.difference([corner, cyl]);
  return wasm.Manifold.difference([base, crescent]);
}

/**
 * Concave fillet: fill the sharp groove with material up to a smooth arc.
 * Opposite of convex: we ADD the crescent to fill the interior corner.
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

  const pad = Math.max(MIN_EDGE_PAD, radius);
  const span = height + pad * 2;
  const frame = edgeFrameMatrix(selection, -pad);

  const cs = buildFilletCrossSection(selection, radius, segments, wasm)
    ?? legacyFilletCrossSection(selection, radius, segments, wasm);

  const corner = cs.wedge
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  const cyl = cs.cylinder
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  const crescent = wasm.Manifold.difference([corner, cyl]);
  return wasm.Manifold.union([base, crescent]);
}

export function applyChamferSelectionToManifold(
  base: Manifold,
  selection: ResolvedEdgeFeatureSelection,
  size: number,
  wasm: ManifoldToplevel,
): Manifold {
  const height = edgeLength(selection);
  if (!(height > 1e-6)) return base;

  const pad = Math.max(MIN_EDGE_PAD, size);
  const span = height + pad * 2;
  const frame = edgeFrameMatrix(selection, -pad);

  const triangle = buildChamferCrossSection(selection, size, wasm)
    ?? legacyChamferCrossSection(selection, size, wasm);

  const chamfer = triangle
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  return wasm.Manifold.difference([base, chamfer]);
}

export function applyConcaveChamferSelectionToManifold(
  base: Manifold,
  selection: ResolvedEdgeFeatureSelection,
  size: number,
  wasm: ManifoldToplevel,
): Manifold {
  const height = edgeLength(selection);
  if (!(height > 1e-6)) return base;

  const pad = Math.max(MIN_EDGE_PAD, size);
  const span = height + pad * 2;
  const frame = edgeFrameMatrix(selection, -pad);

  const triangle = buildChamferCrossSection(selection, size, wasm)
    ?? legacyChamferCrossSection(selection, size, wasm);

  const chamfer = triangle
    .extrude(span, 0, 0, undefined, false)
    .transform(frame);

  return wasm.Manifold.union([base, chamfer]);
}

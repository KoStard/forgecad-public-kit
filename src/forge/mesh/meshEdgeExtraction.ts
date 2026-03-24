/**
 * ForgeCAD — Mesh Edge Extraction
 *
 * Extracts structured edge data from Manifold triangle meshes.
 * Reuses the halfedge + canonical-vertex approach from geometryArrays.ts
 * but returns rich EdgeSegment objects instead of flat Float32Arrays.
 */

import type { Vec3 } from '../transform';

export interface EdgeSegment {
  /** Stable index within the extraction (deterministic for a given mesh). */
  index: number;
  start: Vec3;
  end: Vec3;
  midpoint: Vec3;
  /** Normalized direction from start → end. */
  direction: Vec3;
  length: number;
  /** Dihedral angle in degrees (0 = coplanar, 180 = knife edge). */
  dihedralAngle: number;
  /** true = outside corner (convex), false = inside corner (concave). */
  convex: boolean;
  /** Normal of first adjacent face. */
  normalA: Vec3;
  /** Normal of second adjacent face (same as normalA for boundary edges). */
  normalB: Vec3;
  /** true if this is a boundary (unmatched) edge — unusual for closed solids. */
  boundary: boolean;
}

export interface MeshData {
  numProp: number;
  numTri: number;
  triVerts: Uint32Array;
  vertProperties: Float32Array;
  mergeFromVert?: Uint32Array;
  mergeToVert?: Uint32Array;
}

/** cos(1°) — edges with normal dot-product ≤ this are considered sharp. */
const EDGE_THRESHOLD_DOT = Math.cos(Math.PI / 180);

/**
 * Extract all sharp (feature) edges from a triangle mesh as structured data.
 *
 * A sharp edge is one where the dihedral angle between adjacent faces exceeds 1°,
 * matching the threshold used for visual edge rendering in geometryArrays.ts.
 */
export function extractEdgeSegments(mesh: MeshData): EdgeSegment[] {
  const { numProp, numTri: triCount, triVerts, vertProperties } = mesh;

  // Compute per-face normals
  const faceNx = new Float32Array(triCount);
  const faceNy = new Float32Array(triCount);
  const faceNz = new Float32Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const i0 = triVerts[t * 3];
    const i1 = triVerts[t * 3 + 1];
    const i2 = triVerts[t * 3 + 2];

    const ax = vertProperties[i0 * numProp],
      ay = vertProperties[i0 * numProp + 1],
      az = vertProperties[i0 * numProp + 2];
    const bx = vertProperties[i1 * numProp],
      by = vertProperties[i1 * numProp + 1],
      bz = vertProperties[i1 * numProp + 2];
    const cx = vertProperties[i2 * numProp],
      cy = vertProperties[i2 * numProp + 1],
      cz = vertProperties[i2 * numProp + 2];

    const e1x = bx - ax,
      e1y = by - ay,
      e1z = bz - az;
    const e2x = cx - ax,
      e2y = cy - ay,
      e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    faceNx[t] = nx;
    faceNy[t] = ny;
    faceNz[t] = nz;
  }

  // Build canonical vertex map
  const numVerts = vertProperties.length / numProp;
  const canon = buildCanonicalMap(numVerts, mesh.mergeFromVert, mesh.mergeToVert);

  const MAX_NUMERIC = 1 << 21;
  let maxCanon = 0;
  for (let i = 0; i < numVerts; i++) {
    if (canon[i] > maxCanon) maxCanon = canon[i];
  }
  const useNumeric = maxCanon < MAX_NUMERIC;

  // Halfedge map: key → { triangle index, local edge index within triangle }
  const halfEdges = new Map<number | string, number>();
  // Store the local edge index alongside the triangle: pack as tri * 4 + e
  const halfEdgeInfo = new Map<number | string, number>();

  const edges: EdgeSegment[] = [];
  let edgeIndex = 0;

  for (let t = 0; t < triCount; t++) {
    const ca = canon[triVerts[t * 3]];
    const cb = canon[triVerts[t * 3 + 1]];
    const cc = canon[triVerts[t * 3 + 2]];
    const tv = [ca, cb, cc] as const;

    for (let e = 0; e < 3; e++) {
      const va = tv[e],
        vb = tv[(e + 1) % 3];
      const fwdKey = useNumeric ? va * MAX_NUMERIC + vb : `${va},${vb}`;
      const revKey = useNumeric ? vb * MAX_NUMERIC + va : `${vb},${va}`;

      const adjTri = halfEdges.get(revKey);
      if (adjTri !== undefined) {
        const dot = faceNx[t] * faceNx[adjTri] + faceNy[t] * faceNy[adjTri] + faceNz[t] * faceNz[adjTri];
        if (dot <= EDGE_THRESHOLD_DOT) {
          const origVa = triVerts[t * 3 + e];
          const origVb = triVerts[t * 3 + ((e + 1) % 3)];
          const seg = buildEdgeSegment(edgeIndex++, origVa, origVb, vertProperties, numProp, t, adjTri, faceNx, faceNy, faceNz, dot, false);
          edges.push(seg);
        }
        halfEdges.delete(revKey);
        halfEdgeInfo.delete(revKey);
      } else {
        halfEdges.set(fwdKey, t);
        halfEdgeInfo.set(fwdKey, e);
      }
    }
  }

  // Boundary edges (should be empty for closed solids)
  for (const [key, t] of halfEdges) {
    const ca = canon[triVerts[t * 3]];
    const cb = canon[triVerts[t * 3 + 1]];
    const cc = canon[triVerts[t * 3 + 2]];
    const tv = [ca, cb, cc] as const;
    for (let e = 0; e < 3; e++) {
      const va = tv[e],
        vb = tv[(e + 1) % 3];
      const fwdKey = useNumeric ? va * MAX_NUMERIC + vb : `${va},${vb}`;
      if (fwdKey === key) {
        const origVa = triVerts[t * 3 + e];
        const origVb = triVerts[t * 3 + ((e + 1) % 3)];
        const seg = buildEdgeSegment(edgeIndex++, origVa, origVb, vertProperties, numProp, t, t, faceNx, faceNy, faceNz, 1.0, true);
        edges.push(seg);
        break;
      }
    }
  }

  return edges;
}

function buildEdgeSegment(
  index: number,
  origVa: number,
  origVb: number,
  vertProperties: Float32Array,
  numProp: number,
  triA: number,
  triB: number,
  faceNx: Float32Array,
  faceNy: Float32Array,
  faceNz: Float32Array,
  dot: number,
  boundary: boolean,
): EdgeSegment {
  const sx = vertProperties[origVa * numProp];
  const sy = vertProperties[origVa * numProp + 1];
  const sz = vertProperties[origVa * numProp + 2];
  const ex = vertProperties[origVb * numProp];
  const ey = vertProperties[origVb * numProp + 1];
  const ez = vertProperties[origVb * numProp + 2];

  const dx = ex - sx,
    dy = ey - sy,
    dz = ez - sz;
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const invLen = length > 1e-12 ? 1 / length : 0;

  const nA: Vec3 = [faceNx[triA], faceNy[triA], faceNz[triA]];
  const nB: Vec3 = [faceNx[triB], faceNy[triB], faceNz[triB]];

  // Dihedral angle: angle between face normals.
  // dot = cos(angle between normals). Dihedral = 180° - that angle for outward normals.
  const clampedDot = Math.max(-1, Math.min(1, dot));
  const dihedralAngle = boundary ? 0 : 180 - Math.acos(clampedDot) * (180 / Math.PI);

  // Convexity: the edge is convex if the cross product of the edge direction
  // with the sum of face normals points "outward" relative to the normals.
  // Equivalently: the midpoint of the normals should point away from the interior.
  // Simple test: (nA + nB) · (edge × nA) > 0 → convex.
  // But a simpler approach: compute the cross product of the two normals relative
  // to the edge direction. If (nA × nB) · edgeDir > 0, the edge is convex.
  const crossX = nA[1] * nB[2] - nA[2] * nB[1];
  const crossY = nA[2] * nB[0] - nA[0] * nB[2];
  const crossZ = nA[0] * nB[1] - nA[1] * nB[0];
  const convexDot = crossX * dx + crossY * dy + crossZ * dz;
  const convex = boundary ? true : convexDot > 0;

  return {
    index,
    start: [sx, sy, sz],
    end: [ex, ey, ez],
    midpoint: [(sx + ex) * 0.5, (sy + ey) * 0.5, (sz + ez) * 0.5],
    direction: [dx * invLen, dy * invLen, dz * invLen],
    length,
    dihedralAngle,
    convex,
    normalA: nA,
    normalB: nB,
    boundary,
  };
}

function buildCanonicalMap(numVerts: number, mergeFromVert: Uint32Array | undefined, mergeToVert: Uint32Array | undefined): Uint32Array {
  const canon = new Uint32Array(numVerts);
  for (let i = 0; i < numVerts; i++) canon[i] = i;

  if (mergeFromVert && mergeToVert) {
    for (let i = 0; i < mergeFromVert.length; i++) {
      canon[mergeFromVert[i]] = mergeToVert[i];
    }
    for (let i = 0; i < numVerts; i++) {
      let v = canon[i];
      while (canon[v] !== v) v = canon[v];
      canon[i] = v;
    }
  }

  return canon;
}

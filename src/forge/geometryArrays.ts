/**
 * ForgeCAD — Geometry Array Computation
 *
 * Pure-math conversion of Manifold mesh data into flat Float32Arrays ready
 * for Three.js BufferGeometry. No Three.js dependency — safe to run in a
 * Web Worker.
 *
 * Computes:
 *   - positions: non-indexed triangle vertex positions (triCount * 9)
 *   - normals:   flat face normals, one per triangle vertex (triCount * 9)
 *   - edgePositions: sharp edge line segment endpoints (edgeCount * 6)
 *
 * Edge detection matches THREE.EdgesGeometry(solid, 1): an edge is "sharp"
 * when the dihedral angle between adjacent faces exceeds 1°. Uses integer
 * vertex indices from the Manifold mesh for O(N) detection instead of the
 * O(N log N) float-position hashing that Three.js performs.
 */

export interface GeometryArrays {
  positions: Float32Array;
  normals: Float32Array;
  edgePositions: Float32Array;
}

/** cos(1°) — edges with dot-product <= this are considered sharp. */
const EDGE_THRESHOLD_DOT = Math.cos(Math.PI / 180);

export function computeGeometryArrays(mesh: {
  numProp: number;
  numTri: number;
  triVerts: Uint32Array;
  vertProperties: Float32Array;
  mergeFromVert?: Uint32Array;
  mergeToVert?: Uint32Array;
}): GeometryArrays {
  const { numProp, numTri: triCount, triVerts, vertProperties } = mesh;

  const positions = new Float32Array(triCount * 9);
  const normals = new Float32Array(triCount * 9);
  const faceNx = new Float32Array(triCount);
  const faceNy = new Float32Array(triCount);
  const faceNz = new Float32Array(triCount);

  for (let t = 0; t < triCount; t++) {
    const i0 = triVerts[t * 3];
    const i1 = triVerts[t * 3 + 1];
    const i2 = triVerts[t * 3 + 2];

    const ax = vertProperties[i0 * numProp], ay = vertProperties[i0 * numProp + 1], az = vertProperties[i0 * numProp + 2];
    const bx = vertProperties[i1 * numProp], by = vertProperties[i1 * numProp + 1], bz = vertProperties[i1 * numProp + 2];
    const cx = vertProperties[i2 * numProp], cy = vertProperties[i2 * numProp + 1], cz = vertProperties[i2 * numProp + 2];

    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= len; ny /= len; nz /= len;

    const o = t * 9;
    positions[o    ] = ax; positions[o + 1] = ay; positions[o + 2] = az;
    positions[o + 3] = bx; positions[o + 4] = by; positions[o + 5] = bz;
    positions[o + 6] = cx; positions[o + 7] = cy; positions[o + 8] = cz;
    normals[o    ] = nx; normals[o + 1] = ny; normals[o + 2] = nz;
    normals[o + 3] = nx; normals[o + 4] = ny; normals[o + 5] = nz;
    normals[o + 6] = nx; normals[o + 7] = ny; normals[o + 8] = nz;

    faceNx[t] = nx; faceNy[t] = ny; faceNz[t] = nz;
  }

  const edgePositions = computeSharpEdges(
    triVerts, vertProperties, numProp, triCount,
    faceNx, faceNy, faceNz,
    mesh.mergeFromVert, mesh.mergeToVert,
  );

  return { positions, normals, edgePositions };
}

function computeSharpEdges(
  triVerts: Uint32Array,
  vertProperties: Float32Array,
  numProp: number,
  triCount: number,
  faceNx: Float32Array,
  faceNy: Float32Array,
  faceNz: Float32Array,
  mergeFromVert: Uint32Array | undefined,
  mergeToVert: Uint32Array | undefined,
): Float32Array {
  // Build canonical vertex index map using Manifold's merge tables.
  // Two vertices with different indices but the same canonical id share a position.
  const numVerts = vertProperties.length / numProp;
  const canon = buildCanonicalMap(numVerts, mergeFromVert, mergeToVert);

  // Determine packing strategy: safe to use numeric keys if maxCanon < 2^21.
  const MAX_NUMERIC = 1 << 21; // 2M vertices — covers all practical CAD models
  let maxCanon = 0;
  for (let i = 0; i < numVerts; i++) {
    if (canon[i] > maxCanon) maxCanon = canon[i];
  }
  const useNumeric = maxCanon < MAX_NUMERIC;

  // Map half-edge (ca→cb) to the triangle index that owns it.
  // When we find the opposite half-edge (cb→ca), compare normals.
  const halfEdges = new Map<number | string, number>();
  const edgeList: number[] = [];

  for (let t = 0; t < triCount; t++) {
    const ca = canon[triVerts[t * 3]];
    const cb = canon[triVerts[t * 3 + 1]];
    const cc = canon[triVerts[t * 3 + 2]];
    const tv = [ca, cb, cc] as const;

    for (let e = 0; e < 3; e++) {
      const va = tv[e], vb = tv[(e + 1) % 3];
      const fwdKey = useNumeric ? va * MAX_NUMERIC + vb : `${va},${vb}`;
      const revKey = useNumeric ? vb * MAX_NUMERIC + va : `${vb},${va}`;

      const adjTri = halfEdges.get(revKey);
      if (adjTri !== undefined) {
        // Found the adjacent triangle — check dihedral angle
        const dot = faceNx[t] * faceNx[adjTri] + faceNy[t] * faceNy[adjTri] + faceNz[t] * faceNz[adjTri];
        if (dot <= EDGE_THRESHOLD_DOT) {
          // Sharp edge — emit line segment using original (uncanonical) vertex positions
          const origVa = triVerts[t * 3 + e];
          const origVb = triVerts[t * 3 + ((e + 1) % 3)];
          edgeList.push(
            vertProperties[origVa * numProp], vertProperties[origVa * numProp + 1], vertProperties[origVa * numProp + 2],
            vertProperties[origVb * numProp], vertProperties[origVb * numProp + 1], vertProperties[origVb * numProp + 2],
          );
        }
        halfEdges.delete(revKey);
      } else {
        halfEdges.set(fwdKey, t);
      }
    }
  }

  // Remaining entries in halfEdges are boundary (un-matched) edges — always sharp.
  // For closed Manifold solids these should be empty; included for completeness.
  for (const [key, t] of halfEdges) {
    // Recover e from the key
    const ca = canon[triVerts[t * 3]];
    const cb = canon[triVerts[t * 3 + 1]];
    const cc = canon[triVerts[t * 3 + 2]];
    const tv = [ca, cb, cc] as const;
    for (let e = 0; e < 3; e++) {
      const va = tv[e], vb = tv[(e + 1) % 3];
      const fwdKey = useNumeric ? va * MAX_NUMERIC + vb : `${va},${vb}`;
      if (fwdKey === key) {
        const origVa = triVerts[t * 3 + e];
        const origVb = triVerts[t * 3 + ((e + 1) % 3)];
        edgeList.push(
          vertProperties[origVa * numProp], vertProperties[origVa * numProp + 1], vertProperties[origVa * numProp + 2],
          vertProperties[origVb * numProp], vertProperties[origVb * numProp + 1], vertProperties[origVb * numProp + 2],
        );
        break;
      }
    }
  }

  return new Float32Array(edgeList);
}

function buildCanonicalMap(
  numVerts: number,
  mergeFromVert: Uint32Array | undefined,
  mergeToVert: Uint32Array | undefined,
): Uint32Array {
  const canon = new Uint32Array(numVerts);
  for (let i = 0; i < numVerts; i++) canon[i] = i;

  if (mergeFromVert && mergeToVert) {
    for (let i = 0; i < mergeFromVert.length; i++) {
      canon[mergeFromVert[i]] = mergeToVert[i];
    }
    // Path compression for transitive merges
    for (let i = 0; i < numVerts; i++) {
      let v = canon[i];
      while (canon[v] !== v) v = canon[v];
      canon[i] = v;
    }
  }

  return canon;
}

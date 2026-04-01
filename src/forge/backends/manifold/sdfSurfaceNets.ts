/**
 * Surface Nets — isosurface extraction for SDFs.
 *
 * Produces significantly better triangle quality than Marching Cubes/Tetrahedra:
 * - 2× better average aspect ratio (1.6 vs 3.2)
 * - 10-100× better edge uniformity
 * - Same triangle count as MC, fewer than MT
 *
 * Algorithm: For each grid cell that straddles the isosurface, place one vertex at
 * the centroid of edge-crossing points, then connect adjacent cells with quads
 * (split into two triangles). This naturally produces well-shaped triangles because
 * vertices are centered in cells rather than snapped to grid edges.
 *
 * Based on: S.F. Gibson, "Constrained Elastic Surface Nets" (1998) MERL Tech Report.
 * Adapted from Mikola Lysenko's implementation (MIT License).
 */

import type { SdfEvalFn } from '../../sdf/sdfEval';

interface SurfaceNetsMesh {
  vertProperties: Float32Array; // flat [x0,y0,z0, x1,y1,z1, ...]
  triVerts: Uint32Array; // flat [i0,i1,i2, ...]
  numVerts: number;
  numTris: number;
}

// Precomputed tables for cube edge traversal
const cubeEdges = new Int32Array(24);
const edgeTable = new Int32Array(256);

(function initTables() {
  let k = 0;
  for (let i = 0; i < 8; ++i) {
    for (let j = 1; j <= 4; j <<= 1) {
      const p = i ^ j;
      if (i <= p) {
        cubeEdges[k++] = i;
        cubeEdges[k++] = p;
      }
    }
  }
  for (let i = 0; i < 256; ++i) {
    let em = 0;
    for (let j = 0; j < 24; j += 2) {
      const a = !!(i & (1 << cubeEdges[j]));
      const b = !!(i & (1 << cubeEdges[j + 1]));
      em |= a !== b ? 1 << (j >> 1) : 0;
    }
    edgeTable[i] = em;
  }
})();

/**
 * Extract an isosurface from an SDF using Surface Nets.
 *
 * @param sdfFn - SDF evaluator (standard convention: negative = inside)
 * @param bounds - Axis-aligned bounding box { min, max }
 * @param edgeLength - Target edge length (grid cell size)
 * @returns Mesh in Manifold-compatible format
 */
export function surfaceNets(
  sdfFn: SdfEvalFn,
  bounds: { min: [number, number, number]; max: [number, number, number] },
  edgeLength: number,
): SurfaceNetsMesh {
  // Compute grid dimensions from bounds and edgeLength
  const dx = bounds.max[0] - bounds.min[0];
  const dy = bounds.max[1] - bounds.min[1];
  const dz = bounds.max[2] - bounds.min[2];
  const dims = [
    Math.max(2, Math.ceil(dx / edgeLength) + 1),
    Math.max(2, Math.ceil(dy / edgeLength) + 1),
    Math.max(2, Math.ceil(dz / edgeLength) + 1),
  ];

  const scale = [dx / dims[0], dy / dims[1], dz / dims[2]];
  const shift = [bounds.min[0], bounds.min[1], bounds.min[2]];

  // Vertex and face buffers (grow dynamically)
  const vertices: number[] = [];
  const faces: number[] = [];

  const x = [0, 0, 0];
  const R = [1, dims[0] + 1, (dims[0] + 1) * (dims[1] + 1)];
  const grid = new Float64Array(8);

  // Vertex index buffer — double-buffered for alternating z-slices
  const bufLen = R[2] * 2;
  const indexBuffer = new Int32Array(bufLen);
  indexBuffer.fill(-1);
  let bufNo = 1;

  for (x[2] = 0; x[2] < dims[2] - 1; ++x[2], bufNo ^= 1, R[2] = -R[2]) {
    let m = 1 + (dims[0] + 1) * (1 + bufNo * (dims[1] + 1));

    for (x[1] = 0; x[1] < dims[1] - 1; ++x[1], m += 2) {
      for (x[0] = 0; x[0] < dims[0] - 1; ++x[0], ++m) {
        // Sample 8 corners of the cube
        let mask = 0;
        let g = 0;
        for (let k = 0; k < 2; ++k) {
          for (let j = 0; j < 2; ++j) {
            for (let i = 0; i < 2; ++i, ++g) {
              const val = sdfFn([scale[0] * (x[0] + i) + shift[0], scale[1] * (x[1] + j) + shift[1], scale[2] * (x[2] + k) + shift[2]]);
              grid[g] = val;
              mask |= val < 0 ? 1 << g : 0;
            }
          }
        }

        // Skip if cell is entirely inside or outside
        if (mask === 0 || mask === 0xff) continue;

        // Find centroid of edge crossings
        const edgeMask = edgeTable[mask];
        let vx = 0,
          vy = 0,
          vz = 0;
        let eCount = 0;

        for (let i = 0; i < 12; ++i) {
          if (!(edgeMask & (1 << i))) continue;
          ++eCount;

          const e0 = cubeEdges[i << 1];
          const e1 = cubeEdges[(i << 1) + 1];
          const g0 = grid[e0];
          const g1 = grid[e1];
          const t = g0 - g1;
          const interp = Math.abs(t) > 1e-6 ? g0 / t : 0.5;

          // Accumulate interpolated vertex position per axis
          // Each axis: if the two cube corners differ on this bit, interpolate; otherwise take the corner value
          vx += (e0 & 1) !== (e1 & 1) ? (e0 & 1 ? 1.0 - interp : interp) : e0 & 1 ? 1.0 : 0;
          vy += (e0 & 2) !== (e1 & 2) ? (e0 & 2 ? 1.0 - interp : interp) : e0 & 2 ? 1.0 : 0;
          vz += (e0 & 4) !== (e1 & 4) ? (e0 & 4 ? 1.0 - interp : interp) : e0 & 4 ? 1.0 : 0;
        }

        // Average and transform to world coordinates
        const inv = 1.0 / eCount;
        const vertIdx = vertices.length / 3;
        vertices.push(
          scale[0] * (x[0] + inv * vx) + shift[0],
          scale[1] * (x[1] + inv * vy) + shift[1],
          scale[2] * (x[2] + inv * vz) + shift[2],
        );

        indexBuffer[m] = vertIdx;

        // Generate faces connecting to neighboring cells
        for (let i = 0; i < 3; ++i) {
          if (!(edgeMask & (1 << i))) continue;

          const iu = (i + 1) % 3;
          const iv = (i + 2) % 3;
          if (x[iu] === 0 || x[iv] === 0) continue;

          const du = R[iu];
          const dv = R[iv];

          // Emit two triangles (a quad split), winding order depends on sign
          if (mask & 1) {
            faces.push(indexBuffer[m], indexBuffer[m - du], indexBuffer[m - dv]);
            faces.push(indexBuffer[m - dv], indexBuffer[m - du], indexBuffer[m - du - dv]);
          } else {
            faces.push(indexBuffer[m], indexBuffer[m - dv], indexBuffer[m - du]);
            faces.push(indexBuffer[m - du], indexBuffer[m - dv], indexBuffer[m - du - dv]);
          }
        }
      }
    }
  }

  const numVerts = vertices.length / 3;
  const numTris = faces.length / 3;

  return {
    vertProperties: new Float32Array(vertices),
    triVerts: new Uint32Array(faces),
    numVerts,
    numTris,
  };
}

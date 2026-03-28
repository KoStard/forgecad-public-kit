/**
 * SDF Mesh Smoothing — Laplacian smoothing with SDF projection.
 *
 * Problem: Manifold.levelSet() uses Marching Tetrahedra on a body-centered cubic grid.
 * Vertices are placed at grid-aligned zero-crossings, producing axis-aligned triangle
 * patterns regardless of surface curvature. Vertices are mathematically correct (on the
 * SDF surface) but their spatial distribution creates ugly triangulation.
 *
 * Solution: Iteratively move each vertex toward the average of its neighbors (Laplacian),
 * then project back onto the SDF surface using the SDF gradient. This smooths out the
 * grid pattern while keeping vertices on the true surface.
 */

import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import type { SdfEvalFn } from './sdfEval';

/**
 * Apply Laplacian smoothing with SDF projection to a Manifold mesh.
 *
 * @param manifold - The input manifold (from levelSet)
 * @param sdfFn - The SDF evaluator (standard convention: negative inside)
 * @param iterations - Number of smoothing passes (default 2)
 * @param lambda - Damping factor 0-1. Higher = more smoothing per iteration (default 0.5)
 * @param wasm - Manifold WASM module
 */
export function smoothSdfMesh(
  manifold: Manifold,
  sdfFn: SdfEvalFn,
  wasm: ManifoldToplevel,
  iterations = 2,
  lambda = 0.5,
): Manifold {
  const mesh = manifold.getMesh();
  const numProp = mesh.numProp;
  const triVerts = mesh.triVerts;
  const vertProps = mesh.vertProperties;
  const numVerts = vertProps.length / numProp;
  const numTris = triVerts.length / 3;

  // Build merge map: mergeFromVert[i] → mergeToVert[i] maps duplicate vertices
  // to their canonical vertex. This is needed because Manifold duplicates vertices
  // at property boundaries (e.g., different normals on different faces).
  const canonical = new Uint32Array(numVerts);
  for (let i = 0; i < numVerts; i++) canonical[i] = i;
  if (mesh.mergeFromVert && mesh.mergeToVert) {
    for (let i = 0; i < mesh.mergeFromVert.length; i++) {
      canonical[mesh.mergeFromVert[i]] = mesh.mergeToVert[i];
    }
  }

  // Build adjacency: for each canonical vertex, collect its canonical neighbors.
  // Uses a flat array with offsets for cache-friendly access.
  // First pass: count neighbors per vertex using a Set for dedup.
  const neighborSets = new Array<Set<number>>(numVerts);
  for (let i = 0; i < numVerts; i++) neighborSets[i] = new Set();

  for (let t = 0; t < numTris; t++) {
    const a = canonical[triVerts[t * 3]];
    const b = canonical[triVerts[t * 3 + 1]];
    const c = canonical[triVerts[t * 3 + 2]];
    neighborSets[a].add(b);
    neighborSets[a].add(c);
    neighborSets[b].add(a);
    neighborSets[b].add(c);
    neighborSets[c].add(a);
    neighborSets[c].add(b);
  }

  // Flatten into packed arrays for iteration without Set iterator
  const nbrOffsets = new Uint32Array(numVerts + 1);
  for (let i = 0; i < numVerts; i++) {
    nbrOffsets[i + 1] = nbrOffsets[i] + neighborSets[i].size;
  }
  const nbrData = new Uint32Array(nbrOffsets[numVerts]);
  for (let i = 0; i < numVerts; i++) {
    let idx = nbrOffsets[i];
    neighborSets[i].forEach((n) => { nbrData[idx++] = n; });
  }

  // Work with canonical vertex positions (avoid smoothing duplicates independently)
  const positions = new Float64Array(numVerts * 3);
  for (let i = 0; i < numVerts; i++) {
    positions[i * 3] = vertProps[i * numProp];
    positions[i * 3 + 1] = vertProps[i * numProp + 1];
    positions[i * 3 + 2] = vertProps[i * numProp + 2];
  }

  // Epsilon for finite-difference gradient
  const eps = 1e-4;

  for (let iter = 0; iter < iterations; iter++) {
    // Phase 1: Laplacian — move each vertex toward neighbor average
    // Only process canonical vertices, then copy to duplicates
    const smoothed = new Float64Array(positions);

    for (let i = 0; i < numVerts; i++) {
      if (canonical[i] !== i) continue; // skip non-canonical duplicates
      const nbrStart = nbrOffsets[i];
      const nbrEnd = nbrOffsets[i + 1];
      const nbrCount = nbrEnd - nbrStart;
      if (nbrCount === 0) continue;

      let avgX = 0, avgY = 0, avgZ = 0;
      for (let j = nbrStart; j < nbrEnd; j++) {
        const n = nbrData[j];
        avgX += positions[n * 3];
        avgY += positions[n * 3 + 1];
        avgZ += positions[n * 3 + 2];
      }
      const invN = 1 / nbrCount;
      avgX *= invN;
      avgY *= invN;
      avgZ *= invN;

      // Blend toward average
      smoothed[i * 3] = positions[i * 3] + lambda * (avgX - positions[i * 3]);
      smoothed[i * 3 + 1] = positions[i * 3 + 1] + lambda * (avgY - positions[i * 3 + 1]);
      smoothed[i * 3 + 2] = positions[i * 3 + 2] + lambda * (avgZ - positions[i * 3 + 2]);
    }

    // Phase 2: SDF projection — snap each vertex back onto the SDF surface
    for (let i = 0; i < numVerts; i++) {
      if (canonical[i] !== i) continue;
      const x = smoothed[i * 3];
      const y = smoothed[i * 3 + 1];
      const z = smoothed[i * 3 + 2];

      const d = sdfFn([x, y, z]);

      // Compute gradient via central differences
      const gx = (sdfFn([x + eps, y, z]) - sdfFn([x - eps, y, z])) / (2 * eps);
      const gy = (sdfFn([x, y + eps, z]) - sdfFn([x, y - eps, z])) / (2 * eps);
      const gz = (sdfFn([x, y, z + eps]) - sdfFn([x, y, z - eps])) / (2 * eps);

      const glen = Math.sqrt(gx * gx + gy * gy + gz * gz);
      if (glen < 1e-10) continue; // degenerate gradient, skip

      // Project onto zero-isosurface: move by -d along gradient direction
      const invGlen = 1 / glen;
      smoothed[i * 3] = x - d * gx * invGlen;
      smoothed[i * 3 + 1] = y - d * gy * invGlen;
      smoothed[i * 3 + 2] = z - d * gz * invGlen;
    }

    // Copy canonical positions to all duplicates
    for (let i = 0; i < numVerts; i++) {
      const c = canonical[i];
      if (c !== i) {
        smoothed[i * 3] = smoothed[c * 3];
        smoothed[i * 3 + 1] = smoothed[c * 3 + 1];
        smoothed[i * 3 + 2] = smoothed[c * 3 + 2];
      }
    }

    // Commit this iteration
    for (let i = 0; i < smoothed.length; i++) positions[i] = smoothed[i];
  }

  // Write smoothed positions back into vertex properties
  const newProps = new Float32Array(vertProps);
  for (let i = 0; i < numVerts; i++) {
    newProps[i * numProp] = positions[i * 3];
    newProps[i * numProp + 1] = positions[i * 3 + 1];
    newProps[i * numProp + 2] = positions[i * 3 + 2];
  }

  // Reconstruct Manifold from modified mesh
  const wasmMesh = new wasm.Mesh({
    numProp,
    triVerts: new Uint32Array(triVerts),
    vertProperties: newProps,
    mergeFromVert: mesh.mergeFromVert && mesh.mergeFromVert.length > 0 ? new Uint32Array(mesh.mergeFromVert) : undefined,
    mergeToVert: mesh.mergeToVert && mesh.mergeToVert.length > 0 ? new Uint32Array(mesh.mergeToVert) : undefined,
  });

  return new wasm.Manifold(wasmMesh);
}

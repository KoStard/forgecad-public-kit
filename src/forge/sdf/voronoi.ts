/**
 * 3D Worley noise (Voronoi) — pure math, zero dependencies.
 *
 * For each query point the algorithm:
 *   1. Floors to find the integer cell.
 *   2. Iterates the 3×3×3 neighborhood (27 cells).
 *   3. Hashes each cell to a deterministic feature-point position.
 *   4. Returns the Euclidean distance to the nearest feature point.
 *
 * The hash is an integer bit-mixing routine; no trig, no sin().
 *
 * Two modes:
 *   - `worley3` / `seededWorley3`: standard 3D returning [F1, F2]
 *   - `worley3Surface` / `seededWorley3Surface`: returns wall distance
 *     with membrane suppression based on surface normal alignment.
 *     Uses the smooth (F2-F1)/2 formula + bisector normal modulation.
 */

// ---------------------------------------------------------------------------
// Hash helpers
// ---------------------------------------------------------------------------

/**
 * Mix a 32-bit integer. Based on MurmurHash3 finalizer (fmix32).
 * All arithmetic is kept in signed-32-bit range via `| 0`.
 */
function mix(h: number): number {
  h = ((h ^ (h >>> 16)) * 0x85ebca6b) | 0;
  h = ((h ^ (h >>> 13)) * 0xc2b2ae35) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return h;
}

/**
 * Combine three integers into a single hash, then derive three
 * floats in [0, 1) that serve as the feature-point offset within
 * the cell. `seed` differentiates independent noise fields.
 */
function hashCell(ix: number, iy: number, iz: number, seed: number): [number, number, number] {
  const h = (((ix * 73856093) ^ (iy * 19349669) ^ (iz * 83492791)) + seed) | 0;
  const hx = mix(h);
  const hy = mix(hx + 0x6a09e667);
  const hz = mix(hy + 0xbb67ae85);
  return [(hx >>> 0) / 0x100000000, (hy >>> 0) / 0x100000000, (hz >>> 0) / 0x100000000];
}

// ---------------------------------------------------------------------------
// Core evaluator — standard F1/F2
// ---------------------------------------------------------------------------

/**
 * Returns [F1, F2] — distances to the nearest and second-nearest feature points.
 */
function worleyCore(x: number, y: number, z: number, seed: number): [number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  let d1 = Infinity;
  let d2 = Infinity;

  for (let dz = -1; dz <= 1; dz++) {
    const cz = iz + dz;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = iy + dy;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const fp = hashCell(cx, cy, cz, seed);
        const fx = cx + fp[0];
        const fy = cy + fp[1];
        const fz = cz + fp[2];
        const ddx = x - fx;
        const ddy = y - fy;
        const ddz = z - fz;
        const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);

        if (dist < d1) {
          d2 = d1;
          d1 = dist;
        } else if (dist < d2) {
          d2 = dist;
        }
      }
    }
  }

  return [d1, d2];
}

// ---------------------------------------------------------------------------
// Surface-aware evaluator — F2-F1 with bisector normal modulation
// ---------------------------------------------------------------------------

/**
 * Projected-distance Voronoi — eliminates membranes by computing distances
 * in the tangent plane (perpendicular to the surface normal).
 *
 * Instead of modifying the output (which creates gradient discontinuities),
 * we modify the *input distances*: for each seed, we project the displacement
 * vector onto the tangent plane before computing distance. Seeds at different
 * depths along the surface normal appear co-located, so no walls form between
 * them in the normal direction.
 *
 * The projection is a continuous linear operation, so the resulting field is
 * as smooth as the original (F2-F1)/2 — no artifacts from suppression thresholds.
 *
 * The `threshold` parameter (0..1) controls how strongly the normal component
 * is suppressed: 0 = no suppression (pure 3D), 1 = full projection (pure 2D
 * on the tangent plane). Default 0.85 removes membranes while keeping some
 * 3D depth variation.
 */
function worleySurface(x: number, y: number, z: number, seed: number, nx: number, ny: number, nz: number, threshold: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  // Projection weight: how much of the normal component to remove
  // threshold=1 → full projection (remove all normal component)
  // threshold=0 → no projection (standard 3D)
  const projW = threshold;

  let d1 = Infinity;
  let d2 = Infinity;

  for (let dz = -1; dz <= 1; dz++) {
    const cz = iz + dz;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = iy + dy;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;
        const fp = hashCell(cx, cy, cz, seed);
        const fx = cx + fp[0];
        const fy = cy + fp[1];
        const fz = cz + fp[2];

        // Displacement from seed to query point
        let ddx = x - fx;
        let ddy = y - fy;
        let ddz = z - fz;

        // Project: remove the component along the surface normal
        // This makes seeds at different radial depths "collapse" together,
        // preventing walls from forming between them (no membranes).
        const dotN = ddx * nx + ddy * ny + ddz * nz;
        ddx -= dotN * nx * projW;
        ddy -= dotN * ny * projW;
        ddz -= dotN * nz * projW;

        const dist = Math.sqrt(ddx * ddx + ddy * ddy + ddz * ddz);

        if (dist < d1) {
          d2 = d1;
          d1 = dist;
        } else if (dist < d2) {
          d2 = dist;
        }
      }
    }
  }

  return (d2 - d1) * 0.5;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns [F1, F2] — distances to the nearest and second-nearest
 * Voronoi cell centers.
 */
export function worley3(x: number, y: number, z: number): [number, number] {
  return worleyCore(x, y, z, 0);
}

/**
 * Returns a seeded Worley-noise evaluator returning [F1, F2].
 */
export function seededWorley3(seed: number): (x: number, y: number, z: number) => [number, number] {
  const s = seed | 0;
  return (x: number, y: number, z: number) => worleyCore(x, y, z, s);
}

/**
 * Surface-aware Voronoi returning wall distance with membrane suppression.
 * Uses smooth (F2-F1)/2 + bisector normal modulation.
 */
export function worley3Surface(x: number, y: number, z: number, nx: number, ny: number, nz: number, threshold: number): number {
  return worleySurface(x, y, z, 0, nx, ny, nz, threshold);
}

/**
 * Returns a seeded surface-aware Worley evaluator.
 */
export function seededWorley3Surface(
  seed: number,
): (x: number, y: number, z: number, nx: number, ny: number, nz: number, threshold: number) => number {
  const s = seed | 0;
  return (x: number, y: number, z: number, nx: number, ny: number, nz: number, threshold: number) =>
    worleySurface(x, y, z, s, nx, ny, nz, threshold);
}

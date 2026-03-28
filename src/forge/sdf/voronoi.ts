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
function hashCell(
  ix: number,
  iy: number,
  iz: number,
  seed: number,
): [number, number, number] {
  // Combine coordinates into one integer.  The primes spread bits
  // so that axis-aligned runs don't collide.
  let h = (((ix * 73856093) ^ (iy * 19349669) ^ (iz * 83492791)) + seed) | 0;
  const hx = mix(h);
  const hy = mix(hx + 0x6a09e667); // different constant per channel
  const hz = mix(hy + 0xbb67ae85);
  // Map to [0, 1) — unsigned interpretation of the 32-bit value.
  return [
    (hx >>> 0) / 0x100000000,
    (hy >>> 0) / 0x100000000,
    (hz >>> 0) / 0x100000000,
  ];
}

// ---------------------------------------------------------------------------
// Core evaluator
// ---------------------------------------------------------------------------

/**
 * Returns [F1, F2] — distances to the nearest and second-nearest feature points.
 * F2 - F1 approximates twice the distance to the nearest Voronoi cell wall.
 */
function worleyCore(
  x: number,
  y: number,
  z: number,
  seed: number,
): [number, number] {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);

  let d1 = Infinity;
  let d2 = Infinity;

  // 27-cell neighborhood
  for (let dz = -1; dz <= 1; dz++) {
    const cz = iz + dz;
    for (let dy = -1; dy <= 1; dy++) {
      const cy = iy + dy;
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx;

        const fp = hashCell(cx, cy, cz, seed);

        // Feature point in world space
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
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns [F1, F2] — distances to the nearest and second-nearest
 * Voronoi cell centers.  `(F2 - F1) / 2` approximates the distance
 * to the nearest cell wall.
 *
 * Input coordinates map 1 : 1 to cell size.
 */
export function worley3(x: number, y: number, z: number): [number, number] {
  return worleyCore(x, y, z, 0);
}

/**
 * Returns a seeded Worley-noise evaluator returning [F1, F2].
 */
export function seededWorley3(
  seed: number,
): (x: number, y: number, z: number) => [number, number] {
  const s = seed | 0;
  return (x: number, y: number, z: number) => worleyCore(x, y, z, s);
}

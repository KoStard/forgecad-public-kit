/**
 * SDF Gradient & Tangent Frame utilities.
 *
 * Shared infrastructure for computing surface normals from SDF gradients
 * and building orthonormal tangent frames for UV parametrization.
 */

import type { SdfEvalFn } from './sdfEval';
import type { Vec3 } from './sdfNode';

const { abs, sqrt, sign: mathSign } = Math;

/**
 * Compute the SDF gradient via central differences.
 * The gradient points in the direction of increasing distance (outward from surface).
 * Returns a normalized normal vector and its raw length.
 */
export function computeGradient(
  evalFn: SdfEvalFn,
  p: Vec3,
  eps: number,
): { nx: number; ny: number; nz: number; length: number } {
  const gx = evalFn([p[0] + eps, p[1], p[2]]) - evalFn([p[0] - eps, p[1], p[2]]);
  const gy = evalFn([p[0], p[1] + eps, p[2]]) - evalFn([p[0], p[1] - eps, p[2]]);
  const gz = evalFn([p[0], p[1], p[2] + eps]) - evalFn([p[0], p[1], p[2] - eps]);
  const glen = sqrt(gx * gx + gy * gy + gz * gz);
  if (glen < 1e-10) {
    return { nx: 0, ny: 1, nz: 0, length: 0 };
  }
  const inv = 1 / glen;
  return { nx: gx * inv, ny: gy * inv, nz: gz * inv, length: glen };
}

/**
 * Build an orthonormal tangent frame from a unit normal vector.
 *
 * Uses the Duff et al. (Pixar, JCGT 2017) algorithm — branchless construction
 * that avoids the catastrophic precision loss of Frisvad's method near n.z = -1.
 * The discontinuity is pushed to the z=0 equator, which is unavoidable per the
 * hairy ball theorem but rarely visible in practice.
 *
 * Returns tangent (t) and bitangent (b) vectors forming a right-handed frame
 * with the input normal: cross(t, b) ≈ n.
 */
export function buildTangentFrame(
  nx: number,
  ny: number,
  nz: number,
): { tx: number; ty: number; tz: number; bx: number; by: number; bz: number } {
  // Duff et al. — "Building an Orthonormal Basis, Revisited"
  // copysign(1, nz) avoids the Frisvad singularity at nz = -1
  const s = nz >= 0 ? 1.0 : -1.0;
  const a = -1.0 / (s + nz);
  const b = nx * ny * a;

  return {
    tx: 1.0 + s * nx * nx * a,
    ty: s * b,
    tz: -s * nx,
    bx: b,
    by: s + ny * ny * a,
    bz: -ny,
  };
}

/**
 * Compute triplanar blend weights from a surface normal.
 * Weights are raised to `sharpness` power for crisper transitions.
 * Returns normalized weights that sum to 1.
 */
export function triplanarWeights(
  nx: number,
  ny: number,
  nz: number,
  sharpness: number,
): { wx: number; wy: number; wz: number } {
  let wx = Math.pow(abs(nx), sharpness);
  let wy = Math.pow(abs(ny), sharpness);
  let wz = Math.pow(abs(nz), sharpness);
  const sum = wx + wy + wz;
  if (sum < 1e-10) {
    return { wx: 1 / 3, wy: 1 / 3, wz: 1 / 3 };
  }
  const inv = 1 / sum;
  return { wx: wx * inv, wy: wy * inv, wz: wz * inv };
}

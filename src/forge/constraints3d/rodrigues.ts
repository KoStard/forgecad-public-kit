/**
 * Rodrigues Rotation Utilities
 *
 * Axis-angle (Rodrigues vector) representation: [rx, ry, rz]
 * - Direction = rotation axis
 * - Magnitude = rotation angle in radians
 *
 * Rodrigues formula: R = I + sin(θ)/θ * K + (1 - cos(θ))/θ² * K²
 * where K is the skew-symmetric matrix of the axis vector.
 *
 * Near θ=0, we use Taylor expansions to avoid division by zero.
 */

import type { Vec3 } from '../transform';

const EPS = 1e-10;

/** 3x3 rotation matrix stored as row-major flat array. */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

/** Convert axis-angle vector to 3x3 rotation matrix. */
export function rodrigues(rv: Vec3): Mat3 {
  const [rx, ry, rz] = rv;
  const theta = Math.sqrt(rx * rx + ry * ry + rz * rz);

  if (theta < EPS) {
    // First-order Taylor: R ≈ I + K
    return [1, -rz, ry, rz, 1, -rx, -ry, rx, 1];
  }

  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const t = 1 - c;

  // Normalized axis
  const kx = rx / theta;
  const ky = ry / theta;
  const kz = rz / theta;

  return [
    t * kx * kx + c,
    t * kx * ky - s * kz,
    t * kx * kz + s * ky,
    t * ky * kx + s * kz,
    t * ky * ky + c,
    t * ky * kz - s * kx,
    t * kz * kx - s * ky,
    t * kz * ky + s * kx,
    t * kz * kz + c,
  ];
}

/** Rotate a vector by the rotation matrix. */
export function rotateVec3(R: Mat3, v: Vec3): Vec3 {
  return [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
}

/** Apply rigid transform: R * point + translation. */
export function transformPoint(rv: Vec3, translation: Vec3, point: Vec3): Vec3 {
  const R = rodrigues(rv);
  const rotated = rotateVec3(R, point);
  return [rotated[0] + translation[0], rotated[1] + translation[1], rotated[2] + translation[2]];
}

/** Apply rotation only (for directions/normals): R * dir. */
export function transformDir(rv: Vec3, dir: Vec3): Vec3 {
  return rotateVec3(rodrigues(rv), dir);
}

// ─── Vec3 utilities ─────────────────────────────────────────────────────────

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function scale3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function len3(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function normalize3(v: Vec3): Vec3 {
  const l = len3(v);
  if (l < EPS) return [0, 0, 0];
  return [v[0] / l, v[1] / l, v[2] / l];
}

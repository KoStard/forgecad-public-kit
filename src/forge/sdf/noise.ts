/**
 * 3D Simplex noise — pure math, zero dependencies.
 *
 * Based on the simplex noise algorithm by Ken Perlin (2001), with the
 * gradient set and skew factors for 3D. Returns values in [-1, 1].
 *
 * The implementation avoids all allocations in the hot path — every
 * intermediate value is a local number.
 */

// --- Gradient vectors for 3D simplex noise (midpoints of edges of a cube) ---
// Stored flat: grad3[i*3], grad3[i*3+1], grad3[i*3+2]
const grad3 = new Float64Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

// Default permutation table (0-255 in a fixed pseudo-random order)
// This is the classic Perlin permutation.
const p = new Uint8Array([
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225, 140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
  247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68,
  175, 74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244,
  102, 143, 54, 65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109,
  198, 173, 186, 3, 64, 52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206, 59, 227, 47, 16, 58, 17, 182,
  189, 28, 42, 223, 183, 170, 213, 119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22, 39, 253, 19, 98, 108,
  110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51, 145, 235,
  249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 4, 184, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222,
  114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
]);

// Double the table to avoid index wrapping
function doublePerm(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(512);
  for (let i = 0; i < 256; i++) {
    out[i] = src[i];
    out[i + 256] = src[i];
  }
  return out;
}

// Pre-compute perm mod 12 table for gradient lookup
function permMod12(perm: Uint8Array): Uint8Array {
  const out = new Uint8Array(512);
  for (let i = 0; i < 512; i++) out[i] = perm[i] % 12;
  return out;
}

const defaultPerm = doublePerm(p);
const defaultPermMod12 = permMod12(defaultPerm);

// Skew / unskew factors for 3D
const F3 = 1 / 3;
const G3 = 1 / 6;

/**
 * Dot product of gradient g (index into grad3) with vector (x, y, z).
 * Inlined for performance in the hot path below, but kept as a helper
 * for readability during development.
 */
function dot3(gi: number, x: number, y: number, z: number): number {
  const o = gi * 3;
  return grad3[o] * x + grad3[o + 1] * y + grad3[o + 2] * z;
}

/**
 * 3D Simplex noise with the default permutation table.
 * Returns a value in [-1, 1].
 */
export function simplex3(x: number, y: number, z: number): number {
  return simplex3Core(x, y, z, defaultPerm, defaultPermMod12);
}

/**
 * Create a seeded simplex3 function. The returned closure uses a
 * permutation table shuffled deterministically from `seed`.
 */
export function seededSimplex3(seed: number): (x: number, y: number, z: number) => number {
  // Fisher-Yates shuffle driven by a simple xorshift32 PRNG
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i;

  // Seed the PRNG — ensure non-zero state
  let s = seed | 0 || 1;
  const next = (): number => {
    s ^= s << 13;
    s ^= s >> 17;
    s ^= s << 5;
    return s >>> 0;
  };

  // Shuffle
  for (let i = 255; i > 0; i--) {
    const j = next() % (i + 1);
    const tmp = table[i];
    table[i] = table[j];
    table[j] = tmp;
  }

  const perm = doublePerm(table);
  const pm12 = permMod12(perm);

  return (x: number, y: number, z: number): number => simplex3Core(x, y, z, perm, pm12);
}

/**
 * Core 3D simplex noise — the hot inner loop.
 *
 * Separated so both `simplex3` and seeded variants call the same code
 * with different permutation tables.
 */
function simplex3Core(x: number, y: number, z: number, perm: Uint8Array, pm12: Uint8Array): number {
  // Skew the input space to determine which simplex cell we're in
  const s = (x + y + z) * F3;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const k = Math.floor(z + s);

  const t = (i + j + k) * G3;
  // Unskew the cell origin back to (x,y,z) space
  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;

  // Distances from cell origin
  const x0 = x - X0;
  const y0 = y - Y0;
  const z0 = z - Z0;

  // Determine which simplex we are in (there are 6 possibilities in 3D)
  let i1: number, j1: number, k1: number; // Offsets for second corner
  let i2: number, j2: number, k2: number; // Offsets for third corner

  if (x0 >= y0) {
    if (y0 >= z0) {
      // X Y Z order
      i1 = 1;
      j1 = 0;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    } else if (x0 >= z0) {
      // X Z Y order
      i1 = 1;
      j1 = 0;
      k1 = 0;
      i2 = 1;
      j2 = 0;
      k2 = 1;
    } else {
      // Z X Y order
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 1;
      j2 = 0;
      k2 = 1;
    }
  } else {
    if (y0 < z0) {
      // Z Y X order
      i1 = 0;
      j1 = 0;
      k1 = 1;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else if (x0 < z0) {
      // Y Z X order
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 0;
      j2 = 1;
      k2 = 1;
    } else {
      // Y X Z order
      i1 = 0;
      j1 = 1;
      k1 = 0;
      i2 = 1;
      j2 = 1;
      k2 = 0;
    }
  }

  // Offsets for the four simplex corners
  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2 * G3;
  const y2 = y0 - j2 + 2 * G3;
  const z2 = z0 - k2 + 2 * G3;
  const x3 = x0 - 1 + 3 * G3;
  const y3 = y0 - 1 + 3 * G3;
  const z3 = z0 - 1 + 3 * G3;

  // Hash coordinates of the four simplex corners
  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;

  const gi0 = pm12[ii + perm[jj + perm[kk]]];
  const gi1 = pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]];
  const gi2 = pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]];
  const gi3 = pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]];

  // Calculate the contribution from the four corners
  let n0: number, n1: number, n2: number, n3: number;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 < 0) {
    n0 = 0;
  } else {
    t0 *= t0;
    n0 = t0 * t0 * dot3(gi0, x0, y0, z0);
  }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 < 0) {
    n1 = 0;
  } else {
    t1 *= t1;
    n1 = t1 * t1 * dot3(gi1, x1, y1, z1);
  }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 < 0) {
    n2 = 0;
  } else {
    t2 *= t2;
    n2 = t2 * t2 * dot3(gi2, x2, y2, z2);
  }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 < 0) {
    n3 = 0;
  } else {
    t3 *= t3;
    n3 = t3 * t3 * dot3(gi3, x3, y3, z3);
  }

  // Scale to [-1, 1]. The factor 32 is the standard normalization
  // for 3D simplex noise with the 0.6 radius kernel.
  return 32 * (n0 + n1 + n2 + n3);
}

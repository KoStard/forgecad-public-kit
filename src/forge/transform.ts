export type Vec3 = [number, number, number];
export type Mat4 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

export type TransformInput = Transform | Mat4;
export type RotateAroundToMode = 'plane' | 'line';

export interface RotateAroundToOptions {
  mode?: RotateAroundToMode;
}

const EPS = 1e-10;

function subVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scaleVec3(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function lengthVec3(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function projectRadial(v: Vec3, axis: Vec3): { axial: number; radial: Vec3 } {
  const axial = dotVec3(v, axis);
  return {
    axial,
    radial: subVec3(v, scaleVec3(axis, axial)),
  };
}

function signedAngleAroundAxis(from: Vec3, to: Vec3, axis: Vec3): number {
  const fromLen = lengthVec3(from);
  const toLen = lengthVec3(to);
  if (fromLen < EPS || toLen < EPS) return 0;
  const fn = scaleVec3(from, 1 / fromLen);
  const tn = scaleVec3(to, 1 / toLen);
  const sin = dotVec3(axis, crossVec3(fn, tn));
  const cos = dotVec3(fn, tn);
  return (Math.atan2(sin, cos) * 180) / Math.PI;
}

function shortestAlignedAngle(from: Vec3, target: Vec3, axis: Vec3): number {
  const direct = signedAngleAroundAxis(from, target, axis);
  const opposite = signedAngleAroundAxis(from, scaleVec3(target, -1), axis);
  return Math.abs(direct) <= Math.abs(opposite) ? direct : opposite;
}

export function solveRotateAroundAngle(
  axis: Vec3,
  pivot: Vec3,
  movingPoint: Vec3,
  targetPoint: Vec3,
  options: RotateAroundToOptions = {},
): number {
  const mode = options.mode ?? 'plane';
  const unitAxis = normalizeVec3(axis);
  const moving = subVec3(movingPoint, pivot);
  const target = subVec3(targetPoint, pivot);

  const movingDecomp = projectRadial(moving, unitAxis);
  const targetDecomp = projectRadial(target, unitAxis);
  const movingRadialLen = lengthVec3(movingDecomp.radial);
  const targetRadialLen = lengthVec3(targetDecomp.radial);

  if (movingRadialLen < EPS) {
    if (mode === 'line' && targetRadialLen >= EPS) {
      throw new Error('rotateAroundTo(...): moving point lies on the rotation axis, so line alignment is impossible');
    }
    return 0;
  }

  if (mode === 'plane') {
    if (targetRadialLen < EPS) {
      throw new Error('rotateAroundTo(...): target point lies on the rotation axis, so the target plane is undefined');
    }
    return signedAngleAroundAxis(movingDecomp.radial, targetDecomp.radial, unitAxis);
  }

  if (targetRadialLen < EPS) {
    throw new Error('rotateAroundTo(...): target line lies on the rotation axis, but the moving point does not');
  }

  const axialTol = 1e-8 * Math.max(1, Math.abs(movingDecomp.axial), Math.abs(targetDecomp.axial));
  const radialTol = 1e-8 * Math.max(1, movingRadialLen, targetRadialLen);

  if (Math.abs(targetDecomp.axial) < axialTol) {
    if (Math.abs(movingDecomp.axial) > axialTol) {
      throw new Error('rotateAroundTo(...): target line stays on the pivot plane, but the moving point has axial offset');
    }
    return shortestAlignedAngle(movingDecomp.radial, targetDecomp.radial, unitAxis);
  }

  const lambda = movingDecomp.axial / targetDecomp.axial;
  const expectedRadialLen = Math.abs(lambda) * targetRadialLen;
  if (Math.abs(movingRadialLen - expectedRadialLen) > radialTol) {
    throw new Error('rotateAroundTo(...): moving point cannot reach the target line while preserving radius around the axis');
  }

  const desiredRadial = lambda >= 0 ? targetDecomp.radial : scaleVec3(targetDecomp.radial, -1);
  return signedAngleAroundAxis(movingDecomp.radial, desiredRadial, unitAxis);
}

function identityMatrix(): Mat4 {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function toMat4(input: TransformInput): Mat4 {
  return input instanceof Transform ? input.toArray() : input;
}

function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16).fill(0);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = sum;
    }
  }
  return out as Mat4;
}

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < EPS) throw new Error('Axis must be non-zero');
  return [v[0] / len, v[1] / len, v[2] / len];
}

function transformPoint(m: Mat4, p: Vec3, w: 0 | 1): Vec3 {
  const x = p[0],
    y = p[1],
    z = p[2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12] * w,
    m[1] * x + m[5] * y + m[9] * z + m[13] * w,
    m[2] * x + m[6] * y + m[10] * z + m[14] * w,
  ];
}

function invertMat4(m: Mat4): Mat4 {
  const out = new Array<number>(16);

  const a00 = m[0],
    a01 = m[1],
    a02 = m[2],
    a03 = m[3];
  const a10 = m[4],
    a11 = m[5],
    a12 = m[6],
    a13 = m[7];
  const a20 = m[8],
    a21 = m[9],
    a22 = m[10],
    a23 = m[11];
  const a30 = m[12],
    a31 = m[13],
    a32 = m[14],
    a33 = m[15];

  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < EPS) throw new Error('Transform matrix is not invertible');
  const invDet = 1.0 / det;

  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * invDet;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * invDet;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * invDet;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * invDet;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * invDet;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * invDet;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * invDet;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * invDet;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * invDet;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * invDet;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * invDet;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * invDet;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * invDet;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * invDet;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * invDet;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * invDet;

  return out as Mat4;
}

export class Transform {
  private readonly m: Mat4;

  private constructor(matrix: Mat4) {
    this.m = matrix;
  }

  static identity(): Transform {
    return new Transform(identityMatrix());
  }

  static from(input: TransformInput): Transform {
    return input instanceof Transform ? input : new Transform(input);
  }

  static translation(x: number, y: number, z: number): Transform {
    return new Transform([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  }

  static scale(v: number | Vec3): Transform {
    const sx = typeof v === 'number' ? v : v[0];
    const sy = typeof v === 'number' ? v : v[1];
    const sz = typeof v === 'number' ? v : v[2];
    return new Transform([sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, sz, 0, 0, 0, 0, 1]);
  }

  static rotationAxis(axis: Vec3, angleDeg: number, pivot: Vec3 = [0, 0, 0]): Transform {
    const [ux, uy, uz] = normalizeVec3(axis);
    const rad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const m00 = cos + ux * ux * (1 - cos);
    const m01 = ux * uy * (1 - cos) - uz * sin;
    const m02 = ux * uz * (1 - cos) + uy * sin;
    const m10 = uy * ux * (1 - cos) + uz * sin;
    const m11 = cos + uy * uy * (1 - cos);
    const m12 = uy * uz * (1 - cos) - ux * sin;
    const m20 = uz * ux * (1 - cos) - uy * sin;
    const m21 = uz * uy * (1 - cos) + ux * sin;
    const m22 = cos + uz * uz * (1 - cos);

    const [px, py, pz] = pivot;
    const tx = px - (m00 * px + m01 * py + m02 * pz);
    const ty = py - (m10 * px + m11 * py + m12 * pz);
    const tz = pz - (m20 * px + m21 * py + m22 * pz);

    return new Transform([m00, m10, m20, 0, m01, m11, m21, 0, m02, m12, m22, 0, tx, ty, tz, 1]);
  }

  static rotateAroundTo(axis: Vec3, pivot: Vec3, movingPoint: Vec3, targetPoint: Vec3, options: RotateAroundToOptions = {}): Transform {
    const angleDeg = solveRotateAroundAngle(axis, pivot, movingPoint, targetPoint, options);
    return Transform.rotationAxis(axis, angleDeg, pivot);
  }

  /**
   * Compose transforms in chain order.
   * `a.mul(b)` means apply `a`, then `b`.
   */
  mul(other: TransformInput): Transform {
    const rhs = toMat4(other);
    return new Transform(multiplyMat4(rhs, this.m));
  }

  translate(x: number, y: number, z: number): Transform {
    return this.mul(Transform.translation(x, y, z));
  }

  rotateAxis(axis: Vec3, angleDeg: number, pivot: Vec3 = [0, 0, 0]): Transform {
    return this.mul(Transform.rotationAxis(axis, angleDeg, pivot));
  }

  scale(v: number | Vec3): Transform {
    return this.mul(Transform.scale(v));
  }

  inverse(): Transform {
    return new Transform(invertMat4(this.m));
  }

  point(p: Vec3): Vec3 {
    return transformPoint(this.m, p, 1);
  }

  vector(v: Vec3): Vec3 {
    return transformPoint(this.m, v, 0);
  }

  toArray(): Mat4 {
    return [...this.m] as Mat4;
  }
}

export function normalizeAxis(axis: Vec3): Vec3 {
  return normalizeVec3(axis);
}

/**
 * Compose transforms in chain order.
 * Equivalent to Transform.identity().mul(a).mul(b).mul(c)...
 */
export function composeChain(...steps: TransformInput[]): Transform {
  let acc = Transform.identity();
  for (const step of steps) {
    acc = acc.mul(step);
  }
  return acc;
}

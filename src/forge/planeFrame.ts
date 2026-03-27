import type { FaceRef } from './sketch/topology';
import { type Mat4, Transform, type Vec3 } from './transform';

export type PlaneSpec = { origin: Vec3; normal: Vec3 } | { plane: 'XY' | 'XZ' | 'YZ'; offset?: number } | { face: FaceRef };

export interface PlaneFrame {
  origin: Vec3;
  u: Vec3;
  v: Vec3;
  normal: Vec3;
}

const EPS = 1e-8;

function length(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < EPS) throw new Error('Plane normal must be non-zero');
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function resolvePlaneOriginNormal(plane: PlaneSpec): { origin: Vec3; normal: Vec3 } {
  if ('face' in plane) {
    const face = plane.face;
    return {
      origin: [face.center[0], face.center[1], face.center[2]],
      normal: normalize([face.normal[0], face.normal[1], face.normal[2]]),
    };
  }
  if ('origin' in plane) {
    return { origin: [plane.origin[0], plane.origin[1], plane.origin[2]], normal: normalize(plane.normal) };
  }
  const offset = plane.offset ?? 0;
  if (plane.plane === 'XY') return { origin: [0, 0, offset], normal: [0, 0, 1] };
  if (plane.plane === 'XZ') return { origin: [0, offset, 0], normal: [0, 1, 0] };
  return { origin: [offset, 0, 0], normal: [1, 0, 0] };
}

export function rotationToPlaneSpace(normal: Vec3): Mat4 {
  const n = normalize(normal);
  const dot = n[2];
  if (dot > 1 - EPS) {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  }

  let axis: Vec3;
  let angle: number;

  if (dot < -1 + EPS) {
    axis = [1, 0, 0];
    angle = Math.PI;
  } else {
    axis = [n[1], -n[0], 0];
    const axisLen = length(axis);
    axis = [axis[0] / axisLen, axis[1] / axisLen, axis[2] / axisLen];
    angle = Math.acos(dot);
  }

  const [x, y, z] = axis;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;

  const r00 = c + x * x * t;
  const r01 = x * y * t - z * s;
  const r02 = x * z * t + y * s;
  const r10 = y * x * t + z * s;
  const r11 = c + y * y * t;
  const r12 = y * z * t - x * s;
  const r20 = z * x * t - y * s;
  const r21 = z * y * t + x * s;
  const r22 = c + z * z * t;

  return [r00, r10, r20, 0, r01, r11, r21, 0, r02, r12, r22, 0, 0, 0, 0, 1];
}

export function resolvePlaneFrame(plane: PlaneSpec): PlaneFrame {
  if ('face' in plane) {
    const face = plane.face;
    if (face.planar === false || !face.uAxis || !face.vAxis) {
      throw new Error(`Face "${face.name}" is not planar and cannot be used as a projection plane.`);
    }
    return {
      origin: [face.center[0], face.center[1], face.center[2]],
      u: [face.uAxis[0], face.uAxis[1], face.uAxis[2]],
      v: [face.vAxis[0], face.vAxis[1], face.vAxis[2]],
      normal: [face.normal[0], face.normal[1], face.normal[2]],
    };
  }
  const { origin, normal } = resolvePlaneOriginNormal(plane);
  const worldFromPlane = Transform.from(rotationToPlaneSpace(normal)).inverse();
  return {
    origin,
    u: worldFromPlane.vector([1, 0, 0]),
    v: worldFromPlane.vector([0, 1, 0]),
    normal,
  };
}

export function planeFrameToWorldToPlaneMatrix(frame: PlaneFrame): Mat4 {
  const rotation = rotationToPlaneSpace(frame.normal);
  return Transform.translation(-frame.origin[0], -frame.origin[1], -frame.origin[2]).mul(rotation).toArray();
}

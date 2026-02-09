import type { Mat4 } from 'manifold-3d';
import { Shape } from './kernel';
import { Sketch } from './sketch';

type Vec3 = [number, number, number];

export type PlaneSpec =
  | { origin: Vec3; normal: Vec3 }
  | { plane: 'XY' | 'XZ' | 'YZ'; offset?: number };

const EPS = 1e-8;

function length(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v: Vec3): Vec3 {
  const len = length(v);
  if (len < EPS) throw new Error('Plane normal must be non-zero');
  return [v[0] / len, v[1] / len, v[2] / len];
}

function resolvePlane(plane: PlaneSpec): { origin: Vec3; normal: Vec3 } {
  if ('origin' in plane) {
    return { origin: plane.origin, normal: plane.normal };
  }
  const offset = plane.offset ?? 0;
  if (plane.plane === 'XY') return { origin: [0, 0, offset], normal: [0, 0, 1] };
  if (plane.plane === 'XZ') return { origin: [0, offset, 0], normal: [0, 1, 0] };
  return { origin: [offset, 0, 0], normal: [1, 0, 0] };
}

function rotationToZ(normal: Vec3): Mat4 {
  const n = normalize(normal);
  const dot = n[2];
  if (dot > 1 - EPS) {
    return [
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ];
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

  // Column-major order
  return [
    r00, r10, r20, 0,
    r01, r11, r21, 0,
    r02, r12, r22, 0,
    0, 0, 0, 1,
  ];
}

function toPlaneSpace(shape: Shape, plane: PlaneSpec) {
  const { origin, normal } = resolvePlane(plane);
  const rotation = rotationToZ(normal);
  return shape.manifold.translate(-origin[0], -origin[1], -origin[2]).transform(rotation);
}

export function intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  return new Sketch(transformed.slice(0));
}

export function projectToPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  return new Sketch(transformed.project());
}

import type { SceneObject } from '@forge/index';
import { shapeToGeometry } from '@forge/meshToGeometry';
import * as THREE from 'three';
import { NON_TEXT_INPUT_TYPES } from './types';

const PLANE_TRANSFORM_EPS = 1e-8;

interface PlaneTransform {
  center: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

export function distToSegment2D(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function pointInPolygon(px: number, py: number, polygon: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0],
      yi = polygon[i][1];
    const xj = polygon[j][0],
      yj = polygon[j][1];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function pointInPolygon2D(point: THREE.Vector2, polygon: THREE.Vector2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi || 1e-9) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function polygonArea2D(points: THREE.Vector2[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return area * 0.5;
}

export function hashString(value: string | undefined | null): number {
  const s = String(value || '');
  let hash = 0;
  for (let i = 0; i < s.length; i += 1) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

export function buildPlaneSpaceRotation(
  normalLike: [number, number, number],
): { normal: THREE.Vector3; rotationToPlane: THREE.Matrix4 } | null {
  const normal = new THREE.Vector3(normalLike[0], normalLike[1], normalLike[2]);
  if (normal.lengthSq() < PLANE_TRANSFORM_EPS) return null;
  normal.normalize();

  const dot = normal.z;
  if (dot > 1 - PLANE_TRANSFORM_EPS) {
    return { normal, rotationToPlane: new THREE.Matrix4() };
  }

  let axis = new THREE.Vector3(1, 0, 0);
  let angle = Math.PI;

  if (dot >= -1 + PLANE_TRANSFORM_EPS) {
    axis = new THREE.Vector3(normal.y, -normal.x, 0);
    const axisLength = axis.length();
    if (axisLength <= PLANE_TRANSFORM_EPS) {
      return { normal, rotationToPlane: new THREE.Matrix4() };
    }
    axis.multiplyScalar(1 / axisLength);
    angle = Math.acos(THREE.MathUtils.clamp(dot, -1, 1));
  }

  return {
    normal,
    rotationToPlane: new THREE.Matrix4().makeRotationAxis(axis, angle),
  };
}

export function resolvePlaneTransform(normalLike: [number, number, number], offset: number, normalDisplacement = 0): PlaneTransform | null {
  const planeSpace = buildPlaneSpaceRotation(normalLike);
  if (!planeSpace) return null;
  const { normal, rotationToPlane } = planeSpace;
  const center = normal.clone().multiplyScalar(offset + normalDisplacement);
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(rotationToPlane.clone().invert());

  return { center, quaternion };
}

export function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.closest('[data-fc-editor-surface]')) return false;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUT_TYPES.has(target.type.toLowerCase());
  }

  let current: HTMLElement | null = target;
  while (current) {
    if (current.isContentEditable) return true;
    current = current.parentElement;
  }

  return false;
}

export const expandBoundsByTransformedAabb = (
  target: THREE.Box3,
  min: [number, number, number],
  max: [number, number, number],
  matrix: THREE.Matrix4,
): void => {
  const corners: [number, number, number][] = [
    [min[0], min[1], min[2]],
    [min[0], min[1], max[2]],
    [min[0], max[1], min[2]],
    [min[0], max[1], max[2]],
    [max[0], min[1], min[2]],
    [max[0], min[1], max[2]],
    [max[0], max[1], min[2]],
    [max[0], max[1], max[2]],
  ];
  corners.forEach((corner) => {
    target.expandByPoint(new THREE.Vector3(corner[0], corner[1], corner[2]).applyMatrix4(matrix));
  });
};

export function computeSceneObjectBounds(obj: SceneObject, objectMatrices: Record<string, THREE.Matrix4>): THREE.Box3 | null {
  const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
  if (obj.shape) {
    try {
      const { solid } = shapeToGeometry(obj.shape);
      solid.computeBoundingBox();
      const bounds = solid.boundingBox ?? null;
      if (!bounds) return null;
      const out = new THREE.Box3();
      expandBoundsByTransformedAabb(out, [bounds.min.x, bounds.min.y, bounds.min.z], [bounds.max.x, bounds.max.y, bounds.max.z], matrix);
      return out;
    } catch {
      return null;
    }
  }
  if (obj.sketch) {
    try {
      const polys = obj.sketch.toPolygons();
      const box = new THREE.Box3();
      let hasPoint = false;
      polys.forEach((contour) => {
        contour.forEach((p) => {
          box.expandByPoint(new THREE.Vector3(p[0], p[1], 0));
          hasPoint = true;
        });
      });
      if (!hasPoint) return null;
      const out = new THREE.Box3();
      expandBoundsByTransformedAabb(out, [box.min.x, box.min.y, box.min.z], [box.max.x, box.max.y, box.max.z], matrix);
      return out;
    } catch {
      return null;
    }
  }
  if (obj.toolpath) {
    const b = obj.toolpath.bounds;
    const out = new THREE.Box3();
    expandBoundsByTransformedAabb(out, b.min, b.max, matrix);
    return out;
  }
  return null;
}

export function buildPathFromPoints(points: THREE.Vector2[]): THREE.Path {
  const path = new THREE.Path();
  path.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    path.lineTo(points[i].x, points[i].y);
  }
  path.closePath();
  return path;
}

export function buildShapeFromPoints(points: THREE.Vector2[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    shape.lineTo(points[i].x, points[i].y);
  }
  shape.closePath();
  return shape;
}

export function buildFilledGeometryFromPolygons(polygons: number[][][]): THREE.BufferGeometry | null {
  const loops = polygons
    .filter((polygon) => polygon.length >= 3)
    .map((polygon) => {
      const points = polygon.map((point) => new THREE.Vector2(point[0], point[1]));
      const area = Math.abs(polygonArea2D(points));
      return { points, area };
    })
    .filter((loop) => loop.area > 1e-8)
    .sort((a, b) => b.area - a.area);

  if (loops.length === 0) return null;

  const parents = new Array<number>(loops.length).fill(-1);
  const depths = new Array<number>(loops.length).fill(0);

  for (let i = 0; i < loops.length; i += 1) {
    const probe = loops[i].points[0];
    let bestParent = -1;
    let bestArea = Number.POSITIVE_INFINITY;
    for (let j = 0; j < i; j += 1) {
      if (loops[j].area >= bestArea) continue;
      if (!pointInPolygon2D(probe, loops[j].points)) continue;
      bestParent = j;
      bestArea = loops[j].area;
    }
    parents[i] = bestParent;
    depths[i] = bestParent >= 0 ? depths[bestParent] + 1 : 0;
  }

  const shapesByLoop = new Map<number, THREE.Shape>();
  const shapes: THREE.Shape[] = [];

  loops.forEach((loop, index) => {
    if (depths[index] % 2 === 1) return;
    const shape = buildShapeFromPoints(loop.points);
    shapesByLoop.set(index, shape);
    shapes.push(shape);
  });

  loops.forEach((loop, index) => {
    if (depths[index] % 2 === 0) return;
    const parent = parents[index];
    const outerShape = parent >= 0 ? shapesByLoop.get(parent) : null;
    if (!outerShape) return;
    outerShape.holes.push(buildPathFromPoints(loop.points));
  });

  if (shapes.length === 0) return null;
  return new THREE.ShapeGeometry(shapes);
}

export function buildOutlineGeometryFromPolygons(polygons: number[][][]): THREE.BufferGeometry | null {
  const vertices: number[] = [];
  for (const polygon of polygons) {
    if (polygon.length < 2) continue;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      vertices.push(a[0], a[1], 0, b[0], b[1], 0);
    }
  }
  if (vertices.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  return geo;
}

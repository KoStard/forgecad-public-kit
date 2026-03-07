/**
 * Fillet / Chamfer approximations for vertical edges.
 *
 * Manifold is a mesh kernel without native fillet support.
 * We approximate by subtracting/adding geometry along edges.
 */

import { Shape, union, difference } from '../kernel';
import type { Sketch } from './core';
import { circle2d, rect, polygon } from './primitives';
import { sketchExtrude } from './extrude';
import { TrackedShape, type EdgeRef } from './topology';
import type { Point2D } from './entities';

type ShapeArg = Shape | TrackedShape;
const unwrap = (s: ShapeArg): Shape => s instanceof TrackedShape ? s.toShape() : s;
const EPSILON = 1e-8;

export interface FilletCornerSpec {
  index: number;
  radius: number;
  segments?: number;
}

type PointInput = [number, number] | Point2D;

interface FilletCornerGeometry {
  radius: number;
  tangentDistance: number;
  segments: number;
  start: [number, number];
  end: [number, number];
  center: [number, number];
  startAngle: number;
  sweep: number;
}

function toTuple(point: PointInput): [number, number] {
  return Array.isArray(point) ? [point[0], point[1]] : [point.x, point.y];
}

function distance(a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.hypot(dx, dy);
}

function normalize(vx: number, vy: number): [number, number] {
  const len = Math.hypot(vx, vy);
  if (len <= EPSILON) throw new Error('filletCorners requires non-degenerate edges');
  return [vx / len, vy / len];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function signedArea(points: [number, number][]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function defaultSegmentsForSweep(sweep: number): number {
  // Roughly one line segment per 12 degrees keeps profile fillets smooth without exploding vertex count.
  return Math.max(3, Math.ceil(Math.abs(sweep) / (Math.PI / 15)));
}

function pointsNearlyEqual(a: [number, number], b: [number, number], epsilon = 1e-6): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

function buildCornerGeometry(
  points: [number, number][],
  spec: FilletCornerSpec,
  winding: number,
): FilletCornerGeometry {
  const count = points.length;
  if (!Number.isInteger(spec.index) || spec.index < 0 || spec.index >= count) {
    throw new Error(`filletCorners corner index ${spec.index} is out of range for ${count} points`);
  }
  if (!(spec.radius > 0)) {
    throw new Error(`filletCorners corner ${spec.index} must have a positive radius`);
  }

  const prev = points[(spec.index - 1 + count) % count];
  const current = points[spec.index];
  const next = points[(spec.index + 1) % count];

  const inLength = distance(prev, current);
  const outLength = distance(current, next);
  const [inDirX, inDirY] = normalize(current[0] - prev[0], current[1] - prev[1]);
  const [outDirX, outDirY] = normalize(next[0] - current[0], next[1] - current[1]);

  const turn = inDirX * outDirY - inDirY * outDirX;
  if (turn * winding <= EPSILON) {
    throw new Error(`filletCorners corner ${spec.index} is concave or collinear; only convex corners are supported`);
  }

  const toPrev: [number, number] = [-inDirX, -inDirY];
  const toNext: [number, number] = [outDirX, outDirY];
  const interiorAngle = Math.acos(clamp(toPrev[0] * toNext[0] + toPrev[1] * toNext[1], -1, 1));
  if (interiorAngle <= EPSILON || interiorAngle >= Math.PI - EPSILON) {
    throw new Error(`filletCorners corner ${spec.index} has an unsupported angle`);
  }

  const tangentDistance = spec.radius / Math.tan(interiorAngle / 2);
  if (tangentDistance >= inLength - EPSILON || tangentDistance >= outLength - EPSILON) {
    const maxRadius = Math.min(inLength, outLength) * Math.tan(interiorAngle / 2);
    throw new Error(
      `filletCorners radius ${spec.radius} is too large for corner ${spec.index}; max is ${maxRadius.toFixed(3)}`,
    );
  }

  const start: [number, number] = [
    current[0] - inDirX * tangentDistance,
    current[1] - inDirY * tangentDistance,
  ];
  const end: [number, number] = [
    current[0] + outDirX * tangentDistance,
    current[1] + outDirY * tangentDistance,
  ];

  const [bisectorX, bisectorY] = normalize(toPrev[0] + toNext[0], toPrev[1] + toNext[1]);
  const centerDistance = spec.radius / Math.sin(interiorAngle / 2);
  const center: [number, number] = [
    current[0] + bisectorX * centerDistance,
    current[1] + bisectorY * centerDistance,
  ];

  const requestedSegments = spec.segments == null ? defaultSegmentsForSweep(interiorAngle) : Math.round(spec.segments);
  const segments = Math.max(2, requestedSegments);

  return {
    radius: spec.radius,
    tangentDistance,
    segments,
    start,
    end,
    center,
    startAngle: Math.atan2(start[1] - center[1], start[0] - center[0]),
    sweep: winding * interiorAngle,
  };
}

export function filletCorners(points: PointInput[], corners: FilletCornerSpec[]): Sketch {
  if (points.length < 3) throw new Error('filletCorners requires at least 3 points');
  if (corners.length === 0) return polygon(points);

  const tuples = points.map(toTuple);
  const area = signedArea(tuples);
  if (Math.abs(area) <= EPSILON) throw new Error('filletCorners requires a non-degenerate polygon');
  const winding = Math.sign(area);

  const geometryByIndex = new Map<number, FilletCornerGeometry>();
  for (const spec of corners) {
    if (geometryByIndex.has(spec.index)) {
      throw new Error(`filletCorners corner ${spec.index} is specified more than once`);
    }
    geometryByIndex.set(spec.index, buildCornerGeometry(tuples, spec, winding));
  }

  for (let i = 0; i < tuples.length; i += 1) {
    const nextIndex = (i + 1) % tuples.length;
    const edgeLength = distance(tuples[i], tuples[nextIndex]);
    const exitDistance = geometryByIndex.get(i)?.tangentDistance ?? 0;
    const entryDistance = geometryByIndex.get(nextIndex)?.tangentDistance ?? 0;
    if (exitDistance + entryDistance >= edgeLength - EPSILON) {
      throw new Error(
        `filletCorners adjacent fillets overlap on edge ${i} -> ${nextIndex}; reduce one of the radii`,
      );
    }
  }

  const rounded: [number, number][] = [];
  const pushPoint = (point: [number, number]) => {
    if (rounded.length === 0 || !pointsNearlyEqual(rounded[rounded.length - 1], point)) {
      rounded.push(point);
    }
  };

  for (let i = 0; i < tuples.length; i += 1) {
    const corner = geometryByIndex.get(i);
    if (corner == null) {
      pushPoint(tuples[i]);
      continue;
    }

    pushPoint(corner.start);
    for (let step = 1; step < corner.segments; step += 1) {
      const angle = corner.startAngle + (corner.sweep * step) / corner.segments;
      pushPoint([
        corner.center[0] + Math.cos(angle) * corner.radius,
        corner.center[1] + Math.sin(angle) * corner.radius,
      ]);
    }
    pushPoint(corner.end);
  }

  if (rounded.length >= 2 && pointsNearlyEqual(rounded[0], rounded[rounded.length - 1])) {
    rounded.pop();
  }

  return polygon(rounded);
}

/**
 * Fillet a vertical edge — subtract square corner, add quarter-cylinder.
 * `quadrant` controls which corner: [signX, signY] relative to edge position.
 * Default [-1, -1] means the material is in the -X, -Y direction from the edge.
 */
export function filletEdge(
  shape: ShapeArg,
  edge: EdgeRef,
  radius: number,
  quadrant: [number, number] = [-1, -1],
  segments = 16,
): Shape {
  const base = unwrap(shape);
  const [sx, sy, sz] = edge.start;
  const [, , ez] = edge.end;
  const zMin = Math.min(sz, ez);
  const height = Math.abs(ez - sz);
  if (height < 1e-6) return base;

  const [qx, qy] = quadrant;
  // Square to subtract (the corner)
  const cornerBox = sketchExtrude(rect(radius, radius), height + 0.02)
    .translate(qx > 0 ? sx : sx - radius, qy > 0 ? sy : sy - radius, zMin - 0.01).toShape();
  // Cylinder to add (the fillet)
  const filletCyl = sketchExtrude(circle2d(radius, segments), height + 0.02)
    .translate(sx, sy, zMin - 0.01).toShape();

  return union(difference(base, cornerBox), filletCyl);
}

/**
 * Chamfer a vertical edge — subtract a triangular prism.
 */
export function chamferEdge(
  shape: ShapeArg,
  edge: EdgeRef,
  size: number,
  quadrant: [number, number] = [-1, -1],
): Shape {
  const base = unwrap(shape);
  const [sx, sy, sz] = edge.start;
  const [, , ez] = edge.end;
  const zMin = Math.min(sz, ez);
  const height = Math.abs(ez - sz);
  if (height < 1e-6) return base;

  const [qx, qy] = quadrant;
  // Triangle pointing into the corner
  const pts: [number, number][] = [
    [0, 0],
    [qx * size, 0],
    [0, qy * size],
  ];
  const tri = polygon(pts);
  const prism = sketchExtrude(tri, height + 0.02)
    .translate(sx, sy, zMin - 0.01).toShape();

  return difference(base, prism);
}

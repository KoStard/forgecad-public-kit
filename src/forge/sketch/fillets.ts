/**
 * Fillet / Chamfer approximations for vertical edges.
 *
 * Manifold is a mesh kernel without native fillet support.
 * We approximate by subtracting/adding geometry along edges.
 */

import { Shape, union, difference } from '../kernel';
import { circle2d, rect } from './primitives';
import { polygon } from './primitives';
import { sketchExtrude } from './extrude';
import { TrackedShape, type EdgeRef } from './topology';

type ShapeArg = Shape | TrackedShape;
const unwrap = (s: ShapeArg): Shape => s instanceof TrackedShape ? s.toShape() : s;

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

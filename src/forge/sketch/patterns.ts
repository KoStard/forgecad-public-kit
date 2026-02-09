/**
 * Pattern operations — linear, circular, mirror arrays.
 * Produces arrays of shapes that can be unioned together.
 */

import { Shape, union } from '../kernel';
import { TrackedShape } from './topology';

type ShapeArg = Shape | TrackedShape;
const unwrap = (s: ShapeArg): Shape => s instanceof TrackedShape ? s.toShape() : s;

/** Repeat a shape along a direction vector */
export function linearPattern(
  shape: ShapeArg,
  count: number,
  dx: number,
  dy: number,
  dz = 0,
): Shape {
  const base = unwrap(shape);
  const copies: Shape[] = [];
  for (let i = 0; i < count; i++) {
    copies.push(base.translate(dx * i, dy * i, dz * i));
  }
  return union(...copies);
}

/** Repeat a shape around the Z axis */
export function circularPattern(
  shape: ShapeArg,
  count: number,
  centerX = 0,
  centerY = 0,
): Shape {
  const base = unwrap(shape);
  const step = 360 / count;
  const copies: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const angle = step * i;
    copies.push(
      base
        .translate(-centerX, -centerY, 0)
        .rotate(0, 0, angle)
        .translate(centerX, centerY, 0),
    );
  }
  return union(...copies);
}

/** Mirror a shape and union with original */
export function mirrorCopy(
  shape: ShapeArg,
  normal: [number, number, number],
): Shape {
  const base = unwrap(shape);
  return union(base, base.mirror(normal));
}

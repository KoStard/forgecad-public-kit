/**
 * Pattern operations — linear, circular, mirror arrays.
 * Produces arrays of shapes that can be unioned together.
 */

import { Shape, getShapeCompilePlan, setShapeCompilePlan, union } from '../kernel';
import { buildPatternOwnershipOperation, wrapRepeatedShapeCompilePlan } from '../repetitionOwnership';
import { TrackedShape } from './topology';

type ShapeArg = Shape | TrackedShape;
const unwrap = (s: ShapeArg): Shape => s instanceof TrackedShape ? s.toShape() : s;

function withPatternOwnership(shape: Shape, kind: 'linear' | 'circular', index: number): Shape {
  return setShapeCompilePlan(
    shape,
    wrapRepeatedShapeCompilePlan(getShapeCompilePlan(shape), buildPatternOwnershipOperation(kind, index)),
  );
}

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
    const copy = i === 0
      ? base.clone()
      : base.translate(dx * i, dy * i, dz * i);
    copies.push(withPatternOwnership(copy, 'linear', i));
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
    const copy = i === 0
      ? base.clone()
      : base
        .translate(-centerX, -centerY, 0)
        .rotate(0, 0, step * i)
        .translate(centerX, centerY, 0);
    copies.push(withPatternOwnership(copy, 'circular', i));
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

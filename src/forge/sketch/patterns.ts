/**
 * Pattern operations — linear, circular, mirror arrays.
 * Produces arrays of shapes that can be unioned together.
 */

import { getShapeCompilePlan, Shape, setShapeCompilePlan, union } from '../kernel';
import { buildPatternOwnershipOperation, wrapRepeatedShapeCompilePlan } from '../repetitionOwnership';
import { union2d } from './booleans';
import { Sketch } from './core';
import { TrackedShape } from './topology';

type ShapeArg = Shape | TrackedShape;
const unwrap = (s: ShapeArg): Shape => (s instanceof TrackedShape ? s.toShape() : s);

function withPatternOwnership(shape: Shape, kind: 'linear' | 'circular', index: number): Shape {
  return setShapeCompilePlan(shape, wrapRepeatedShapeCompilePlan(getShapeCompilePlan(shape), buildPatternOwnershipOperation(kind, index)));
}

/** Repeat a shape along a direction vector */
export function linearPattern(shape: ShapeArg, count: number, dx: number, dy: number, dz = 0): Shape {
  const base = unwrap(shape);
  const copies: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const copy = i === 0 ? base.clone() : base.translate(dx * i, dy * i, dz * i);
    copies.push(withPatternOwnership(copy, 'linear', i));
  }
  return union(...copies);
}

/** Repeat a shape around the Z axis */
export function circularPattern(shape: ShapeArg, count: number, centerX = 0, centerY = 0): Shape {
  const base = unwrap(shape);
  const step = 360 / count;
  const copies: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const copy =
      i === 0
        ? base.clone()
        : base
            .translate(-centerX, -centerY, 0)
            .rotate(0, 0, step * i)
            .translate(centerX, centerY, 0);
    copies.push(withPatternOwnership(copy, 'circular', i));
  }
  return union(...copies);
}

/** Repeat a sketch in a linear pattern */
export function linearPattern2d(sketch: Sketch, count: number, dx: number, dy: number = 0): Sketch {
  if (count <= 0) return sketch;
  const copies: Sketch[] = [sketch];
  for (let i = 1; i < count; i++) {
    copies.push(sketch.translate(dx * i, dy * i));
  }
  return union2d(...copies);
}

/** Repeat a sketch in a circular pattern around a center point */
export function circularPattern2d(sketch: Sketch, count: number, centerX: number = 0, centerY: number = 0): Sketch {
  if (count <= 0) return sketch;
  const step = 360 / count;
  const copies: Sketch[] = [];
  for (let i = 0; i < count; i++) {
    const angle = step * i;
    if (angle === 0) {
      copies.push(sketch);
    } else {
      // Translate to origin, rotate, translate back
      copies.push(sketch.translate(-centerX, -centerY).rotate(angle).translate(centerX, centerY));
    }
  }
  return union2d(...copies);
}

/** Mirror a shape and union with original */
export function mirrorCopy(shape: ShapeArg, normal: [number, number, number]): Shape {
  const base = unwrap(shape);
  return union(base, base.mirror(normal));
}

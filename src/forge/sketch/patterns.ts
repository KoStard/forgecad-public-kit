/**
 * Pattern operations — linear, circular, mirror arrays.
 * Produces arrays of shapes that can be unioned together.
 */

import { getShapeCompilePlan, Shape, setShapeCompilePlan, union } from '../kernel';
import { buildPatternOwnershipOperation, wrapRepeatedShapeCompilePlan } from '../face-tracking/repetitionOwnership';
import { union2d } from './booleans';
import { Sketch } from './core';
import { TrackedShape } from './topology';

type ShapeArg = Shape | TrackedShape;
const unwrap = (s: ShapeArg): Shape => (s instanceof TrackedShape ? s.toShape() : s);

function withPatternOwnership(shape: Shape, kind: 'linear' | 'circular', index: number): Shape {
  return setShapeCompilePlan(shape, wrapRepeatedShapeCompilePlan(getShapeCompilePlan(shape), buildPatternOwnershipOperation(kind, index)));
}

/** Repeat a shape in a linear pattern along a direction vector and union the copies. */
export function linearPattern(shape: ShapeArg, count: number, dx: number, dy: number, dz = 0): Shape {
  const base = unwrap(shape);
  const copies: Shape[] = [];
  for (let i = 0; i < count; i++) {
    const copy = i === 0 ? base.clone() : base.translate(dx * i, dy * i, dz * i);
    copies.push(withPatternOwnership(copy, 'linear', i));
  }
  return union(...copies);
}

export interface CircularPatternOptions {
  /** Center X of the rotation (default: 0). Used when axis is Z (legacy mode). */
  centerX?: number;
  /** Center Y of the rotation (default: 0). Used when axis is Z (legacy mode). */
  centerY?: number;
  /** Rotation axis direction (default: [0, 0, 1] = Z axis). */
  axis?: [number, number, number];
  /** Pivot point for the rotation (default: [0, 0, 0]). Overrides centerX/centerY when set. */
  origin?: [number, number, number];
}

/**
 * Repeat a shape in a circular pattern around an axis and union the copies.
 *
 * Simple usage (Z axis, matches legacy signature):
 *   circularPattern(shape, 6)
 *   circularPattern(shape, 6, 10, 20)           // centerX=10, centerY=20
 *
 * Advanced usage (arbitrary axis):
 *   circularPattern(shape, 6, { axis: [1, 0, 0], origin: [0, 0, 50] })
 */
export function circularPattern(shape: ShapeArg, count: number, centerXOrOpts?: number | CircularPatternOptions, centerY?: number): Shape {
  const base = unwrap(shape);
  const step = 360 / count;

  // Parse arguments: support both legacy (centerX, centerY) and options object
  let axis: [number, number, number] | undefined;
  let origin: [number, number, number] | undefined;
  let cx = 0;
  let cy = 0;

  if (typeof centerXOrOpts === 'object' && centerXOrOpts !== null) {
    axis = centerXOrOpts.axis;
    origin = centerXOrOpts.origin;
    cx = centerXOrOpts.centerX ?? 0;
    cy = centerXOrOpts.centerY ?? 0;
  } else {
    cx = centerXOrOpts ?? 0;
    cy = centerY ?? 0;
  }

  // If an explicit axis is given (not default Z), use rotateAround
  const useArbitraryAxis = axis != null && !(axis[0] === 0 && axis[1] === 0 && axis[2] !== 0);
  const pivot: [number, number, number] = origin ?? [cx, cy, 0];

  const copies: Shape[] = [];
  for (let i = 0; i < count; i++) {
    let copy: Shape;
    if (i === 0) {
      copy = base.clone();
    } else if (useArbitraryAxis) {
      copy = base.rotateAround(axis!, step * i, pivot);
    } else {
      copy = base
        .translate(-pivot[0], -pivot[1], -pivot[2])
        .rotate(0, 0, step * i)
        .translate(pivot[0], pivot[1], pivot[2]);
    }
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
export function circularPattern2d(
  sketch: Sketch,
  count: number,
  centerXOrOpts: number | { centerX?: number; centerY?: number; startDeg?: number } = 0,
  centerY: number = 0,
): Sketch {
  if (count <= 0) return sketch;
  let cx: number;
  let cy: number;
  let startDeg: number;
  if (typeof centerXOrOpts === 'object') {
    cx = centerXOrOpts.centerX ?? 0;
    cy = centerXOrOpts.centerY ?? 0;
    startDeg = centerXOrOpts.startDeg ?? 0;
  } else {
    cx = centerXOrOpts;
    cy = centerY;
    startDeg = 0;
  }
  const step = 360 / count;
  const copies: Sketch[] = [];
  for (let i = 0; i < count; i++) {
    const angle = startDeg + step * i;
    if (angle === 0) {
      copies.push(sketch);
    } else {
      // Translate to origin, rotate, translate back
      copies.push(sketch.translate(-cx, -cy).rotate(angle).translate(cx, cy));
    }
  }
  return union2d(...copies);
}

/** Mirror a shape across a plane defined by its normal and union the mirror with the original. */
export function mirrorCopy(shape: ShapeArg, normal: [number, number, number]): Shape {
  const base = unwrap(shape);
  return union(base, base.mirror(normal));
}

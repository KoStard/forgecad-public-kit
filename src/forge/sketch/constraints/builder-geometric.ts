/**
 * Geometric (non-dimensional) constraint methods for ConstrainedSketchBuilder.
 * Augments the prototype via side-effect import from index.ts.
 */
import type { SketchConstraint } from './types';
import { ConstrainedSketchBuilder } from './builder';

// Extend the class type so TypeScript sees these methods even when importing
// directly from './builder' rather than through the index barrel.
declare module './builder' {
  interface ConstrainedSketchBuilder {
    horizontal(line: any): this;
    vertical(line: any): this;
    parallel(a: any, b: any): this;
    sameDirection(a: any, b: any): this;
    oppositeDirection(a: any, b: any): this;
    blockRotation(points: any[], axis?: 'x' | 'y'): this;
    perpendicular(a: any, b: any): this;
    tangent(a: any, b: any): this;
    equal(a: any, b: any): this;
    coincident(a: any, b: any): this;
    concentric(a: any, b: any): this;
    collinear(point: any, line: any): this;
    symmetric(a: any, b: any, axis: any): this;
    fix(point: any, x?: number, y?: number): this;
    midpoint(point: any, line: any): this;
    pointOnCircle(point: any, circle: any): this;
    pointOnLine(point: any, line: any): this;
  }
}

const proto = ConstrainedSketchBuilder.prototype as any;

/** Constrain a line to be horizontal. */
proto.horizontal = function (this: any, line: any): any {
  return this.constrain({ type: 'horizontal', line: this.resolveLineId(line) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain a line to be vertical. */
proto.vertical = function (this: any, line: any): any {
  return this.constrain({ type: 'vertical', line: this.resolveLineId(line) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain two lines to be parallel. */
proto.parallel = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'parallel', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain two lines to point in the same direction (co-directional, not just parallel). */
proto.sameDirection = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'sameDirection', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain two lines to point in opposite directions (anti-parallel). */
proto.oppositeDirection = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'oppositeDirection', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
};

/**
 * Prevent 180° rotation of a polygon.
 * For rects: ensures the bottom edge points rightward (`axis: 'x'`).
 * @param points — vertex IDs in order (e.g. rect.vertices)
 * @param axis — `'x'` or `'y'`: which axis the first edge must increase along. Default `'x'`.
 */
proto.blockRotation = function (this: any, points: any[], axis: 'x' | 'y' = 'x'): any {
  const resolved = points.map((p: any) => this.resolvePointId(p));
  return this.constrain({ type: 'blockRotation', points: resolved, axis } as Omit<SketchConstraint, 'id'>);
};

/** Constrain two lines to be perpendicular. */
proto.perpendicular = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'perpendicular', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
};

/**
 * Tangent constraint.
 * - `tangent(line, circle)` — line is tangent to a circle.
 * - `tangent(circleA, circleB)` — two circles are externally tangent.
 */
proto.tangent = function (this: any, a: any, b: any): any {
  let aId: string;
  try {
    aId = this.resolveLineId(a);
    if (!this.lines.some((l: any) => l.id === aId)) throw new Error();
    return this.constrain({ type: 'tangent', line: aId, circle: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
  } catch {
    aId = this.resolveCircleId(a);
    return this.constrain({ type: 'tangent', a: aId, b: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
  }
};

/** Constrain two lines to have equal length. */
proto.equal = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'equal', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain two points to be at the same location. */
proto.coincident = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'coincident', a: this.resolvePointId(a), b: this.resolvePointId(b) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain two circles to share the same center. */
proto.concentric = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'concentric', a: this.resolveCircleId(a), b: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain a point to lie on an infinite line (collinear). */
proto.collinear = function (this: any, point: any, line: any): any {
  return this.constrain({ type: 'collinear', point: this.resolvePointId(point), line: this.resolveLineId(line) } as Omit<
    SketchConstraint,
    'id'
  >);
};

/** Constrain two points to be symmetric about an axis line. */
proto.symmetric = function (this: any, a: any, b: any, axis: any): any {
  return this.constrain({
    type: 'symmetric',
    a: this.resolvePointId(a),
    b: this.resolvePointId(b),
    axis: this.resolveLineId(axis),
  } as Omit<SketchConstraint, 'id'>);
};

/** Fix a point at a specific location (or at its current position if x/y are omitted). */
proto.fix = function (this: any, point: any, x?: number, y?: number): any {
  const ptId = this.resolvePointId(point);
  const pt = this.points.find((p: any) => p.id === ptId);
  if (!pt) throw new Error(`fix(): point "${ptId}" not found in sketch`);
  if (this.groupOwnedPointIds.has(ptId)) {
    throw new Error(
      `fix(): point "${ptId}" belongs to a group — use group.fix() to freeze the entire group frame, ` +
        `or constrain the group via coincident/distance constraints on its points.`,
    );
  }
  if (x !== undefined) this.requireFinite(x, 'fix (x)');
  if (y !== undefined) this.requireFinite(y, 'fix (y)');
  return this.constrain({ type: 'fixed', point: ptId, x: x ?? pt.x, y: y ?? pt.y } as Omit<SketchConstraint, 'id'>);
};

/** Constrain a point to lie at the midpoint of a line. */
proto.midpoint = function (this: any, point: any, line: any): any {
  return this.constrain({ type: 'midpoint', point: this.resolvePointId(point), line: this.resolveLineId(line) } as Omit<
    SketchConstraint,
    'id'
  >);
};

/** Constrain a point to lie on the perimeter of a circle. */
proto.pointOnCircle = function (this: any, point: any, circle: any): any {
  return this.constrain({ type: 'pointOnCircle', point: this.resolvePointId(point), circle: this.resolveCircleId(circle) } as Omit<
    SketchConstraint,
    'id'
  >);
};

/** Constrain a point to lie on a bounded line segment (not its infinite extension). */
proto.pointOnLine = function (this: any, point: any, line: any): any {
  return this.constrain({ type: 'pointOnLine', point: this.resolvePointId(point), line: this.resolveLineId(line) } as Omit<
    SketchConstraint,
    'id'
  >);
};

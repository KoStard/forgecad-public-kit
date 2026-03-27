/**
 * Dimensional and tangency constraint methods for ConstrainedSketchBuilder.
 * Augments the prototype via side-effect import from index.ts.
 */
import type { BezierId, SketchConstraint } from './types';
import { ConstrainedSketchBuilder } from './builder';

// Extend the class type so TypeScript sees these methods even when importing
// directly from './builder' rather than through the index barrel.
declare module './builder' {
  interface ConstrainedSketchBuilder {
    distance(a: any, b: any, value: number): this;
    length(line: any, value: number): this;
    angle(a: any, b: any, value: number): this;
    radius(circle: any, value: number): this;
    diameter(circle: any, value: number): this;
    hDistance(a: any, b: any, value: number): this;
    vDistance(a: any, b: any, value: number): this;
    pointLineDistance(point: any, line: any, value: number): this;
    lineDistance(a: any, b: any, value: number): this;
    absoluteAngle(line: any, value: number): this;
    equalRadius(a: any, b: any): this;
    arcLength(arc: any, value: number): this;
    lineTangentArc(line: any, arc: any, atStart: boolean): this;
    arcTangentArc(arcA: any, arcB: any, aAtStart?: boolean, bAtStart?: boolean): this;
    bezierTangentArc(bezier: any, arc: any, atBezierStart: boolean, atArcStart: boolean): this;
    smoothBlend(arc1: any, arc2: any, options?: { weight?: number; arc1End?: 'start' | 'end'; arc2End?: 'start' | 'end' }): BezierId;
    shapeWidth(shape: any, value: number): this;
    shapeHeight(shape: any, value: number): this;
    shapeCentroidX(shape: any, value: number): this;
    shapeCentroidY(shape: any, value: number): this;
    shapeArea(shape: any, value: number): this;
    shapeEqualCentroid(a: any, b: any): this;
    angleBetween(a: any, b: any, value: number): this;
    ccw(...points: any[]): this;
  }
}

const proto = ConstrainedSketchBuilder.prototype as any;

/** Constrain the distance between two points. */
proto.distance = function (this: any, a: any, b: any, value: number): any {
  this.requireFinite(value, 'distance');
  return this.constrain({ type: 'distance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the length of a line. */
proto.length = function (this: any, line: any, value: number): any {
  this.requireFinite(value, 'length');
  return this.constrain({ type: 'length', line: this.resolveLineId(line), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the angle from line `a` to line `b` (degrees). */
proto.angle = function (this: any, a: any, b: any, value: number): any {
  this.requireFinite(value, 'angle');
  return this.constrain({ type: 'angle', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the radius of a circle. */
proto.radius = function (this: any, circle: any, value: number): any {
  this.requireFinite(value, 'radius');
  return this.constrain({ type: 'radius', circle: this.resolveCircleId(circle), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the diameter of a circle. */
proto.diameter = function (this: any, circle: any, value: number): any {
  this.requireFinite(value, 'diameter');
  return this.constrain({ type: 'diameter', circle: this.resolveCircleId(circle), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the horizontal distance between two points (b.x − a.x = value). */
proto.hDistance = function (this: any, a: any, b: any, value: number): any {
  this.requireFinite(value, 'hDistance');
  return this.constrain({ type: 'hDistance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the vertical distance between two points (b.y − a.y = value). */
proto.vDistance = function (this: any, a: any, b: any, value: number): any {
  this.requireFinite(value, 'vDistance');
  return this.constrain({ type: 'vDistance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<SketchConstraint, 'id'>);
};

/**
 * Constrain the signed perpendicular distance from a point to a line.
 * Positive `value` places the point to the **left** of the line (a→b direction).
 * Zero is equivalent to `collinear`.
 */
proto.pointLineDistance = function (this: any, point: any, line: any, value: number): any {
  this.requireFinite(value, 'pointLineDistance');
  return this.constrain({ type: 'pointLineDistance', point: this.resolvePointId(point), line: this.resolveLineId(line), value } as Omit<
    SketchConstraint,
    'id'
  >);
};

/**
 * Constrain the perpendicular (offset) distance between two lines.
 * Also implicitly enforces parallelism.
 *
 * Positive `value` places line `b` on the **left** side of line `a`
 * (according to `a`'s direction vector). Negative places it on the right.
 */
proto.lineDistance = function (this: any, a: any, b: any, value: number): any {
  this.requireFinite(value, 'lineDistance');
  return this.constrain({ type: 'lineDistance', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the absolute angle of a line from the positive X-axis (degrees). */
proto.absoluteAngle = function (this: any, line: any, value: number): any {
  this.requireFinite(value, 'absoluteAngle');
  return this.constrain({ type: 'absoluteAngle', line: this.resolveLineId(line), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain two circles to have equal radii. */
proto.equalRadius = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'equalRadius', a: this.resolveCircleId(a), b: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the arc length of an arc (radius × sweep angle). */
proto.arcLength = function (this: any, arc: any, value: number): any {
  this.requireFinite(value, 'arcLength');
  return this.constrain({ type: 'arcLength', arc: this.resolveArcId(arc), value } as Omit<SketchConstraint, 'id'>);
};

/**
 * Constrain a line to be tangent to an arc at the arc's start (`atStart=true`) or end point.
 * Combine with `coincident` to enforce the shared endpoint.
 */
proto.lineTangentArc = function (this: any, line: any, arc: any, atStart: boolean): any {
  return this.constrain({ type: 'lineTangentArc', line: this.resolveLineId(line), arc: this.resolveArcId(arc), atStart } as Omit<
    SketchConstraint,
    'id'
  >);
};

/**
 * Constrain two arcs to be tangent (G1 smooth) at their shared junction point.
 * The radius vectors at the junction must be collinear.
 *
 * If `aAtStart`/`bAtStart` are omitted, auto-detects the shared endpoint
 * (i.e., which endpoint of arcA coincides with which endpoint of arcB).
 */
proto.arcTangentArc = function (this: any, arcA: any, arcB: any, aAtStart?: boolean, bAtStart?: boolean): any {
  const arcAId = this.resolveArcId(arcA);
  const arcBId = this.resolveArcId(arcB);

  // Auto-detect shared endpoints if not specified
  if (aAtStart === undefined || bAtStart === undefined) {
    const a = this.arcs.find((x: any) => x.id === arcAId);
    const b = this.arcs.find((x: any) => x.id === arcBId);
    const matches: Array<[boolean, boolean]> = [];
    if (a.end === b.start) matches.push([false, true]);
    if (a.end === b.end) matches.push([false, false]);
    if (a.start === b.start) matches.push([true, true]);
    if (a.start === b.end) matches.push([true, false]);
    if (matches.length === 0) {
      // Fall back to closest pair by coordinate distance
      const pts = [
        { aS: true, bS: true, dist: this.pointDist(a.start, b.start) },
        { aS: true, bS: false, dist: this.pointDist(a.start, b.end) },
        { aS: false, bS: true, dist: this.pointDist(a.end, b.start) },
        { aS: false, bS: false, dist: this.pointDist(a.end, b.end) },
      ];
      pts.sort((x: any, y: any) => x.dist - y.dist);
      aAtStart = pts[0].aS;
      bAtStart = pts[0].bS;
    } else {
      aAtStart = matches[0][0];
      bAtStart = matches[0][1];
    }
  }

  return this.constrain({ type: 'arcTangentArc', arcA: arcAId, arcB: arcBId, aAtStart, bAtStart } as Omit<SketchConstraint, 'id'>);
};

/**
 * Constrain a Bezier curve to be tangent to an arc.
 * The Bezier's tangent direction at the specified end must be perpendicular to the arc's radius.
 *
 * @param bezier — the Bezier curve
 * @param arc — the arc to be tangent to
 * @param atBezierStart — use bezier start (P0→P1 tangent) or end (P3→P2 tangent)
 * @param atArcStart — use arc's start or end as the contact point
 */
proto.bezierTangentArc = function (this: any, bezier: any, arc: any, atBezierStart: boolean, atArcStart: boolean): any {
  const bezId = this.resolveBezierId(bezier);
  const bz = this.beziers.find((b: any) => b.id === bezId);
  // Resolve to the two control points that define the tangent direction
  const tangentBase = atBezierStart ? bz.p0 : bz.p3;
  const tangentControl = atBezierStart ? bz.p1 : bz.p2;
  return this.constrain({ type: 'bezierTangentArc', tangentBase, tangentControl, arc: this.resolveArcId(arc), atArcStart } as Omit<
    SketchConstraint,
    'id'
  >);
};

/**
 * Create a smooth Bezier bridge between two arcs with controllable weight.
 *
 * The Bezier connects `arc1`'s endpoint to `arc2`'s endpoint, tangent to both arcs.
 * The `weight` parameter controls which arc's shape dominates the blend:
 *   - 0.5 = symmetric blend (default)
 *   - > 0.5 = arc1 keeps its shape longer
 *   - < 0.5 = arc2 keeps its shape longer
 *
 * Returns the BezierId of the bridge curve.
 */
proto.smoothBlend = function (
  this: any,
  arc1: any,
  arc2: any,
  options?: {
    weight?: number;
    arc1End?: 'start' | 'end';
    arc2End?: 'start' | 'end';
  },
): BezierId {
  const arc1Id = this.resolveArcId(arc1);
  const arc2Id = this.resolveArcId(arc2);
  const { weight = 0.5, arc1End = 'end', arc2End = 'start' } = options ?? {};

  const a1 = this.arcs.find((a: any) => a.id === arc1Id);
  const a2 = this.arcs.find((a: any) => a.id === arc2Id);

  // Get the junction points
  const p0Id = arc1End === 'start' ? a1.start : a1.end;
  const p3Id = arc2End === 'start' ? a2.start : a2.end;

  const pt0 = this.getPoint(p0Id);
  const pt3 = this.getPoint(p3Id);
  const c1 = this.getPoint(a1.center);
  const c2 = this.getPoint(a2.center);

  // Compute the arc's forward tangent direction at each junction point.
  const r1x = pt0.x - c1.x;
  const r1y = pt0.y - c1.y;
  const r2x = pt3.x - c2.x;
  const r2y = pt3.y - c2.y;

  // Forward tangent of each arc at its junction point
  let tf1x: number, tf1y: number;
  if (a1.clockwise) {
    tf1x = r1y;
    tf1y = -r1x;
  } else {
    tf1x = -r1y;
    tf1y = r1x;
  }

  let tf2x: number, tf2y: number;
  if (a2.clockwise) {
    tf2x = r2y;
    tf2y = -r2x;
  } else {
    tf2x = -r2y;
    tf2y = r2x;
  }

  // Bezier departure direction at P0
  const sign1 = arc1End === 'end' ? 1 : -1;
  let t1x = tf1x * sign1;
  let t1y = tf1y * sign1;

  // Bezier arrival direction at P3
  const sign2 = arc2End === 'start' ? -1 : 1;
  let t2x = tf2x * sign2;
  let t2y = tf2y * sign2;

  // Normalize tangent directions
  const len1 = Math.hypot(t1x, t1y) || 1;
  const len2 = Math.hypot(t2x, t2y) || 1;
  t1x /= len1;
  t1y /= len1;
  t2x /= len2;
  t2y /= len2;

  // Compute handle lengths based on distance and weight.
  const dx = pt3.x - pt0.x;
  const dy = pt3.y - pt0.y;
  const dist = Math.hypot(dx, dy) || 1;
  const handleBudget = dist * 0.55;

  const handle1 = handleBudget * (weight * 2);
  const handle2 = handleBudget * ((1 - weight) * 2);

  // Create control points
  const p1Id = this.point(pt0.x + t1x * handle1, pt0.y + t1y * handle1);
  const p2Id = this.point(pt3.x + t2x * handle2, pt3.y + t2y * handle2);

  // Create the Bezier curve
  const bezId = this.bezier(p0Id, p1Id, p2Id, p3Id);

  // Add tangency constraints so the solver can refine the control points
  this.bezierTangentArc(bezId, arc1Id, true, arc1End === 'start');
  this.bezierTangentArc(bezId, arc2Id, false, arc2End === 'start');

  return bezId;
};

/** Constrain the bounding-box width of a shape. */
proto.shapeWidth = function (this: any, shape: any, value: number): any {
  this.requireFinite(value, 'shapeWidth');
  return this.constrain({ type: 'shapeWidth', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the bounding-box height of a shape. */
proto.shapeHeight = function (this: any, shape: any, value: number): any {
  this.requireFinite(value, 'shapeHeight');
  return this.constrain({ type: 'shapeHeight', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the X coordinate of a shape's centroid. */
proto.shapeCentroidX = function (this: any, shape: any, value: number): any {
  this.requireFinite(value, 'shapeCentroidX');
  return this.constrain({ type: 'shapeCentroidX', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the Y coordinate of a shape's centroid. */
proto.shapeCentroidY = function (this: any, shape: any, value: number): any {
  this.requireFinite(value, 'shapeCentroidY');
  return this.constrain({ type: 'shapeCentroidY', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the area of a shape. */
proto.shapeArea = function (this: any, shape: any, value: number): any {
  this.requireFinite(value, 'shapeArea');
  return this.constrain({ type: 'shapeArea', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
};

/** Constrain two shapes to share the same centroid. */
proto.shapeEqualCentroid = function (this: any, a: any, b: any): any {
  return this.constrain({ type: 'shapeEqualCentroid', a: this.resolveShapeId(a), b: this.resolveShapeId(b) } as Omit<SketchConstraint, 'id'>);
};

/** Constrain the unsigned angle between two lines (accepts both orientations). */
proto.angleBetween = function (this: any, a: any, b: any, value: number): any {
  this.requireFinite(value, 'angleBetween');
  return this.constrain({ type: 'angleBetween', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<SketchConstraint, 'id'>);
};

/** Enforce counter-clockwise winding on a polygon defined by its vertices. */
proto.ccw = function (this: any, ...points: any[]): any {
  return this.constrain({ type: 'ccw', points: points.map((p: any) => this.resolvePointId(p)) } as Omit<SketchConstraint, 'id'>);
};

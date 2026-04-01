/**
 * Path construction and loop management methods for ConstrainedSketchBuilder.
 * Augments the prototype via side-effect import from index.ts.
 */
import type { ArcId, BezierId, LineId, PointId } from './types';
import { ConstrainedSketchBuilder } from './builder';

// Extend the class type so TypeScript sees these methods even when importing
// directly from './builder' rather than through the index barrel.
declare module './builder' {
  interface ConstrainedSketchBuilder {
    moveTo(x: number, y: number): this;
    lineTo(x: number, y: number): this;
    lineH(dx: number): this;
    lineV(dy: number): this;
    lineAngled(length: number, degrees: number): this;
    arcTo(x: number, y: number, radius: number, clockwise?: boolean): this;
    arcByCenter(centerId: PointId, startId: PointId, endId: PointId, clockwise?: boolean, name?: string): ArcId;
    bezier(p0: any, p1: any, p2: any, p3: any, name?: string): BezierId;
    bezierTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this;
    blendTo(x: number, y: number, weight?: number): this;
    close(): this;
    addLoopCircle(center: PointId, radius: number, segments?: number): this;
    addLoop(points: any[]): this;
    addProfileLoop(segments: Array<{ kind: 'line'; line: any } | { kind: 'arc'; arc: any } | { kind: 'bezier'; bezier: any }>): this;
  }
}

const proto = ConstrainedSketchBuilder.prototype as any;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

proto.moveTo = function (this: any, x: number, y: number): any {
  const id = this.point(x, y);
  this.cursor = id;
  this.loopStart = id;
  this.loops.push({ type: 'profile', segments: [] });
  return this;
};

proto.lineTo = function (this: any, x: number, y: number): any {
  if (!this.cursor) return this.moveTo(x, y);
  const id = this.point(x, y);
  const lineId = this.line(this.cursor, id);
  const loop = this.loops[this.loops.length - 1];
  if (loop?.type === 'profile') loop.segments.push({ kind: 'line', line: lineId });
  this.cursor = id;
  return this;
};

proto.lineH = function (this: any, dx: number): any {
  const cursorPt = this.getPoint(this.cursor);
  if (!cursorPt) return this;
  return this.lineTo(cursorPt.x + dx, cursorPt.y);
};

proto.lineV = function (this: any, dy: number): any {
  const cursorPt = this.getPoint(this.cursor);
  if (!cursorPt) return this;
  return this.lineTo(cursorPt.x, cursorPt.y + dy);
};

proto.lineAngled = function (this: any, length: number, degrees: number): any {
  const cursorPt = this.getPoint(this.cursor);
  if (!cursorPt) return this;
  const rad = toRad(degrees);
  return this.lineTo(cursorPt.x + Math.cos(rad) * length, cursorPt.y + Math.sin(rad) * length);
};

/**
 * Draw a circular arc from the current cursor position to (x, y) with the given radius.
 * If `clockwise` is true the arc sweeps clockwise; otherwise counter-clockwise.
 * The arc center is computed automatically.
 */
proto.arcTo = function (this: any, x: number, y: number, radius: number, clockwise = false): any {
  if (!this.cursor) return this.moveTo(x, y);
  const endId = this.point(x, y);
  const arcId = this.addArc(this.cursor, endId, radius, clockwise);
  const loop = this.loops[this.loops.length - 1];
  if (loop?.type === 'profile') loop.segments.push({ kind: 'arc', arc: arcId });
  this.cursor = endId;
  this.lastPathArc = arcId;
  return this;
};

/**
 * Create an arc from an explicit center point.
 * `start` and `end` are existing PointIds that must lie on the arc's circle.
 * Returns the ArcId. Does NOT advance the cursor.
 */
proto.arcByCenter = function (this: any, centerId: any, startId: any, endId: any, clockwise = false, name?: string): ArcId {
  const center = this.getPoint(centerId);
  const start = this.getPoint(startId);
  if (!center || !start) throw new Error('arcByCenter: invalid point IDs');
  const radius = Math.hypot(start.x - center.x, start.y - center.y);
  const id: ArcId = `arc-${this.nextId++}`;
  this.arcs.push({ id, center: centerId, start: startId, end: endId, radius, clockwise, construction: false, name });
  if (this._sessionHandle !== null) {
    this._sessionApi.session_add_arc(this._sessionHandle, id, centerId, startId, endId, radius, clockwise);
  }
  return id;
};

/**
 * Create a cubic Bezier curve from four control points.
 * Returns the BezierId. Does NOT advance the cursor.
 */
proto.bezier = function (this: any, p0: any, p1: any, p2: any, p3: any, name?: string): any {
  const p0Id = this.resolvePointId(p0);
  const p1Id = this.resolvePointId(p1);
  const p2Id = this.resolvePointId(p2);
  const p3Id = this.resolvePointId(p3);
  const id = `bez-${this.nextId++}`;
  this.beziers.push({ id, p0: p0Id, p1: p1Id, p2: p2Id, p3: p3Id, construction: false, name });
  return id;
};

/**
 * Draw a Bezier curve from the current cursor to (x3, y3) with control points (x1, y1) and (x2, y2).
 * The cursor becomes the Bezier's P0; the end point becomes the new cursor.
 */
proto.bezierTo = function (this: any, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): any {
  if (!this.cursor) return this;
  const cp1 = this.point(x1, y1);
  const cp2 = this.point(x2, y2);
  const endPt = this.point(x3, y3);
  const bezId = this.bezier(this.cursor, cp1, cp2, endPt);
  const loop = this.loops[this.loops.length - 1];
  if (loop?.type === 'profile') loop.segments.push({ kind: 'bezier', bezier: bezId });
  this.cursor = endPt;
  return this;
};

/**
 * Draw a smooth Bezier curve from the current cursor to (x, y), tangent to
 * the previous arc. The cursor must be on the end of a previous `arcTo()`.
 *
 * Unlike `bezierTo()`, control points are computed automatically from the
 * arc's tangent direction — no manual control point placement needed.
 *
 * @param weight — 0–1, controls how long the arc's shape is preserved.
 *                 Higher = arc dominates longer. Default 0.5.
 */
proto.blendTo = function (this: any, x: number, y: number, weight = 0.5): any {
  if (!this.cursor || !this.lastPathArc) {
    throw new Error('blendTo: cursor must be on the end of a previous arcTo() call');
  }

  const arc = this.arcs.find((a: any) => a.id === this.lastPathArc);
  const pt0 = this.getPoint(this.cursor);
  const center = this.getPoint(arc.center);

  // Arc tangent at the departure point
  const rx = pt0.x - center.x;
  const ry = pt0.y - center.y;
  let tx: number, ty: number;
  if (arc.clockwise) {
    tx = ry;
    ty = -rx;
  } else {
    tx = -ry;
    ty = rx;
  }
  const tLen = Math.hypot(tx, ty) || 1;
  tx /= tLen;
  ty /= tLen;

  const endPt = this.point(x, y);
  const pt3 = this.getPoint(endPt);
  const dx = pt3.x - pt0.x;
  const dy = pt3.y - pt0.y;
  const dist = Math.hypot(dx, dy) || 1;

  // Handle lengths: departure side uses weight, arrival uses (1-weight)
  const handleBudget = dist * 0.55;
  const h1 = handleBudget * (weight * 2);
  const h2 = handleBudget * ((1 - weight) * 2);

  // P1: departure control point, tangent to the arc
  const p1 = this.point(pt0.x + tx * h1, pt0.y + ty * h1);

  // P2: arrival control point, aimed back along the chord toward P0
  const ndx = dx / dist,
    ndy = dy / dist;
  const p2 = this.point(pt3.x - ndx * h2, pt3.y - ndy * h2);

  const bezId = this.bezier(this.cursor, p1, p2, endPt);
  this.bezierTangentArc(bezId, this.lastPathArc, true, false);

  const loop = this.loops[this.loops.length - 1];
  if (loop?.type === 'profile') loop.segments.push({ kind: 'bezier', bezier: bezId });
  this.cursor = endPt;
  this.lastPathArc = null;
  return this;
};

proto.close = function (this: any): any {
  if (!this.cursor || !this.loopStart || this.cursor === this.loopStart) return this;
  const lineId = this.line(this.cursor, this.loopStart);
  const loop = this.loops[this.loops.length - 1];
  if (loop?.type === 'profile') loop.segments.push({ kind: 'line', line: lineId });
  this.cursor = this.loopStart;
  return this;
};

proto.addLoopCircle = function (this: any, center: any, radius: number, segments = 48): any {
  this.circle(center, radius, false, segments);
  return this;
};

/**
 * Register a closed polygon loop from an explicit ordered list of point IDs.
 */
proto.addLoop = function (this: any, points: any[]): any {
  if (points.length < 3) throw new Error('addLoop(): needs at least 3 points');
  this.loops.push({ type: 'poly', points: points.map((p: any) => this.resolvePointId(p)) });
  return this;
};

/**
 * Register a closed profile loop from an explicit ordered list of segments.
 * Each segment is { kind: 'line', line: LineId }, { kind: 'arc', arc: ArcId },
 * or { kind: 'bezier', bezier: BezierId }.
 */
proto.addProfileLoop = function (
  this: any,
  segments: Array<{ kind: 'line'; line: any } | { kind: 'arc'; arc: any } | { kind: 'bezier'; bezier: any }>,
): any {
  const resolved = segments.map((seg: any) => {
    if (seg.kind === 'line') return { kind: 'line' as const, line: this.resolveLineId(seg.line) };
    if (seg.kind === 'arc') return { kind: 'arc' as const, arc: this.resolveArcId(seg.arc) };
    return { kind: 'bezier' as const, bezier: this.resolveBezierId(seg.bezier) };
  });
  this.loops.push({ type: 'profile', segments: resolved });
  return this;
};

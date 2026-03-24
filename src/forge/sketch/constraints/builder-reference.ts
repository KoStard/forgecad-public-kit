/**
 * Import and reference geometry methods for ConstrainedSketchBuilder.
 * Augments the prototype via side-effect import from index.ts.
 */
import type { LineId, PointId } from './types';
import type { ConstraintSketch } from './sketch';
import { ConstrainedSketchBuilder } from './builder';

// Extend the class type so TypeScript sees these methods even when importing
// directly from './builder' rather than through the index barrel.
declare module './builder' {
  interface ConstrainedSketchBuilder {
    importPoint(pt: { x: number; y: number }, fixed?: boolean): PointId;
    importLine(l: { start: { x: number; y: number }; end: { x: number; y: number } }, fixed?: boolean): LineId;
    importRectangle(
      r: { vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] },
      fixed?: boolean,
    ): { bottom: LineId; right: LineId; top: LineId; left: LineId; points: [PointId, PointId, PointId, PointId] };
    referencePoint(x: number, y: number): PointId;
    referenceLine(x1: number, y1: number, x2: number, y2: number): LineId;
    referenceFrom(source: ConstraintSketch, entityId: string): PointId | LineId | null;
    referenceAllFrom(source: ConstraintSketch): { points: Map<string, PointId>; lines: Map<string, LineId> };
  }
}

const proto = ConstrainedSketchBuilder.prototype as any;

/** Import a Point2D, returning its PointId */
proto.importPoint = function (this: any, pt: { x: number; y: number }, fixed = false): PointId {
  return this.point(pt.x, pt.y, fixed);
};

/** Import a Line2D (two points + line), returning its LineId */
proto.importLine = function (this: any, l: { start: { x: number; y: number }; end: { x: number; y: number } }, fixed = false): LineId {
  const a = this.importPoint(l.start, fixed);
  const b = this.importPoint(l.end, fixed);
  return this.line(a, b);
};

/** Import a Rectangle2D as 4 points + 4 lines, returning side LineIds keyed by name */
proto.importRectangle = function (
  this: any,
  r: {
    vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  },
  fixed = false,
): { bottom: LineId; right: LineId; top: LineId; left: LineId; points: [PointId, PointId, PointId, PointId] } {
  const [bl, br, tr, tl] = r.vertices.map((v: { x: number; y: number }) => this.importPoint(v, fixed)) as [PointId, PointId, PointId, PointId];
  return {
    bottom: this.line(bl, br),
    right: this.line(br, tr),
    top: this.line(tr, tl),
    left: this.line(tl, bl),
    points: [bl, br, tr, tl],
  };
};

/**
 * Add a fixed reference point at (x, y).
 */
proto.referencePoint = function (this: any, x: number, y: number): PointId {
  const id = `ref-pt-${this.nextId++}`;
  this.points.push({ id, x, y, fixed: true });
  return id;
};

/**
 * Add a fixed reference line from (x1, y1) to (x2, y2).
 */
proto.referenceLine = function (this: any, x1: number, y1: number, x2: number, y2: number): LineId {
  const a = this.referencePoint(x1, y1);
  const b = this.referencePoint(x2, y2);
  const id = `ref-ln-${this.nextId++}`;
  this.lines.push({ id, a, b, construction: true });
  return id;
};

/**
 * Import a single named entity (point or line) from a solved `ConstraintSketch`
 * as fixed reference geometry in this builder.
 */
proto.referenceFrom = function (this: any, source: ConstraintSketch, entityId: string): PointId | LineId | null {
  const srcPoint = source.definition.points.find((p: any) => p.id === entityId);
  if (srcPoint) {
    return this.referencePoint(srcPoint.x, srcPoint.y);
  }
  const srcLine = source.definition.lines.find((l: any) => l.id === entityId);
  if (srcLine) {
    const srcA = source.definition.points.find((p: any) => p.id === srcLine.a);
    const srcB = source.definition.points.find((p: any) => p.id === srcLine.b);
    if (srcA && srcB) {
      return this.referenceLine(srcA.x, srcA.y, srcB.x, srcB.y);
    }
  }
  return null;
};

/**
 * Import ALL non-construction entities from a solved `ConstraintSketch` as
 * fixed reference geometry.
 */
proto.referenceAllFrom = function (this: any, source: ConstraintSketch): { points: Map<string, PointId>; lines: Map<string, LineId> } {
  const pointMap = new Map<string, PointId>();
  const lineMap = new Map<string, LineId>();

  for (const p of source.definition.points) {
    pointMap.set(p.id, this.referencePoint(p.x, p.y));
  }

  for (const l of source.definition.lines) {
    if (l.construction) continue;
    const aId = pointMap.get(l.a);
    const bId = pointMap.get(l.b);
    if (!aId || !bId) continue;
    const newLineId = `ref-ln-${this.nextId++}`;
    this.lines.push({ id: newLineId, a: aId, b: bId, construction: true });
    lineMap.set(l.id, newLineId);
  }

  return { points: pointMap, lines: lineMap };
};

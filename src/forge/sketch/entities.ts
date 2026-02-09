/**
 * Named 2D Geometric Entities
 *
 * First-class Point, Line, Rectangle objects with stable identity
 * and named parts (sides, vertices). These bridge the gap between
 * raw coordinate-based primitives and the constraint system.
 */

import { Sketch } from './core';
import { polygon } from './primitives';
import { sketchExtrude } from './extrude';
import { ConstrainedSketchBuilder, type PointId, type LineId } from './constraints';
import { TrackedShape, buildRectExtrusionTopology } from './topology';

// ─── Point ───────────────────────────────────────────────────────

export class Point2D {
  constructor(public readonly x: number, public readonly y: number) {}

  distanceTo(other: Point2D): number {
    const dx = other.x - this.x;
    const dy = other.y - this.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  midpointTo(other: Point2D): Point2D {
    return new Point2D((this.x + other.x) / 2, (this.y + other.y) / 2);
  }

  translate(dx: number, dy: number): Point2D {
    return new Point2D(this.x + dx, this.y + dy);
  }

  toTuple(): [number, number] {
    return [this.x, this.y];
  }
}

export function point(x: number, y: number): Point2D {
  return new Point2D(x, y);
}

// ─── Line ────────────────────────────────────────────────────────

export class Line2D {
  constructor(
    public readonly start: Point2D,
    public readonly end: Point2D,
  ) {}

  get length(): number {
    return this.start.distanceTo(this.end);
  }

  get midpoint(): Point2D {
    return this.start.midpointTo(this.end);
  }

  get angle(): number {
    return Math.atan2(this.end.y - this.start.y, this.end.x - this.start.x) * (180 / Math.PI);
  }

  get direction(): [number, number] {
    const len = this.length || 1;
    return [(this.end.x - this.start.x) / len, (this.end.y - this.start.y) / len];
  }

  /** Create a line parallel to this one, offset by distance. positive = left of direction */
  parallel(distance: number): Line2D {
    const [dx, dy] = this.direction;
    const nx = -dy * distance;
    const ny = dx * distance;
    return new Line2D(
      this.start.translate(nx, ny),
      this.end.translate(nx, ny),
    );
  }

  static fromCoordinates(x1: number, y1: number, x2: number, y2: number): Line2D {
    return new Line2D(new Point2D(x1, y1), new Point2D(x2, y2));
  }

  static fromPointAndAngle(origin: Point2D, angleDeg: number, length: number): Line2D {
    const rad = angleDeg * (Math.PI / 180);
    return new Line2D(origin, new Point2D(
      origin.x + Math.cos(rad) * length,
      origin.y + Math.sin(rad) * length,
    ));
  }

  static fromPointAndDirection(origin: Point2D, dir: [number, number], length: number): Line2D {
    const len = Math.sqrt(dir[0] * dir[0] + dir[1] * dir[1]) || 1;
    return new Line2D(origin, new Point2D(
      origin.x + (dir[0] / len) * length,
      origin.y + (dir[1] / len) * length,
    ));
  }
}

export function line(x1: number, y1: number, x2: number, y2: number): Line2D {
  return Line2D.fromCoordinates(x1, y1, x2, y2);
}

// ─── Rectangle ───────────────────────────────────────────────────

export type RectSide = 'top' | 'bottom' | 'left' | 'right';
export type RectVertex = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

/**
 * A rectangle with named sides and vertices.
 * Sides are named based on the rectangle's local orientation at construction time.
 * Vertices go: bottom-left, bottom-right, top-right, top-left (CCW from bottom-left).
 */
export class Rectangle2D {
  /** Vertices in order: bottom-left, bottom-right, top-right, top-left */
  public readonly vertices: [Point2D, Point2D, Point2D, Point2D];

  constructor(vertices: [Point2D, Point2D, Point2D, Point2D]) {
    this.vertices = vertices;
  }

  get width(): number {
    return this.vertices[0].distanceTo(this.vertices[1]);
  }

  get height(): number {
    return this.vertices[1].distanceTo(this.vertices[2]);
  }

  get center(): Point2D {
    return this.vertices[0].midpointTo(this.vertices[2]);
  }

  side(name: RectSide): Line2D {
    const [bl, br, tr, tl] = this.vertices;
    switch (name) {
      case 'bottom': return new Line2D(bl, br);
      case 'right': return new Line2D(br, tr);
      case 'top': return new Line2D(tr, tl);
      case 'left': return new Line2D(tl, bl);
    }
  }

  /** Get side by index (0=bottom, 1=right, 2=top, 3=left) */
  sideAt(index: number): Line2D {
    const sides: RectSide[] = ['bottom', 'right', 'top', 'left'];
    return this.side(sides[index % 4]);
  }

  vertex(name: RectVertex): Point2D {
    const [bl, br, tr, tl] = this.vertices;
    switch (name) {
      case 'bottom-left': return bl;
      case 'bottom-right': return br;
      case 'top-right': return tr;
      case 'top-left': return tl;
    }
  }

  toSketch(): Sketch {
    return polygon(this.vertices.map(v => v.toTuple()));
  }

  translate(dx: number, dy: number): Rectangle2D {
    return new Rectangle2D(
      this.vertices.map(v => v.translate(dx, dy)) as [Point2D, Point2D, Point2D, Point2D],
    );
  }

  /** Create from origin corner + width/height (axis-aligned) */
  static fromDimensions(x: number, y: number, width: number, height: number): Rectangle2D {
    return new Rectangle2D([
      new Point2D(x, y),
      new Point2D(x + width, y),
      new Point2D(x + width, y + height),
      new Point2D(x, y + height),
    ]);
  }

  /** Create centered at a point */
  static fromCenterAndDimensions(center: Point2D, width: number, height: number): Rectangle2D {
    const hw = width / 2;
    const hh = height / 2;
    return new Rectangle2D([
      new Point2D(center.x - hw, center.y - hh),
      new Point2D(center.x + hw, center.y - hh),
      new Point2D(center.x + hw, center.y + hh),
      new Point2D(center.x - hw, center.y + hh),
    ]);
  }

  /** Create from two opposite corners (axis-aligned) */
  static from2Corners(p1: Point2D, p2: Point2D): Rectangle2D {
    const minX = Math.min(p1.x, p2.x);
    const maxX = Math.max(p1.x, p2.x);
    const minY = Math.min(p1.y, p2.y);
    const maxY = Math.max(p1.y, p2.y);
    return new Rectangle2D([
      new Point2D(minX, minY),
      new Point2D(maxX, minY),
      new Point2D(maxX, maxY),
      new Point2D(minX, maxY),
    ]);
  }

  /** Create from three points (free angle). p1-p2 defines one side, p3 gives the height direction. */
  static from3Points(p1: Point2D, p2: Point2D, p3: Point2D): Rectangle2D {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Project p3 onto the perpendicular of p1-p2
    const nx = -uy;
    const ny = ux;
    const proj = (p3.x - p1.x) * nx + (p3.y - p1.y) * ny;
    return new Rectangle2D([
      p1,
      p2,
      new Point2D(p2.x + nx * proj, p2.y + ny * proj),
      new Point2D(p1.x + nx * proj, p1.y + ny * proj),
    ]);
  }

  /** Extrude this rectangle into a 3D TrackedShape with named faces and edges */
  extrude(height: number, up = true): TrackedShape {
    const sketch = this.toSketch();
    const shape = sketchExtrude(sketch, height);
    const topology = buildRectExtrusionTopology(this, height, up);
    return new TrackedShape(shape, topology, height, up);
  }
}

export function rectangle(x: number, y: number, width: number, height: number): Rectangle2D {
  return Rectangle2D.fromDimensions(x, y, width, height);
}

/** Convert degrees to degrees (identity — for readability in scripts) */
export function degrees(deg: number): number {
  return deg;
}

/** Convert radians to degrees */
export function radians(rad: number): number {
  return rad * (180 / Math.PI);
}

// ─── Constraint helpers (global functions) ───────────────────────

/**
 * Constraint namespace — declarative constraint functions.
 * These work with the ConstrainedSketchBuilder under the hood.
 */
export const Constraint = {
  /** Make two lines parallel */
  makeParallel(builder: ConstrainedSketchBuilder, lineA: LineId, lineB: LineId) {
    return builder.constrain({ type: 'parallel', a: lineA, b: lineB } as any);
  },

  /** Enforce a specific angle between two lines */
  enforceAngle(builder: ConstrainedSketchBuilder, lineA: LineId, lineB: LineId, angleDeg: number) {
    return builder.constrain({ type: 'angle', a: lineA, b: lineB, value: angleDeg } as any);
  },

  /** Make a line horizontal */
  horizontal(builder: ConstrainedSketchBuilder, lineId: LineId) {
    return builder.constrain({ type: 'horizontal', line: lineId } as any);
  },

  /** Make a line vertical */
  vertical(builder: ConstrainedSketchBuilder, lineId: LineId) {
    return builder.constrain({ type: 'vertical', line: lineId } as any);
  },

  /** Make two lines equal length */
  equalLength(builder: ConstrainedSketchBuilder, lineA: LineId, lineB: LineId) {
    return builder.constrain({ type: 'equal', a: lineA, b: lineB } as any);
  },

  /** Set distance between two points */
  distance(builder: ConstrainedSketchBuilder, ptA: PointId, ptB: PointId, value: number) {
    return builder.constrain({ type: 'distance', a: ptA, b: ptB, value } as any);
  },

  /** Fix a point at coordinates */
  fix(builder: ConstrainedSketchBuilder, ptId: PointId, x: number, y: number) {
    return builder.constrain({ type: 'fixed', point: ptId, x, y } as any);
  },

  /** Make two points coincident */
  coincident(builder: ConstrainedSketchBuilder, ptA: PointId, ptB: PointId) {
    return builder.constrain({ type: 'coincident', a: ptA, b: ptB } as any);
  },

  /** Make two lines perpendicular */
  perpendicular(builder: ConstrainedSketchBuilder, lineA: LineId, lineB: LineId) {
    return builder.constrain({ type: 'perpendicular', a: lineA, b: lineB } as any);
  },

  /** Set line length */
  length(builder: ConstrainedSketchBuilder, lineId: LineId, value: number) {
    return builder.constrain({ type: 'length', line: lineId, value } as any);
  },
};

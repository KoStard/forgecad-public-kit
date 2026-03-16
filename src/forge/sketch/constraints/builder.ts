import type {
  CircleId,
  ConstraintBuilderMethods,
  ConstraintDefinition,
  LineId,
  PointId,
  SketchCircle,
  SketchConstraint,
  SketchLine,
  SketchLoop,
  SketchPoint,
  SolveOptions,
} from './types';
import { DEFAULT_TOLERANCE, getPendingBuilderMethods, solveConstraints } from './registry';
import { ConstraintSketch, solveConstraintDefinition } from './sketch';

const toRad = (deg: number): number => (deg * Math.PI) / 180;

export interface ConstrainedSketchOptions {
  /** When true, adding a constraint that cannot be satisfied throws instead of silently discarding it. */
  strict?: boolean;
}

// The interface merge makes TypeScript see all installed builder methods on the class.
export interface ConstrainedSketchBuilder extends ConstraintBuilderMethods {}

export class ConstrainedSketchBuilder {
  private points: SketchPoint[] = [];
  private lines: SketchLine[] = [];
  private circles: SketchCircle[] = [];
  private constraints: SketchConstraint[] = [];
  private loops: SketchLoop[] = [];
  private rejectedConstraints: SketchConstraint[] = [];
  private cursor: PointId | null = null;
  private loopStart: PointId | null = null;
  private nextId = 1;
  private strict: boolean;

  constructor(options: ConstrainedSketchOptions = {}) {
    this.strict = options.strict ?? false;
    // Install any builder methods registered before this instance was created.
    const pending = getPendingBuilderMethods();
    pending.forEach((fn, type) => {
      const proto = ConstrainedSketchBuilder.prototype as unknown as Record<string, unknown>;
      if (!proto[type]) {
        proto[type] = fn;
      }
    });
  }

  point(x: number, y: number, fixed = false): PointId {
    const id = `pt-${this.nextId++}`;
    this.points.push({ id, x, y, fixed });
    return id;
  }

  pointAt(index: number): PointId {
    const pt = this.points[index];
    if (!pt) throw new Error(`Point index ${index} out of range`);
    return pt.id;
  }

  line(a: PointId, b: PointId, construction = false): LineId {
    const id = `ln-${this.nextId++}`;
    this.lines.push({ id, a, b, construction });
    return id;
  }

  lineAt(index: number): LineId {
    const line = this.lines[index];
    if (!line) throw new Error(`Line index ${index} out of range`);
    return line.id;
  }

  circle(center: PointId, radius: number, construction = false, segments = 48): CircleId {
    const id = `c-${this.nextId++}`;
    this.circles.push({ id, center, radius, construction, fixedRadius: false, segments });
    if (!construction) {
      this.loops.push({ type: 'circle', circle: id });
    }
    return id;
  }

  circleAt(index: number): CircleId {
    const circle = this.circles[index];
    if (!circle) throw new Error(`Circle index ${index} out of range`);
    return circle.id;
  }

  moveTo(x: number, y: number): this {
    const id = this.point(x, y);
    this.cursor = id;
    this.loopStart = id;
    this.loops.push({ type: 'poly', points: [id] });
    return this;
  }

  lineTo(x: number, y: number): this {
    if (!this.cursor) return this.moveTo(x, y);
    const id = this.point(x, y);
    this.line(this.cursor, id);
    const loop = this.loops[this.loops.length - 1];
    if (loop && loop.type === 'poly') loop.points.push(id);
    this.cursor = id;
    return this;
  }

  lineH(dx: number): this {
    const cursorPt = this.getPoint(this.cursor);
    if (!cursorPt) return this;
    return this.lineTo(cursorPt.x + dx, cursorPt.y);
  }

  lineV(dy: number): this {
    const cursorPt = this.getPoint(this.cursor);
    if (!cursorPt) return this;
    return this.lineTo(cursorPt.x, cursorPt.y + dy);
  }

  lineAngled(length: number, degrees: number): this {
    const cursorPt = this.getPoint(this.cursor);
    if (!cursorPt) return this;
    const rad = toRad(degrees);
    return this.lineTo(cursorPt.x + Math.cos(rad) * length, cursorPt.y + Math.sin(rad) * length);
  }

  close(): this {
    if (!this.cursor || !this.loopStart || this.cursor === this.loopStart) return this;
    this.line(this.cursor, this.loopStart);
    this.cursor = this.loopStart;
    return this;
  }

  addLoopCircle(center: PointId, radius: number, segments = 48): this {
    this.circle(center, radius, false, segments);
    return this;
  }

  constrain(constraint: Omit<SketchConstraint, 'id'>): this {
    const id = `cst-${this.nextId++}`;
    const next = { ...constraint, id } as SketchConstraint;
    const def = this.buildDefinition(next);
    const { maxError } = solveConstraints(def, { iterations: 30, tolerance: DEFAULT_TOLERANCE });
    if (maxError > DEFAULT_TOLERANCE * 5) {
      if (this.strict) {
        throw new Error(
          `Constraint rejected (over-constrained or conflicting): type="${constraint.type}" maxError=${maxError.toFixed(4)}. `
          + `The sketch already has ${this.constraints.length} constraint(s). `
          + `Remove a conflicting constraint or relax the geometry.`,
        );
      }
      this.rejectedConstraints.push(next);
      return this;
    }
    if (next.type === 'fixed') {
      const c = next as unknown as { point: PointId; x: number; y: number };
      const pt = this.points.find((p) => p.id === c.point);
      if (pt) {
        pt.fixed = true;
        pt.x = c.x;
        pt.y = c.y;
      }
    }
    this.constraints.push(next);
    return this;
  }

  // ─── Ergonomic constraint helpers ────────────────────────────────────────────

  /** Constrain a line to be horizontal. */
  horizontal(line: LineId): this {
    return this.constrain({ type: 'horizontal', line } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a line to be vertical. */
  vertical(line: LineId): this {
    return this.constrain({ type: 'vertical', line } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two lines to be parallel. */
  parallel(a: LineId, b: LineId): this {
    return this.constrain({ type: 'parallel', a, b } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two lines to be perpendicular. */
  perpendicular(a: LineId, b: LineId): this {
    return this.constrain({ type: 'perpendicular', a, b } as Omit<SketchConstraint, 'id'>);
  }

  /**
   * Tangent constraint.
   * - `tangent(line, circle)` — line is tangent to a circle.
   * - `tangent(circleA, circleB)` — two circles are externally tangent.
   */
  tangent(a: LineId | CircleId, b: CircleId): this {
    const aIsLine = this.lines.some((l) => l.id === a);
    if (aIsLine) {
      return this.constrain({ type: 'tangent', line: a as LineId, circle: b } as Omit<SketchConstraint, 'id'>);
    }
    return this.constrain({ type: 'tangent', a: a as CircleId, b } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two lines to have equal length. */
  equal(a: LineId, b: LineId): this {
    return this.constrain({ type: 'equal', a, b } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two points to be at the same location. */
  coincident(a: PointId, b: PointId): this {
    return this.constrain({ type: 'coincident', a, b } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two circles to share the same center. */
  concentric(a: CircleId, b: CircleId): this {
    return this.constrain({ type: 'concentric', a, b } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a point to lie on an infinite line (collinear). */
  collinear(point: PointId, line: LineId): this {
    return this.constrain({ type: 'collinear', point, line } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two points to be symmetric about an axis line. */
  symmetric(a: PointId, b: PointId, axis: LineId): this {
    return this.constrain({ type: 'symmetric', a, b, axis } as Omit<SketchConstraint, 'id'>);
  }

  /** Fix a point at a specific location (or at its current position if x/y are omitted). */
  fix(point: PointId, x?: number, y?: number): this {
    const pt = this.points.find((p) => p.id === point);
    if (!pt) throw new Error(`fix(): point "${point}" not found in sketch`);
    return this.constrain({ type: 'fixed', point, x: x ?? pt.x, y: y ?? pt.y } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a point to lie at the midpoint of a line. */
  midpoint(point: PointId, line: LineId): this {
    return this.constrain({ type: 'midpoint', point, line } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a point to lie on the perimeter of a circle. */
  pointOnCircle(point: PointId, circle: CircleId): this {
    return this.constrain({ type: 'pointOnCircle', point, circle } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the distance between two points. */
  distance(a: PointId, b: PointId, value: number): this {
    return this.constrain({ type: 'distance', a, b, value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the length of a line. */
  length(line: LineId, value: number): this {
    return this.constrain({ type: 'length', line, value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the angle from line `a` to line `b` (degrees). */
  angle(a: LineId, b: LineId, value: number): this {
    return this.constrain({ type: 'angle', a, b, value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the radius of a circle. */
  radius(circle: CircleId, value: number): this {
    return this.constrain({ type: 'radius', circle, value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the diameter of a circle. */
  diameter(circle: CircleId, value: number): this {
    return this.constrain({ type: 'diameter', circle, value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the horizontal distance between two points (b.x − a.x = value). */
  hDistance(a: PointId, b: PointId, value: number): this {
    return this.constrain({ type: 'hDistance', a, b, value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the vertical distance between two points (b.y − a.y = value). */
  vDistance(a: PointId, b: PointId, value: number): this {
    return this.constrain({ type: 'vDistance', a, b, value } as Omit<SketchConstraint, 'id'>);
  }

  /**
   * Constrain the perpendicular (offset) distance between two lines.
   * Also implicitly enforces parallelism.
   *
   * Positive `value` places line `b` on the **left** side of line `a`
   * (according to `a`'s direction vector). Negative places it on the right.
   */
  lineDistance(a: LineId, b: LineId, value: number): this {
    return this.constrain({ type: 'lineDistance', a, b, value } as Omit<SketchConstraint, 'id'>);
  }

  // ─── Loop helpers ──────────────────────────────────────────────────────────

  /**
   * Register a closed polygon loop from an explicit ordered list of point IDs.
   */
  addLoop(points: PointId[]): this {
    if (points.length < 3) throw new Error('addLoop(): needs at least 3 points');
    this.loops.push({ type: 'poly', points: [...points] });
    return this;
  }

  solve(options: SolveOptions = {}): ConstraintSketch {
    return solveConstraintDefinition(this.buildDefinition(), options);
  }

  private buildDefinition(extraConstraint?: SketchConstraint): ConstraintDefinition {
    return {
      points: this.points.map((p) => ({ ...p })),
      lines: this.lines.map((l) => ({ ...l })),
      circles: this.circles.map((c) => ({ ...c })),
      loops: this.loops.map((loop) =>
        loop.type === 'poly'
          ? { type: 'poly', points: [...loop.points] }
          : { type: 'circle', circle: loop.circle },
      ),
      constraints: extraConstraint ? [...this.constraints, extraConstraint] : [...this.constraints],
      rejectedConstraints: [...this.rejectedConstraints],
    };
  }

  private getPoint(id: PointId | null): SketchPoint | null {
    if (!id) return null;
    return this.points.find((p) => p.id === id) ?? null;
  }

  /** Import a Point2D, returning its PointId */
  importPoint(pt: { x: number; y: number }, fixed = false): PointId {
    return this.point(pt.x, pt.y, fixed);
  }

  /** Import a Line2D (two points + line), returning its LineId */
  importLine(l: { start: { x: number; y: number }; end: { x: number; y: number } }, fixed = false): LineId {
    const a = this.importPoint(l.start, fixed);
    const b = this.importPoint(l.end, fixed);
    return this.line(a, b);
  }

  /** Import a Rectangle2D as 4 points + 4 lines, returning side LineIds keyed by name */
  importRectangle(r: {
    vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
  }, fixed = false): { bottom: LineId; right: LineId; top: LineId; left: LineId; points: [PointId, PointId, PointId, PointId] } {
    const [bl, br, tr, tl] = r.vertices.map((v) => this.importPoint(v, fixed)) as [PointId, PointId, PointId, PointId];
    return {
      bottom: this.line(bl, br),
      right: this.line(br, tr),
      top: this.line(tr, tl),
      left: this.line(tl, bl),
      points: [bl, br, tr, tl],
    };
  }

  // ─── Cross-sketch reference geometry ───────────────────────────────────────

  /**
   * Add a fixed reference point at (x, y).
   */
  referencePoint(x: number, y: number): PointId {
    const id = `ref-pt-${this.nextId++}`;
    this.points.push({ id, x, y, fixed: true });
    return id;
  }

  /**
   * Add a fixed reference line from (x1, y1) to (x2, y2).
   */
  referenceLine(x1: number, y1: number, x2: number, y2: number): LineId {
    const a = this.referencePoint(x1, y1);
    const b = this.referencePoint(x2, y2);
    const id = `ref-ln-${this.nextId++}`;
    this.lines.push({ id, a, b, construction: true });
    return id;
  }

  /**
   * Import a single named entity (point or line) from a solved `ConstraintSketch`
   * as fixed reference geometry in this builder.
   */
  referenceFrom(source: ConstraintSketch, entityId: string): PointId | LineId | null {
    const srcPoint = source.definition.points.find((p) => p.id === entityId);
    if (srcPoint) {
      return this.referencePoint(srcPoint.x, srcPoint.y);
    }
    const srcLine = source.definition.lines.find((l) => l.id === entityId);
    if (srcLine) {
      const srcA = source.definition.points.find((p) => p.id === srcLine.a);
      const srcB = source.definition.points.find((p) => p.id === srcLine.b);
      if (srcA && srcB) {
        return this.referenceLine(srcA.x, srcA.y, srcB.x, srcB.y);
      }
    }
    return null;
  }

  /**
   * Import ALL non-construction entities from a solved `ConstraintSketch` as
   * fixed reference geometry.
   */
  referenceAllFrom(
    source: ConstraintSketch,
  ): { points: Map<string, PointId>; lines: Map<string, LineId> } {
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
  }
}

export function constrainedSketch(options?: ConstrainedSketchOptions): ConstrainedSketchBuilder {
  return new ConstrainedSketchBuilder(options);
}

import type {
  ArcId,
  CircleId,
  ConstraintBuilderMethods,
  ConstraintDefinition,
  LineId,
  PointId,
  ShapeId,
  SketchArc,
  SketchCircle,
  SketchConstraint,
  SketchLine,
  SketchLoop,
  SketchPoint,
  SketchShape,
  SolveOptions,
} from './types';
import { DEFAULT_TOLERANCE, getConstraintDef, getPendingBuilderMethods } from './registry';
import { decomposeAndSolve } from './decompose';
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
  private arcs: SketchArc[] = [];
  private shapes: SketchShape[] = [];
  private constraints: SketchConstraint[] = [];
  private loops: SketchLoop[] = [];
  private rejectedConstraints: SketchConstraint[] = [];
  /** Maps rejected constraint ID → human-readable reason string. */
  private rejectionReasons = new Map<string, string>();
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

  point(x?: number, y?: number, fixed = false): PointId {
    const id = `pt-${this.nextId++}`;
    // Default to bounding box center when coords are omitted, so the point
    // starts near existing geometry instead of at NaN or an arbitrary origin.
    if (x == null || y == null) {
      const bounds = this._pointBounds();
      if (bounds) {
        x = x ?? (bounds.minX + bounds.maxX) / 2;
        y = y ?? (bounds.minY + bounds.maxY) / 2;
      } else {
        x = x ?? 0;
        y = y ?? 0;
      }
    }
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
    this.loops.push({ type: 'profile', segments: [] });
    return this;
  }

  lineTo(x: number, y: number): this {
    if (!this.cursor) return this.moveTo(x, y);
    const id = this.point(x, y);
    const lineId = this.line(this.cursor, id);
    const loop = this.loops[this.loops.length - 1];
    if (loop?.type === 'profile') loop.segments.push({ kind: 'line', line: lineId });
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

  /**
   * Draw a circular arc from the current cursor position to (x, y) with the given radius.
   * If `clockwise` is true the arc sweeps clockwise; otherwise counter-clockwise.
   * The arc center is computed automatically.
   */
  arcTo(x: number, y: number, radius: number, clockwise = false): this {
    if (!this.cursor) return this.moveTo(x, y);
    const endId = this.point(x, y);
    const arcId = this.addArc(this.cursor, endId, radius, clockwise);
    const loop = this.loops[this.loops.length - 1];
    if (loop?.type === 'profile') loop.segments.push({ kind: 'arc', arc: arcId });
    this.cursor = endId;
    return this;
  }

  /**
   * Create an arc from an explicit center point.
   * `start` and `end` are existing PointIds that must lie on the arc's circle.
   * Returns the ArcId. Does NOT advance the cursor.
   */
  arcByCenter(centerId: PointId, startId: PointId, endId: PointId, clockwise = false): ArcId {
    const center = this.getPoint(centerId);
    const start = this.getPoint(startId);
    if (!center || !start) throw new Error('arcByCenter: invalid point IDs');
    const radius = Math.hypot(start.x - center.x, start.y - center.y);
    const id: ArcId = `arc-${this.nextId++}`;
    this.arcs.push({ id, center: centerId, start: startId, end: endId, radius, clockwise, construction: false });
    return id;
  }

  close(): this {
    if (!this.cursor || !this.loopStart || this.cursor === this.loopStart) return this;
    const lineId = this.line(this.cursor, this.loopStart);
    const loop = this.loops[this.loops.length - 1];
    if (loop?.type === 'profile') loop.segments.push({ kind: 'line', line: lineId });
    this.cursor = this.loopStart;
    return this;
  }

  addLoopCircle(center: PointId, radius: number, segments = 48): this {
    this.circle(center, radius, false, segments);
    return this;
  }

  /**
   * Register a named shape (closed polygon) from an ordered list of line IDs.
   * Returns the ShapeId for use in shape constraints (shapeWidth, shapeCentroidX, etc.).
   */
  shape(lines: LineId[]): ShapeId {
    const id: ShapeId = `shp-${this.nextId++}`;
    this.shapes.push({ id, lines: [...lines] });
    return id;
  }

  constrain(constraint: Omit<SketchConstraint, 'id'>): this {
    const id = `cst-${this.nextId++}`;
    const next = { ...constraint, id } as SketchConstraint;
    if (next.type === 'fixed') {
      const c = next as unknown as { point: PointId; x: number; y: number };
      const pt = this.points.find((p) => p.id === c.point);
      if (pt) {
        pt.fixed = true;
        pt.x = c.x;
        pt.y = c.y;
      }
    }
    // Always accept the constraint — never reject.
    this.constraints.push(next);

    // Run the new constraint's presolve to initialise its referenced entities
    // to reasonable positions.  This is critical for constraints like pointOnLine
    // where new points at (0,0) are far from the line they should be on.
    this.runSinglePresolve(next);

    // Fast path: check if the system is already satisfied after presolve.
    if (this.checkResiduals() <= DEFAULT_TOLERANCE) return this;

    // Incremental solve with minimal solver settings — positions are warm.
    const def = this.buildDefinition();
    const { maxError } = decomposeAndSolve(def, {
      iterations: 30,
      tolerance: DEFAULT_TOLERANCE,
      restarts: 1,
      warmStartIterations: 4,
    });
    if (maxError <= DEFAULT_TOLERANCE) {
      this.syncFromDefinition(def);
    }
    return this;
  }

  // ─── Input Entity Resolution ─────────────────────────────────────────────
  // Each resolve* helper accepts either a bare ID string, a full entity object
  // with an `id` field, or (for points) an {x, y} coordinate pair that is
  // auto-imported.  This lets callers pass rich objects from other APIs without
  // having to manually extract the ID.

  private resolvePointId(p: any): PointId {
    if (typeof p === 'string') return p;
    if (p && typeof p === 'object') {
      if ('id' in p && typeof p.id === 'string') return p.id;
      if ('x' in p && 'y' in p) return this.importPoint(p);
    }
    throw new Error(`Invalid point reference: ${p}`);
  }

  private resolveLineId(l: any): LineId {
    if (typeof l === 'string') return l;
    if (l && typeof l === 'object') {
      if ('id' in l && typeof l.id === 'string') return l.id;
      if ('start' in l && 'end' in l) return this.importLine(l);
    }
    throw new Error(`Invalid line reference: ${l}`);
  }

  private resolveCircleId(c: any): CircleId {
    if (typeof c === 'string') return c;
    if (c && typeof c === 'object' && 'id' in c && typeof c.id === 'string') return c.id;
    throw new Error(`Invalid circle reference: ${c}`);
  }

  private resolveArcId(a: any): ArcId {
    if (typeof a === 'string') return a;
    if (a && typeof a === 'object' && 'id' in a && typeof a.id === 'string') return a.id;
    throw new Error(`Invalid arc reference: ${a}`);
  }

  private resolveShapeId(s: any): ShapeId {
    if (typeof s === 'string') return s;
    if (s && typeof s === 'object' && 'id' in s && typeof s.id === 'string') return s.id;
    throw new Error(`Invalid shape reference: ${s}`);
  }

  // ─── Ergonomic constraint helpers ────────────────────────────────────────────

  /** Constrain a line to be horizontal. */
  horizontal(line: any): this {
    return this.constrain({ type: 'horizontal', line: this.resolveLineId(line) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a line to be vertical. */
  vertical(line: any): this {
    return this.constrain({ type: 'vertical', line: this.resolveLineId(line) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two lines to be parallel. */
  parallel(a: any, b: any): this {
    return this.constrain({ type: 'parallel', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two lines to be perpendicular. */
  perpendicular(a: any, b: any): this {
    return this.constrain({ type: 'perpendicular', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /**
   * Tangent constraint.
   * - `tangent(line, circle)` — line is tangent to a circle.
   * - `tangent(circleA, circleB)` — two circles are externally tangent.
   */
  tangent(a: any, b: any): this {
    let aId: string;
    try {
      aId = this.resolveLineId(a);
      if (!this.lines.some(l => l.id === aId)) throw new Error();
      return this.constrain({ type: 'tangent', line: aId, circle: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
    } catch {
      aId = this.resolveCircleId(a);
      return this.constrain({ type: 'tangent', a: aId, b: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
    }
  }

  /** Constrain two lines to have equal length. */
  equal(a: any, b: any): this {
    return this.constrain({ type: 'equal', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two points to be at the same location. */
  coincident(a: any, b: any): this {
    return this.constrain({ type: 'coincident', a: this.resolvePointId(a), b: this.resolvePointId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two circles to share the same center. */
  concentric(a: any, b: any): this {
    return this.constrain({ type: 'concentric', a: this.resolveCircleId(a), b: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a point to lie on an infinite line (collinear). */
  collinear(point: any, line: any): this {
    return this.constrain({ type: 'collinear', point: this.resolvePointId(point), line: this.resolveLineId(line) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two points to be symmetric about an axis line. */
  symmetric(a: any, b: any, axis: any): this {
    return this.constrain({ type: 'symmetric', a: this.resolvePointId(a), b: this.resolvePointId(b), axis: this.resolveLineId(axis) } as Omit<SketchConstraint, 'id'>);
  }

  /** Fix a point at a specific location (or at its current position if x/y are omitted). */
  fix(point: any, x?: number, y?: number): this {
    const ptId = this.resolvePointId(point);
    const pt = this.points.find((p) => p.id === ptId);
    if (!pt) throw new Error(`fix(): point "${ptId}" not found in sketch`);
    return this.constrain({ type: 'fixed', point: ptId, x: x ?? pt.x, y: y ?? pt.y } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a point to lie at the midpoint of a line. */
  midpoint(point: any, line: any): this {
    return this.constrain({ type: 'midpoint', point: this.resolvePointId(point), line: this.resolveLineId(line) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a point to lie on the perimeter of a circle. */
  pointOnCircle(point: any, circle: any): this {
    return this.constrain({ type: 'pointOnCircle', point: this.resolvePointId(point), circle: this.resolveCircleId(circle) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain a point to lie on a bounded line segment (not its infinite extension). */
  pointOnLine(point: PointId, line: LineId): this {
    return this.constrain({ type: 'pointOnLine', point, line } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the distance between two points. */
  distance(a: any, b: any, value: number): this {
    return this.constrain({ type: 'distance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the length of a line. */
  length(line: any, value: number): this {
    return this.constrain({ type: 'length', line: this.resolveLineId(line), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the angle from line `a` to line `b` (degrees). */
  angle(a: any, b: any, value: number): this {
    return this.constrain({ type: 'angle', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the radius of a circle. */
  radius(circle: any, value: number): this {
    return this.constrain({ type: 'radius', circle: this.resolveCircleId(circle), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the diameter of a circle. */
  diameter(circle: any, value: number): this {
    return this.constrain({ type: 'diameter', circle: this.resolveCircleId(circle), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the horizontal distance between two points (b.x − a.x = value). */
  hDistance(a: any, b: any, value: number): this {
    return this.constrain({ type: 'hDistance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the vertical distance between two points (b.y − a.y = value). */
  vDistance(a: any, b: any, value: number): this {
    return this.constrain({ type: 'vDistance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<SketchConstraint, 'id'>);
  }

  /**
   * Constrain the signed perpendicular distance from a point to a line.
   * Positive `value` places the point to the **left** of the line (a→b direction).
   * Zero is equivalent to `collinear`.
   */
  pointLineDistance(point: any, line: any, value: number): this {
    return this.constrain({ type: 'pointLineDistance', point: this.resolvePointId(point), line: this.resolveLineId(line), value } as Omit<SketchConstraint, 'id'>);
  }

  /**
   * Constrain the perpendicular (offset) distance between two lines.
   * Also implicitly enforces parallelism.
   *
   * Positive `value` places line `b` on the **left** side of line `a`
   * (according to `a`'s direction vector). Negative places it on the right.
   */
  lineDistance(a: any, b: any, value: number): this {
    return this.constrain({ type: 'lineDistance', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the absolute angle of a line from the positive X-axis (degrees). */
  absoluteAngle(line: any, value: number): this {
    return this.constrain({ type: 'absoluteAngle', line: this.resolveLineId(line), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two circles to have equal radii. */
  equalRadius(a: any, b: any): this {
    return this.constrain({ type: 'equalRadius', a: this.resolveCircleId(a), b: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the arc length of an arc (radius × sweep angle). */
  arcLength(arc: any, value: number): this {
    return this.constrain({ type: 'arcLength', arc: this.resolveArcId(arc), value } as Omit<SketchConstraint, 'id'>);
  }

  /**
   * Constrain a line to be tangent to an arc at the arc's start (`atStart=true`) or end point.
   * Combine with `coincident` to enforce the shared endpoint.
   */
  lineTangentArc(line: any, arc: any, atStart: boolean): this {
    return this.constrain({ type: 'lineTangentArc', line: this.resolveLineId(line), arc: this.resolveArcId(arc), atStart } as Omit<SketchConstraint, 'id'>);
  }

  // ─── Shape constraint helpers ─────────────────────────────────────────────

  /** Constrain the bounding-box width of a shape. */
  shapeWidth(shape: any, value: number): this {
    return this.constrain({ type: 'shapeWidth', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the bounding-box height of a shape. */
  shapeHeight(shape: any, value: number): this {
    return this.constrain({ type: 'shapeHeight', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the X coordinate of a shape's centroid. */
  shapeCentroidX(shape: any, value: number): this {
    return this.constrain({ type: 'shapeCentroidX', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the Y coordinate of a shape's centroid. */
  shapeCentroidY(shape: any, value: number): this {
    return this.constrain({ type: 'shapeCentroidY', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the area of a shape. */
  shapeArea(shape: any, value: number): this {
    return this.constrain({ type: 'shapeArea', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two shapes to share the same centroid. */
  shapeEqualCentroid(a: any, b: any): this {
    return this.constrain({ type: 'shapeEqualCentroid', a: this.resolveShapeId(a), b: this.resolveShapeId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the unsigned angle between two lines (accepts both orientations). */
  angleBetween(a: any, b: any, value: number): this {
    return this.constrain({ type: 'angleBetween', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Enforce counter-clockwise winding on a polygon defined by its vertices. */
  ccw(...points: any[]): this {
    return this.constrain({ type: 'ccw', points: points.map(p => this.resolvePointId(p)) } as Omit<SketchConstraint, 'id'>);
  }

  // ─── Loop helpers ──────────────────────────────────────────────────────────

  /**
   * Register a closed polygon loop from an explicit ordered list of point IDs.
   */
  addLoop(points: any[]): this {
    if (points.length < 3) throw new Error('addLoop(): needs at least 3 points');
    this.loops.push({ type: 'poly', points: points.map(p => this.resolvePointId(p)) });
    return this;
  }

  solve(options: SolveOptions = {}): ConstraintSketch {
    return solveConstraintDefinition(this.buildDefinition(), options);
  }

  /**
   * Run the solver without building a full `ConstraintSketch`.
   * Useful for lightweight constraint validation or progress monitoring.
   * Returns the final maxError, the number of rejected constraints, and
   * the solved `ConstraintDefinition` with updated point positions.
   */
  solveConstraintsOnly(options: SolveOptions = {}): {
    maxError: number;
    rejectedCount: number;
    definition: ConstraintDefinition;
  } {
    const def = this.buildDefinition();
    const { maxError } = decomposeAndSolve(def, options);
    return { maxError, rejectedCount: def.rejectedConstraints.length, definition: def };
  }

  private buildDefinition(extraConstraint?: SketchConstraint): ConstraintDefinition {
    return {
      points: this.points.map((p) => ({ ...p })),
      lines: this.lines.map((l) => ({ ...l })),
      circles: this.circles.map((c) => ({ ...c })),
      arcs: this.arcs.map((a) => ({ ...a })),
      shapes: this.shapes.map((s) => ({ ...s, lines: [...s.lines] })),
      loops: this.loops.map((loop) => {
        if (loop.type === 'poly') return { type: 'poly', points: [...loop.points] };
        if (loop.type === 'circle') return { type: 'circle', circle: loop.circle };
        return { type: 'profile', segments: loop.segments.map((s) => ({ ...s })) };
      }),
      constraints: extraConstraint ? [...this.constraints, extraConstraint] : [...this.constraints],
      rejectedConstraints: [...this.rejectedConstraints],
      rejectionReasons: new Map(this.rejectionReasons),
    };
  }

  /**
   * Evaluate all constraint residuals on the builder's live entities.
   * Returns the max absolute residual (infinity-norm).  Used for fast
   * "already satisfied?" checks before invoking the full solver.
   */
  private checkResiduals(): number {
    const points = new Map(this.points.map((p) => [p.id, p] as const));
    const lines = new Map(this.lines.map((l) => [l.id, l] as const));
    const circles = new Map(this.circles.map((c) => [c.id, c] as const));
    const arcs = new Map(this.arcs.map((a) => [a.id, a] as const));
    const shapes = new Map((this.shapes ?? []).map((s) => [s.id, s] as const));
    const ctx = {
      points, lines, circles, arcs, shapes,
      tolerance: DEFAULT_TOLERANCE,
      movePoint: () => false,
    };
    let maxRes = 0;
    for (const c of this.constraints) {
      const cdef = getConstraintDef(c.type);
      if (!cdef?.residual) continue;
      const res = cdef.residual(c as never, ctx);
      for (const r of res) {
        const a = Math.abs(r);
        if (a > maxRes) maxRes = a;
        if (maxRes > DEFAULT_TOLERANCE) return maxRes; // early bail
      }
    }
    return maxRes;
  }

  /** Sync solved positions from a definition back to the builder's live entities. */
  private syncFromDefinition(def: ConstraintDefinition): void {
    for (let i = 0; i < this.points.length; i++) {
      this.points[i].x = def.points[i].x;
      this.points[i].y = def.points[i].y;
    }
    for (let i = 0; i < this.circles.length; i++) {
      this.circles[i].radius = def.circles[i].radius;
    }
    const defArcs = def.arcs ?? [];
    for (let i = 0; i < this.arcs.length; i++) {
      if (i < defArcs.length) this.arcs[i].radius = defArcs[i].radius;
    }
  }

  /**
   * Run the presolve hook for a single constraint directly on the builder's
   * own entities.  This initialises newly-added geometry (e.g. a point at
   * (0,0) that should be on a line) without disturbing already-converged
   * positions.
   */
  private runSinglePresolve(constraint: SketchConstraint): void {
    const cdef = getConstraintDef(constraint.type);
    if (!cdef?.presolve) return;
    const points = new Map(this.points.map((p) => [p.id, p] as const));
    const lines = new Map(this.lines.map((l) => [l.id, l] as const));
    const circles = new Map(this.circles.map((c) => [c.id, c] as const));
    const arcs = new Map(this.arcs.map((a) => [a.id, a] as const));
    const shapes = new Map((this.shapes ?? []).map((s) => [s.id, s] as const));
    const ctx = {
      points, lines, circles, arcs, shapes,
      tolerance: DEFAULT_TOLERANCE,
      movePoint: (pt: SketchPoint, dx: number, dy: number) => {
        if (pt.fixed) return false;
        pt.x += dx; pt.y += dy;
        return true;
      },
    };
    cdef.presolve(constraint as never, ctx);
  }

  /**
   * Find all point IDs that should remain free (not frozen) when incrementally
   * solving for a newly added constraint.  Returns the set of points that are
   * directly or one-hop-transitively connected to the new constraint's entities.
   */
  private findAffectedPoints(constraint: SketchConstraint): Set<string> {
    // Extract entity IDs from the new constraint.
    const newEntityIds = new Set<string>();
    for (const [key, val] of Object.entries(constraint)) {
      if (key === 'id' || key === 'type') continue;
      if (typeof val === 'string') newEntityIds.add(val);
      else if (Array.isArray(val)) {
        for (const v of val) { if (typeof v === 'string') newEntityIds.add(v); }
      }
    }
    // Expand line/circle/arc/shape IDs to their constituent point IDs.
    const expandToPoints = (entityIds: Set<string>): void => {
      for (const l of this.lines) {
        if (entityIds.has(l.id)) { entityIds.add(l.a); entityIds.add(l.b); }
      }
      for (const c of this.circles) {
        if (entityIds.has(c.id)) entityIds.add(c.center);
      }
      for (const a of this.arcs) {
        if (entityIds.has(a.id)) { entityIds.add(a.center); entityIds.add(a.start); entityIds.add(a.end); }
      }
      for (const s of this.shapes ?? []) {
        if (entityIds.has(s.id)) {
          for (const lineId of s.lines) {
            entityIds.add(lineId);
            const line = this.lines.find(l => l.id === lineId);
            if (line) { entityIds.add(line.a); entityIds.add(line.b); }
          }
        }
      }
    };
    expandToPoints(newEntityIds);

    // Find all constraints that share entities with the new constraint.
    const affectedEntities = new Set(newEntityIds);
    for (const c of this.constraints) {
      if (c.id === constraint.id) continue;
      let shares = false;
      for (const [key, val] of Object.entries(c)) {
        if (key === 'id' || key === 'type') continue;
        if (typeof val === 'string' && newEntityIds.has(val)) { shares = true; break; }
        if (Array.isArray(val)) {
          for (const v of val) { if (typeof v === 'string' && newEntityIds.has(v)) { shares = true; break; } }
          if (shares) break;
        }
      }
      if (shares) {
        // Add all entities from this neighbor constraint.
        for (const [key, val] of Object.entries(c)) {
          if (key === 'id' || key === 'type') continue;
          if (typeof val === 'string') affectedEntities.add(val);
          else if (Array.isArray(val)) {
            for (const v of val) { if (typeof v === 'string') affectedEntities.add(v); }
          }
        }
      }
    }
    expandToPoints(affectedEntities);

    // Return only point IDs.
    const pointIds = new Set(this.points.map(p => p.id));
    const result = new Set<string>();
    for (const id of affectedEntities) {
      if (pointIds.has(id)) result.add(id);
    }
    return result;
  }

  private getPoint(id: PointId | null): SketchPoint | null {
    if (!id) return null;
    return this.points.find((p) => p.id === id) ?? null;
  }

  /** Compute arc center from start/end points, radius, and clockwise flag; create the arc entity. */
  private addArc(startId: PointId, endId: PointId, radius: number, clockwise: boolean): ArcId {
    const start = this.getPoint(startId)!;
    const end = this.getPoint(endId)!;
    const mx = (start.x + end.x) / 2;
    const my = (start.y + end.y) / 2;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    const r = Math.max(radius, d / 2 + 1e-9); // clamp to minimum viable radius
    const h = Math.sqrt(r * r - (d / 2) * (d / 2));
    // Left-perpendicular of (start→end); guard against coincident start/end.
    const invD = d > 1e-9 ? 1 / d : 0;
    const px = -dy * invD;
    const py = dx * invD;
    // CCW → center left of direction; CW → center right.
    const sign = clockwise ? -1 : 1;
    const cx = mx + sign * h * px;
    const cy = my + sign * h * py;
    const centerId = this.point(cx, cy);
    const id: ArcId = `arc-${this.nextId++}`;
    this.arcs.push({ id, center: centerId, start: startId, end: endId, radius: r, clockwise, construction: false });
    return id;
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

  /**
   * Bounding box of all existing non-construction points.
   * Returns null when no points exist yet.
   * Used by concept factories to auto-offset initial geometry.
   */
  _pointBounds(): { minX: number; maxX: number; minY: number; maxY: number } | null {
    const pts = this.points.filter(p => !p.id.startsWith('ref-'));
    if (pts.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    return { minX, maxX, minY, maxY };
  }
}

export function constrainedSketch(options?: ConstrainedSketchOptions): ConstrainedSketchBuilder {
  return new ConstrainedSketchBuilder(options);
}
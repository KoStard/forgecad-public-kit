/**
 * Thin TS builder facade for constraints.
 *
 * This file owns fluent sketch-construction ergonomics only. All solving and
 * branch-seeding decisions delegate to Rust/WASM.
 */
import type {
  ArcId,
  BezierId,
  CircleId,
  ConstraintBuilderMethods,
  ConstraintDefinition,
  GroupId,
  LineId,
  PointId,
  ShapeId,
  SketchArc,
  SketchBezier,
  SketchCircle,
  SketchConstraint,
  SketchGroup,
  SketchGroupLocalPoint,
  SketchLine,
  SketchLoop,
  SketchPoint,
  SketchShape,
  SolveOptions,
} from './types';
import { DEFAULT_TOLERANCE, getPendingBuilderMethods, solveConstraints } from './registry';
import { ConstraintSketch, solveConstraintDefinition } from './sketch';
import { getSessionApi, type WasmSessionApi } from './solver-wasm';

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
  private beziers: SketchBezier[] = [];
  private shapes: SketchShape[] = [];
  private _groups: SketchGroup[] = [];
  /** Point IDs owned by groups — excluded from the serialized points array. */
  private groupOwnedPointIds = new Set<string>();
  /** Line IDs owned by groups — excluded from the serialized lines array. */
  private groupOwnedLineIds = new Set<string>();
  private constraints: SketchConstraint[] = [];
  private loops: SketchLoop[] = [];
  private rejectedConstraints: SketchConstraint[] = [];
  /** Maps rejected constraint ID → human-readable reason string. */
  private rejectionReasons = new Map<string, string>();
  private cursor: PointId | null = null;
  private loopStart: PointId | null = null;
  /** Last arc created by the path API (arcTo), used by blendTo. */
  private lastPathArc: ArcId | null = null;
  private nextId = 1;
  private strict: boolean;
  /** Cumulative time spent in seedIncrementalGeometry calls (ms). */
  private seedTimeMs = 0;
  /** Max cumulative time for all seed calls (ms). After this, seeding is skipped. */
  private static readonly SEED_BUDGET_MS = 5_000;
  /** WASM solver session handle — persists state across seed steps. */
  private _sessionHandle: number | null = null;
  private _sessionApi: WasmSessionApi | null = null;
  private _sessionFailed = false;

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

  /** Try to create a WASM solver session. Returns true if session is active. */
  private ensureSession(): boolean {
    if (this._sessionHandle !== null) return true;
    if (this._sessionFailed) return false;
    const api = getSessionApi();
    if (!api) {
      this._sessionFailed = true;
      return false;
    }
    this._sessionApi = api;
    this._sessionHandle = api.session_create();
    return true;
  }

  private destroySession(): void {
    if (this._sessionHandle !== null && this._sessionApi) {
      this._sessionApi.session_destroy(this._sessionHandle);
      this._sessionHandle = null;
      this._sessionApi = null;
    }
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
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      throw new Error(`point(): coordinates must be finite numbers, got (${x}, ${y})`);
    }
    this.points.push({ id, x, y, fixed });
    if (this.ensureSession()) {
      this._sessionApi!.session_add_point(this._sessionHandle!, id, x, y, fixed);
    }
    return id;
  }

  pointAt(index: number): PointId {
    const pt = this.points[index];
    if (!pt) throw new Error(`Point index ${index} out of range`);
    return pt.id;
  }

  line(a: PointId, b: PointId, construction = false, name?: string): LineId {
    if (!this.points.some((p) => p.id === a)) {
      throw new Error(`line(): point "${a}" not found in sketch`);
    }
    if (!this.points.some((p) => p.id === b)) {
      throw new Error(`line(): point "${b}" not found in sketch`);
    }
    const id = `ln-${this.nextId++}`;
    this.lines.push({ id, a, b, construction, name });
    if (this._sessionHandle !== null) {
      this._sessionApi!.session_add_line(this._sessionHandle, id, a, b);
    }
    return id;
  }

  lineAt(index: number): LineId {
    const line = this.lines[index];
    if (!line) throw new Error(`Line index ${index} out of range`);
    return line.id;
  }

  circle(center: PointId, radius: number, construction = false, segments = 48, name?: string): CircleId {
    if (!Number.isFinite(radius)) {
      throw new Error(`circle(): radius must be a finite number, got ${radius}`);
    }
    if (!this.points.some((p) => p.id === center)) {
      throw new Error(`circle(): center point "${center}" not found in sketch`);
    }
    const id = `c-${this.nextId++}`;
    this.circles.push({ id, center, radius, construction, fixedRadius: false, segments, name });
    if (this._sessionHandle !== null) {
      this._sessionApi!.session_add_circle(this._sessionHandle, id, center, radius, false);
    }
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
    this.lastPathArc = arcId;
    return this;
  }

  /**
   * Create an arc from an explicit center point.
   * `start` and `end` are existing PointIds that must lie on the arc's circle.
   * Returns the ArcId. Does NOT advance the cursor.
   */
  arcByCenter(centerId: PointId, startId: PointId, endId: PointId, clockwise = false, name?: string): ArcId {
    const center = this.getPoint(centerId);
    const start = this.getPoint(startId);
    if (!center || !start) throw new Error('arcByCenter: invalid point IDs');
    const radius = Math.hypot(start.x - center.x, start.y - center.y);
    const id: ArcId = `arc-${this.nextId++}`;
    this.arcs.push({ id, center: centerId, start: startId, end: endId, radius, clockwise, construction: false, name });
    if (this._sessionHandle !== null) {
      this._sessionApi!.session_add_arc(this._sessionHandle, id, centerId, startId, endId, radius, clockwise);
    }
    return id;
  }

  /**
   * Create a cubic Bezier curve from four control points.
   * Returns the BezierId. Does NOT advance the cursor.
   */
  bezier(p0: any, p1: any, p2: any, p3: any, name?: string): BezierId {
    const p0Id = this.resolvePointId(p0);
    const p1Id = this.resolvePointId(p1);
    const p2Id = this.resolvePointId(p2);
    const p3Id = this.resolvePointId(p3);
    const id: BezierId = `bez-${this.nextId++}`;
    this.beziers.push({ id, p0: p0Id, p1: p1Id, p2: p2Id, p3: p3Id, construction: false, name });
    return id;
  }

  /**
   * Draw a Bezier curve from the current cursor to (x3, y3) with control points (x1, y1) and (x2, y2).
   * The cursor becomes the Bezier's P0; the end point becomes the new cursor.
   */
  bezierTo(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number): this {
    if (!this.cursor) return this;
    const cp1 = this.point(x1, y1);
    const cp2 = this.point(x2, y2);
    const endPt = this.point(x3, y3);
    const bezId = this.bezier(this.cursor, cp1, cp2, endPt);
    const loop = this.loops[this.loops.length - 1];
    if (loop?.type === 'profile') loop.segments.push({ kind: 'bezier', bezier: bezId });
    this.cursor = endPt;
    return this;
  }

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
  blendTo(x: number, y: number, weight = 0.5): this {
    if (!this.cursor || !this.lastPathArc) {
      throw new Error('blendTo: cursor must be on the end of a previous arcTo() call');
    }

    const arc = this.arcs.find((a) => a.id === this.lastPathArc)!;
    const pt0 = this.getPoint(this.cursor)!;
    const center = this.getPoint(arc.center)!;

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
    const pt3 = this.getPoint(endPt)!;
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
    if (this._sessionHandle !== null) {
      this._sessionApi!.session_add_shape(this._sessionHandle, id, JSON.stringify(lines));
    }
    return id;
  }

  /**
   * Create a rigid-body group with a local coordinate frame.
   * Points/lines added to the group move together as a unit — the solver
   * sees 3 DOF (x, y, θ) instead of 2N per point.
   *
   * @example
   * ```ts
   * const g = sk.group({ x: 50, y: 30 });
   * const p0 = g.point(0, 0);    // local origin → world (50, 30)
   * const p1 = g.point(100, 0);  // local (100,0) → world (150, 30)
   * const l = g.line(p0, p1);
   * g.fixRotation();
   * // p0, p1 work in constraints like any other PointId:
   * sk.coincident(p0, someExternalPoint);
   * ```
   */
  group(opts: { x?: number; y?: number; theta?: number; id?: string } = {}): SketchGroupBuilder {
    return new SketchGroupBuilder(this, opts);
  }

  /**
   * Register a group directly (called by SketchGroupBuilder).
   * @internal
   */
  _registerGroup(group: SketchGroup): void {
    this._groups.push(group);
    for (const lp of group.points) {
      this.groupOwnedPointIds.add(lp.id);
    }
    for (const l of group.lines) {
      this.groupOwnedLineIds.add(l.id);
    }
    if (this._sessionHandle !== null) {
      this._sessionApi!.session_add_group(
        this._sessionHandle,
        JSON.stringify({
          id: group.id,
          x: group.x,
          y: group.y,
          theta: group.theta,
          fixed: group.fixed,
          fixed_rotation: group.fixedRotation,
          points: group.points.map((p) => ({ id: p.id, lx: p.lx, ly: p.ly })),
          lines: group.lines.map((l) => ({ id: l.id, a: l.a, b: l.b })),
        }),
      );
    }
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
    this.seedIncrementalGeometry(next);
    return this;
  }

  /**
   * Keep the live builder geometry near a solved state as constraints are added.
   * This restores the progressive seeding path used by large sketches in the browser
   * without rejecting constraints or changing the final solve API.
   */
  private seedIncrementalGeometry(constraint: SketchConstraint): void {
    // Skip seeding if cumulative time budget is exhausted.
    if (this.seedTimeMs >= ConstrainedSketchBuilder.SEED_BUDGET_MS) return;

    // Session path: constraint is added to persistent WASM state and seeded in-place.
    // No buildDefinition() or JSON round-trip for the full problem.
    if (this._sessionHandle !== null && this._sessionApi) {
      try {
        const t0 = performance.now();
        const constraintJson = this.serializeConstraintForSession(constraint);
        const err = this._sessionApi.session_add_constraint(this._sessionHandle, constraintJson, true);
        this.seedTimeMs += performance.now() - t0;

        if (err >= 0 && err <= DEFAULT_TOLERANCE * 100) {
          this.syncPointsFromSession();
        }
      } catch (error) {
        if (this.strict) throw error;
      }
      return;
    }

    // Fallback: stateless buildDefinition + solve path.
    try {
      const t0 = performance.now();
      const remaining = ConstrainedSketchBuilder.SEED_BUDGET_MS - this.seedTimeMs;
      const perCallBudget = Math.min(500, remaining);

      const working = this.buildDefinition();
      const { maxError } = solveConstraints(
        working,
        {
          iterations: 30,
          restarts: 1,
          warmStartIterations: 4,
          maxScaledStep: 2.0,
          skipRedundancyCheck: true,
          presolveConstraintId: constraint.id,
          timeBudgetMs: perCallBudget,
        },
        'builder.seedIncrementalGeometry',
      );

      this.seedTimeMs += performance.now() - t0;

      if (Number.isFinite(maxError) && maxError <= DEFAULT_TOLERANCE * 100) {
        this.syncFromDefinition(working);
      }
    } catch (error) {
      if (this.strict) throw error;
    }
  }

  /** Serialize a constraint for the session API (matches Rust serde format). */
  private serializeConstraintForSession(c: SketchConstraint): string {
    const raw = c as Record<string, unknown>;
    if (raw['type'] === 'lineTangentArc') {
      const { atStart, ...rest } = raw as any;
      return JSON.stringify({ ...rest, at_start: atStart });
    }
    if (raw['type'] === 'arcTangentArc') {
      const { arcA, arcB, aAtStart, bAtStart, ...rest } = raw as any;
      return JSON.stringify({ ...rest, arc_a: arcA, arc_b: arcB, a_at_start: aAtStart, b_at_start: bAtStart });
    }
    if (raw['type'] === 'bezierTangentArc') {
      const { tangentBase, tangentControl, atArcStart, ...rest } = raw as any;
      return JSON.stringify({ ...rest, tangent_base: tangentBase, tangent_control: tangentControl, at_arc_start: atArcStart });
    }
    return JSON.stringify(raw);
  }

  /** Sync point positions from session state back to builder entities. */
  private syncPointsFromSession(): void {
    if (this._sessionHandle === null || !this._sessionApi) return;
    const json = this._sessionApi.session_get_points(this._sessionHandle);
    const sessionPoints: Array<{ id: string; x: number; y: number }> = JSON.parse(json);
    const map = new Map(sessionPoints.map((p) => [p.id, p]));
    for (const p of this.points) {
      if (this.groupOwnedPointIds.has(p.id)) continue;
      const sp = map.get(p.id);
      if (sp) {
        p.x = sp.x;
        p.y = sp.y;
      }
    }
  }

  // ─── Input Entity Resolution ─────────────────────────────────────────────
  // Each resolve* helper accepts either a bare ID string, a full entity object
  // with an `id` field, or (for points) an {x, y} coordinate pair that is
  // auto-imported.  This lets callers pass rich objects from other APIs without
  // having to manually extract the ID.

  private resolvePointId(p: any): PointId {
    let id: string;
    if (typeof p === 'string') {
      id = p;
    } else if (p && typeof p === 'object') {
      if ('id' in p && typeof p.id === 'string') {
        id = p.id;
      } else if ('x' in p && 'y' in p) {
        return this.importPoint(p);
      } else {
        throw new Error(`Invalid point reference: ${p}`);
      }
    } else {
      throw new Error(`Invalid point reference: ${p}`);
    }
    if (!this.points.some((pt) => pt.id === id)) {
      throw new Error(`Point "${id}" not found in sketch. Available points: ${this.points.map((pt) => pt.id).join(', ') || '(none)'}`);
    }
    return id;
  }

  private resolveLineId(l: any): LineId {
    let id: string;
    if (typeof l === 'string') {
      id = l;
    } else if (l && typeof l === 'object') {
      if ('id' in l && typeof l.id === 'string') {
        id = l.id;
      } else if ('start' in l && 'end' in l) {
        return this.importLine(l);
      } else {
        throw new Error(`Invalid line reference: ${l}`);
      }
    } else {
      throw new Error(`Invalid line reference: ${l}`);
    }
    if (!this.lines.some((ln) => ln.id === id)) {
      throw new Error(`Line "${id}" not found in sketch. Available lines: ${this.lines.map((ln) => ln.id).join(', ') || '(none)'}`);
    }
    return id;
  }

  private resolveCircleId(c: any): CircleId {
    let id: string;
    if (typeof c === 'string') {
      id = c;
    } else if (c && typeof c === 'object' && 'id' in c && typeof c.id === 'string') {
      id = c.id;
    } else {
      throw new Error(`Invalid circle reference: ${c}`);
    }
    if (!this.circles.some((ci) => ci.id === id)) {
      throw new Error(`Circle "${id}" not found in sketch. Available circles: ${this.circles.map((ci) => ci.id).join(', ') || '(none)'}`);
    }
    return id;
  }

  private resolveArcId(a: any): ArcId {
    let id: string;
    if (typeof a === 'string') {
      id = a;
    } else if (a && typeof a === 'object' && 'id' in a && typeof a.id === 'string') {
      id = a.id;
    } else {
      throw new Error(`Invalid arc reference: ${a}`);
    }
    if (!this.arcs.some((ar) => ar.id === id)) {
      throw new Error(`Arc "${id}" not found in sketch. Available arcs: ${this.arcs.map((ar) => ar.id).join(', ') || '(none)'}`);
    }
    return id;
  }

  private resolveBezierId(b: any): BezierId {
    let id: string;
    if (typeof b === 'string') {
      id = b;
    } else if (b && typeof b === 'object' && 'id' in b && typeof b.id === 'string') {
      id = b.id;
    } else {
      throw new Error(`Invalid bezier reference: ${b}`);
    }
    if (!this.beziers.some((bz) => bz.id === id)) {
      throw new Error(`Bezier "${id}" not found in sketch. Available beziers: ${this.beziers.map((bz) => bz.id).join(', ') || '(none)'}`);
    }
    return id;
  }

  private resolveShapeId(s: any): ShapeId {
    let id: string;
    if (typeof s === 'string') {
      id = s;
    } else if (s && typeof s === 'object' && 'id' in s && typeof s.id === 'string') {
      id = s.id;
    } else {
      throw new Error(`Invalid shape reference: ${s}`);
    }
    if (!this.shapes.some((sh) => sh.id === id)) {
      throw new Error(`Shape "${id}" not found in sketch. Available shapes: ${this.shapes.map((sh) => sh.id).join(', ') || '(none)'}`);
    }
    return id;
  }

  /**
   * Validate that a constraint value is a finite number.
   * Throws with the constraint name for clear debugging.
   */
  private requireFinite(value: number, constraintName: string): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${constraintName}(): value must be a finite number, got ${value} (${typeof value})`);
    }
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

  /** Constrain two lines to point in the same direction (co-directional, not just parallel). */
  sameDirection(a: any, b: any): this {
    return this.constrain({ type: 'sameDirection', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two lines to point in opposite directions (anti-parallel). */
  oppositeDirection(a: any, b: any): this {
    return this.constrain({ type: 'oppositeDirection', a: this.resolveLineId(a), b: this.resolveLineId(b) } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /**
   * Prevent 180° rotation of a polygon.
   * For rects: ensures the bottom edge points rightward (`axis: 'x'`).
   * @param points — vertex IDs in order (e.g. rect.vertices)
   * @param axis — `'x'` or `'y'`: which axis the first edge must increase along. Default `'x'`.
   */
  blockRotation(points: any[], axis: 'x' | 'y' = 'x'): this {
    const resolved = points.map((p: any) => this.resolvePointId(p));
    return this.constrain({ type: 'blockRotation', points: resolved, axis } as Omit<SketchConstraint, 'id'>);
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
      if (!this.lines.some((l) => l.id === aId)) throw new Error();
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
    return this.constrain({ type: 'collinear', point: this.resolvePointId(point), line: this.resolveLineId(line) } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Constrain two points to be symmetric about an axis line. */
  symmetric(a: any, b: any, axis: any): this {
    return this.constrain({
      type: 'symmetric',
      a: this.resolvePointId(a),
      b: this.resolvePointId(b),
      axis: this.resolveLineId(axis),
    } as Omit<SketchConstraint, 'id'>);
  }

  /** Fix a point at a specific location (or at its current position if x/y are omitted). */
  fix(point: any, x?: number, y?: number): this {
    const ptId = this.resolvePointId(point);
    const pt = this.points.find((p) => p.id === ptId);
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
  }

  /** Constrain a point to lie at the midpoint of a line. */
  midpoint(point: any, line: any): this {
    return this.constrain({ type: 'midpoint', point: this.resolvePointId(point), line: this.resolveLineId(line) } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Constrain a point to lie on the perimeter of a circle. */
  pointOnCircle(point: any, circle: any): this {
    return this.constrain({ type: 'pointOnCircle', point: this.resolvePointId(point), circle: this.resolveCircleId(circle) } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Constrain a point to lie on a bounded line segment (not its infinite extension). */
  pointOnLine(point: any, line: any): this {
    return this.constrain({ type: 'pointOnLine', point: this.resolvePointId(point), line: this.resolveLineId(line) } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Constrain the distance between two points. */
  distance(a: any, b: any, value: number): this {
    this.requireFinite(value, 'distance');
    return this.constrain({ type: 'distance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Constrain the length of a line. */
  length(line: any, value: number): this {
    this.requireFinite(value, 'length');
    return this.constrain({ type: 'length', line: this.resolveLineId(line), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the angle from line `a` to line `b` (degrees). */
  angle(a: any, b: any, value: number): this {
    this.requireFinite(value, 'angle');
    return this.constrain({ type: 'angle', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the radius of a circle. */
  radius(circle: any, value: number): this {
    this.requireFinite(value, 'radius');
    return this.constrain({ type: 'radius', circle: this.resolveCircleId(circle), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the diameter of a circle. */
  diameter(circle: any, value: number): this {
    this.requireFinite(value, 'diameter');
    return this.constrain({ type: 'diameter', circle: this.resolveCircleId(circle), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the horizontal distance between two points (b.x − a.x = value). */
  hDistance(a: any, b: any, value: number): this {
    this.requireFinite(value, 'hDistance');
    return this.constrain({ type: 'hDistance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Constrain the vertical distance between two points (b.y − a.y = value). */
  vDistance(a: any, b: any, value: number): this {
    this.requireFinite(value, 'vDistance');
    return this.constrain({ type: 'vDistance', a: this.resolvePointId(a), b: this.resolvePointId(b), value } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /**
   * Constrain the signed perpendicular distance from a point to a line.
   * Positive `value` places the point to the **left** of the line (a→b direction).
   * Zero is equivalent to `collinear`.
   */
  pointLineDistance(point: any, line: any, value: number): this {
    this.requireFinite(value, 'pointLineDistance');
    return this.constrain({ type: 'pointLineDistance', point: this.resolvePointId(point), line: this.resolveLineId(line), value } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /**
   * Constrain the perpendicular (offset) distance between two lines.
   * Also implicitly enforces parallelism.
   *
   * Positive `value` places line `b` on the **left** side of line `a`
   * (according to `a`'s direction vector). Negative places it on the right.
   */
  lineDistance(a: any, b: any, value: number): this {
    this.requireFinite(value, 'lineDistance');
    return this.constrain({ type: 'lineDistance', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Constrain the absolute angle of a line from the positive X-axis (degrees). */
  absoluteAngle(line: any, value: number): this {
    this.requireFinite(value, 'absoluteAngle');
    return this.constrain({ type: 'absoluteAngle', line: this.resolveLineId(line), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two circles to have equal radii. */
  equalRadius(a: any, b: any): this {
    return this.constrain({ type: 'equalRadius', a: this.resolveCircleId(a), b: this.resolveCircleId(b) } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the arc length of an arc (radius × sweep angle). */
  arcLength(arc: any, value: number): this {
    this.requireFinite(value, 'arcLength');
    return this.constrain({ type: 'arcLength', arc: this.resolveArcId(arc), value } as Omit<SketchConstraint, 'id'>);
  }

  /**
   * Constrain a line to be tangent to an arc at the arc's start (`atStart=true`) or end point.
   * Combine with `coincident` to enforce the shared endpoint.
   */
  lineTangentArc(line: any, arc: any, atStart: boolean): this {
    return this.constrain({ type: 'lineTangentArc', line: this.resolveLineId(line), arc: this.resolveArcId(arc), atStart } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /**
   * Constrain two arcs to be tangent (G1 smooth) at their shared junction point.
   * The radius vectors at the junction must be collinear.
   *
   * If `aAtStart`/`bAtStart` are omitted, auto-detects the shared endpoint
   * (i.e., which endpoint of arcA coincides with which endpoint of arcB).
   */
  arcTangentArc(arcA: any, arcB: any, aAtStart?: boolean, bAtStart?: boolean): this {
    const arcAId = this.resolveArcId(arcA);
    const arcBId = this.resolveArcId(arcB);

    // Auto-detect shared endpoints if not specified
    if (aAtStart === undefined || bAtStart === undefined) {
      const a = this.arcs.find((x) => x.id === arcAId)!;
      const b = this.arcs.find((x) => x.id === arcBId)!;
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
        pts.sort((x, y) => x.dist - y.dist);
        aAtStart = pts[0].aS;
        bAtStart = pts[0].bS;
      } else {
        aAtStart = matches[0][0];
        bAtStart = matches[0][1];
      }
    }

    return this.constrain({ type: 'arcTangentArc', arcA: arcAId, arcB: arcBId, aAtStart, bAtStart } as Omit<SketchConstraint, 'id'>);
  }

  /** Distance between two points by ID (for internal use). */
  private pointDist(a: PointId, b: PointId): number {
    const pa = this.getPoint(a),
      pb = this.getPoint(b);
    if (!pa || !pb) return Infinity;
    return Math.hypot(pa.x - pb.x, pa.y - pb.y);
  }

  /**
   * Constrain a Bezier curve to be tangent to an arc.
   * The Bezier's tangent direction at the specified end must be perpendicular to the arc's radius.
   *
   * @param bezier — the Bezier curve
   * @param arc — the arc to be tangent to
   * @param atBezierStart — use bezier start (P0→P1 tangent) or end (P3→P2 tangent)
   * @param atArcStart — use arc's start or end as the contact point
   */
  bezierTangentArc(bezier: any, arc: any, atBezierStart: boolean, atArcStart: boolean): this {
    const bezId = this.resolveBezierId(bezier);
    const bz = this.beziers.find((b) => b.id === bezId)!;
    // Resolve to the two control points that define the tangent direction
    const tangentBase = atBezierStart ? bz.p0 : bz.p3;
    const tangentControl = atBezierStart ? bz.p1 : bz.p2;
    return this.constrain({ type: 'bezierTangentArc', tangentBase, tangentControl, arc: this.resolveArcId(arc), atArcStart } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  // ─── Smooth blend (high-level curve connection) ──────────────────────────

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
  smoothBlend(
    arc1: any,
    arc2: any,
    options?: {
      /** 0–1, controls which arc dominates. 0.5 = symmetric. Default 0.5. */
      weight?: number;
      /** Which end of arc1 to blend from. Default 'end'. */
      arc1End?: 'start' | 'end';
      /** Which end of arc2 to blend to. Default 'start'. */
      arc2End?: 'start' | 'end';
    },
  ): BezierId {
    const arc1Id = this.resolveArcId(arc1);
    const arc2Id = this.resolveArcId(arc2);
    const { weight = 0.5, arc1End = 'end', arc2End = 'start' } = options ?? {};

    const a1 = this.arcs.find((a) => a.id === arc1Id)!;
    const a2 = this.arcs.find((a) => a.id === arc2Id)!;

    // Get the junction points
    const p0Id = arc1End === 'start' ? a1.start : a1.end;
    const p3Id = arc2End === 'start' ? a2.start : a2.end;

    const pt0 = this.getPoint(p0Id)!;
    const pt3 = this.getPoint(p3Id)!;
    const c1 = this.getPoint(a1.center)!;
    const c2 = this.getPoint(a2.center)!;

    // Compute the arc's forward tangent direction at each junction point.
    // For a CCW arc, tangent = rotate radius 90° CCW: (-ry, rx)
    // For a CW arc, tangent = rotate radius 90° CW: (ry, -rx)
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

    // Bezier departure direction at P0:
    //   If P0 is arc1's END → depart in same direction as arc's travel: +t_fwd
    //   If P0 is arc1's START → depart opposite (arc enters here): -t_fwd
    const sign1 = arc1End === 'end' ? 1 : -1;
    let t1x = tf1x * sign1;
    let t1y = tf1y * sign1;

    // Bezier arrival direction at P3:
    //   The Bezier's tangent at P3 is (P3-P2). For G1 continuity:
    //   If P3 is arc2's START → arrive in arc's forward direction: P3-P2 ∝ t_fwd, so P2 = P3 - t_fwd*h
    //   If P3 is arc2's END → arrive in reversed arc direction: P3-P2 ∝ -t_fwd, so P2 = P3 + t_fwd*h
    const sign2 = arc2End === 'start' ? -1 : 1;
    let t2x = tf2x * sign2; // direction to offset P2 from P3
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
  }

  // ─── Shape constraint helpers ─────────────────────────────────────────────

  /** Constrain the bounding-box width of a shape. */
  shapeWidth(shape: any, value: number): this {
    this.requireFinite(value, 'shapeWidth');
    return this.constrain({ type: 'shapeWidth', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the bounding-box height of a shape. */
  shapeHeight(shape: any, value: number): this {
    this.requireFinite(value, 'shapeHeight');
    return this.constrain({ type: 'shapeHeight', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the X coordinate of a shape's centroid. */
  shapeCentroidX(shape: any, value: number): this {
    this.requireFinite(value, 'shapeCentroidX');
    return this.constrain({ type: 'shapeCentroidX', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the Y coordinate of a shape's centroid. */
  shapeCentroidY(shape: any, value: number): this {
    this.requireFinite(value, 'shapeCentroidY');
    return this.constrain({ type: 'shapeCentroidY', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain the area of a shape. */
  shapeArea(shape: any, value: number): this {
    this.requireFinite(value, 'shapeArea');
    return this.constrain({ type: 'shapeArea', shape: this.resolveShapeId(shape), value } as Omit<SketchConstraint, 'id'>);
  }

  /** Constrain two shapes to share the same centroid. */
  shapeEqualCentroid(a: any, b: any): this {
    return this.constrain({ type: 'shapeEqualCentroid', a: this.resolveShapeId(a), b: this.resolveShapeId(b) } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Constrain the unsigned angle between two lines (accepts both orientations). */
  angleBetween(a: any, b: any, value: number): this {
    this.requireFinite(value, 'angleBetween');
    return this.constrain({ type: 'angleBetween', a: this.resolveLineId(a), b: this.resolveLineId(b), value } as Omit<
      SketchConstraint,
      'id'
    >);
  }

  /** Enforce counter-clockwise winding on a polygon defined by its vertices. */
  ccw(...points: any[]): this {
    return this.constrain({ type: 'ccw', points: points.map((p) => this.resolvePointId(p)) } as Omit<SketchConstraint, 'id'>);
  }

  // ─── Loop helpers ──────────────────────────────────────────────────────────

  /**
   * Register a closed polygon loop from an explicit ordered list of point IDs.
   */
  addLoop(points: any[]): this {
    if (points.length < 3) throw new Error('addLoop(): needs at least 3 points');
    this.loops.push({ type: 'poly', points: points.map((p) => this.resolvePointId(p)) });
    return this;
  }

  /**
   * Register a closed profile loop from an explicit ordered list of segments.
   * Each segment is { kind: 'line', line: LineId }, { kind: 'arc', arc: ArcId },
   * or { kind: 'bezier', bezier: BezierId }.
   */
  addProfileLoop(segments: Array<{ kind: 'line'; line: any } | { kind: 'arc'; arc: any } | { kind: 'bezier'; bezier: any }>): this {
    const resolved = segments.map((seg) => {
      if (seg.kind === 'line') return { kind: 'line' as const, line: this.resolveLineId(seg.line) };
      if (seg.kind === 'arc') return { kind: 'arc' as const, arc: this.resolveArcId(seg.arc) };
      return { kind: 'bezier' as const, bezier: this.resolveBezierId(seg.bezier) };
    });
    this.loops.push({ type: 'profile', segments: resolved });
    return this;
  }

  solve(options: SolveOptions = {}): ConstraintSketch {
    // Release the session — the final solve uses the stateless path which
    // benefits from progressive + analysis + DOF metadata.
    this.destroySession();
    return solveConstraintDefinition(this.buildDefinition(), {
      iterations: options.iterations ?? 80,
      restarts: options.restarts ?? 6,
      warmStartIterations: options.warmStartIterations ?? 6,
      maxScaledStep: options.maxScaledStep ?? 2.5,
      fallbackRestarts: options.fallbackRestarts,
      tolerance: options.tolerance,
      skipRedundancyCheck: options.skipRedundancyCheck,
      presolveConstraintId: options.presolveConstraintId,
      progressive: options.progressive ?? true,
      timeBudgetMs: options.timeBudgetMs ?? 10_000, // default 10s timeout
    });
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
    const { maxError } = solveConstraints(def, options, 'builder.solveConstraintsOnly');
    return { maxError, rejectedCount: def.rejectedConstraints.length, definition: def };
  }

  private buildDefinition(extraConstraint?: SketchConstraint): ConstraintDefinition {
    return {
      // Include all points/lines (group-owned ones are filtered at serialization to Rust).
      points: this.points.map((p) => ({ ...p })),
      lines: this.lines.map((l) => ({ ...l })),
      circles: this.circles.map((c) => ({ ...c })),
      arcs: this.arcs.map((a) => ({ ...a })),
      beziers: this.beziers.map((b) => ({ ...b })),
      shapes: this.shapes.map((s) => ({ ...s, lines: [...s.lines] })),
      groups: this._groups.map((g) => ({
        ...g,
        points: g.points.map((p) => ({ ...p })),
        lines: g.lines.map((l) => ({ ...l })),
      })),
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

  /** Sync solved positions from a definition back to the builder's live entities. */
  private syncFromDefinition(def: ConstraintDefinition): void {
    // Sync non-group points from the definition.
    const defPointMap = new Map(def.points.map((p) => [p.id, p]));
    for (const p of this.points) {
      if (this.groupOwnedPointIds.has(p.id)) continue;
      const dp = defPointMap.get(p.id);
      if (dp) {
        p.x = dp.x;
        p.y = dp.y;
      }
    }
    for (let i = 0; i < this.circles.length; i++) {
      this.circles[i].radius = def.circles[i].radius;
    }
    const defArcs = def.arcs ?? [];
    for (let i = 0; i < this.arcs.length; i++) {
      if (i < defArcs.length) this.arcs[i].radius = defArcs[i].radius;
    }
    // Sync group frame positions and recompute world coordinates of group-owned points.
    const defGroupMap = new Map((def.groups ?? []).map((g) => [g.id, g]));
    const builderPointMap = new Map(this.points.map((p) => [p.id, p]));
    for (const g of this._groups) {
      const dg = defGroupMap.get(g.id);
      if (dg) {
        g.x = dg.x;
        g.y = dg.y;
        g.theta = dg.theta;
        const cosT = Math.cos(g.theta);
        const sinT = Math.sin(g.theta);
        for (const lp of g.points) {
          const bp = builderPointMap.get(lp.id);
          if (bp) {
            bp.x = g.x + lp.lx * cosT - lp.ly * sinT;
            bp.y = g.y + lp.lx * sinT + lp.ly * cosT;
          }
        }
      }
    }
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
    if (this._sessionHandle !== null) {
      this._sessionApi!.session_add_arc(this._sessionHandle, id, centerId, startId, endId, r, clockwise);
    }
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
  importRectangle(
    r: {
      vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }];
    },
    fixed = false,
  ): { bottom: LineId; right: LineId; top: LineId; left: LineId; points: [PointId, PointId, PointId, PointId] } {
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
  referenceAllFrom(source: ConstraintSketch): { points: Map<string, PointId>; lines: Map<string, LineId> } {
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
    const pts = this.points.filter((p) => !p.id.startsWith('ref-'));
    if (pts.length === 0) return null;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
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

// ─── Sketch group builder ─────────────────────────────────────────────────────

export interface SketchGroupHandle {
  readonly id: GroupId;
  /** Get a group vertex PointId by its index (order of `.point()` calls). */
  point(index: number): PointId;
  /** Get a group line LineId by its index (order of `.line()` calls). */
  line(index: number): LineId;
  /** All group vertex PointIds in creation order. */
  readonly vertices: PointId[];
  /** All group line LineIds in creation order. */
  readonly sides: LineId[];
}

/**
 * Fluent builder for a rigid-body group within a constrained sketch.
 *
 * Points are specified in local coordinates relative to the group's origin.
 * The solver optimises 3 frame DOF (x, y, θ) instead of 2N point DOF.
 */
export class SketchGroupBuilder {
  private sk: ConstrainedSketchBuilder;
  private groupId: GroupId;
  private gx: number;
  private gy: number;
  private gtheta: number;
  private localPoints: SketchGroupLocalPoint[] = [];
  private localLines: { id: LineId; a: PointId; b: PointId }[] = [];
  private isFixed = false;
  private isFixedRotation = false;
  private registered = false;

  constructor(sk: ConstrainedSketchBuilder, opts: { x?: number; y?: number; theta?: number; id?: string }) {
    this.sk = sk;
    this.gx = opts.x ?? 0;
    this.gy = opts.y ?? 0;
    this.gtheta = opts.theta ?? 0;
    this.groupId = opts.id ?? `grp-${(sk as any).nextId++}`;
  }

  /** Add a point in local coordinates. Returns its globally-addressable PointId. */
  point(lx: number, ly: number): PointId {
    if (!Number.isFinite(lx) || !Number.isFinite(ly)) {
      throw new Error(`group.point(): coordinates must be finite, got (${lx}, ${ly})`);
    }
    const id: PointId = `pt-${(this.sk as any).nextId++}`;
    this.localPoints.push({ id, lx, ly });

    // Compute world position and register the point in the builder so
    // it's addressable by resolvePointId and visible to constraints.
    const cosT = Math.cos(this.gtheta);
    const sinT = Math.sin(this.gtheta);
    const wx = this.gx + lx * cosT - ly * sinT;
    const wy = this.gy + lx * sinT + ly * cosT;
    (this.sk as any).points.push({ id, x: wx, y: wy, fixed: this.isFixed });
    return id;
  }

  /** Connect two group points with a line. Both must be PointIds from this group. */
  line(a: PointId, b: PointId, name?: string): LineId {
    const id: LineId = `ln-${(this.sk as any).nextId++}`;
    this.localLines.push({ id, a, b });
    // Register in the builder's lines array for constraint resolution.
    (this.sk as any).lines.push({ id, a, b, construction: false, name });
    return id;
  }

  /** Freeze rotation (θ). Group can still translate — 2 DOF remain. */
  fixRotation(): this {
    this.isFixedRotation = true;
    return this;
  }

  /** Freeze all 3 DOF — group is completely fixed. */
  fix(): this {
    this.isFixed = true;
    return this;
  }

  /**
   * Finalize and register the group with the builder.
   * Returns a handle for referencing group points/lines in constraints.
   */
  done(): SketchGroupHandle {
    if (this.registered) throw new Error('group.done(): already finalized');
    this.registered = true;

    const group: SketchGroup = {
      id: this.groupId,
      x: this.gx,
      y: this.gy,
      theta: this.gtheta,
      fixed: this.isFixed,
      fixedRotation: this.isFixedRotation,
      points: this.localPoints,
      lines: this.localLines,
    };
    this.sk._registerGroup(group);

    const vertices = this.localPoints.map((p) => p.id);
    const sides = this.localLines.map((l) => l.id);
    const groupId = this.groupId;
    return {
      id: groupId,
      vertices,
      sides,
      point(index: number): PointId {
        if (index < 0 || index >= vertices.length) throw new Error(`group.point(${index}): index out of range (${vertices.length} points)`);
        return vertices[index];
      },
      line(index: number): LineId {
        if (index < 0 || index >= sides.length) throw new Error(`group.line(${index}): index out of range (${sides.length} lines)`);
        return sides[index];
      },
    };
  }
}

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
import type { Sketch } from '../core';
import { getSessionApi, type WasmSessionApi } from './solver-wasm';

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
        return this.point(p.x, p.y);
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
        const a = this.point(l.start.x, l.start.y);
        const b = this.point(l.end.x, l.end.y);
        return this.line(a, b);
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

  solve(options: SolveOptions = {}): ConstraintSketch | Sketch {
    // If route() computed an analytical result, return it directly
    if ((this as any)._routeSketch) return (this as any)._routeSketch;

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

/** Build a parametric 2D sketch with geometric constraints solved by the built-in constraint solver. */
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

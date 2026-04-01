/**
 * Shared TS-side builder, display, and wire-format types for constraints.
 *
 * These types describe the Rust-backed boundary and the remaining UI/builder surface.
 */
import type { HighlightDef } from '../highlights';
export type PointId = string;
export type LineId = string;
export type CircleId = string;
export type ArcId = string;
export type BezierId = string;
export type ShapeId = string;
export type GroupId = string;

export interface SketchArc {
  id: ArcId;
  /** Center point of the arc's circle. */
  center: PointId;
  /** Point on the arc where it begins. Must lie on the circle. */
  start: PointId;
  /** Point on the arc where it ends. Must lie on the circle. */
  end: PointId;
  /** Current solved radius — kept consistent with |center–start| and |center–end| by the solver. */
  radius: number;
  /** True → arc sweeps clockwise from start to end; false → counter-clockwise. */
  clockwise: boolean;
  construction: boolean;
  /** Optional human-readable name for display. */
  name?: string;
}

export interface SketchShape {
  id: ShapeId;
  /** Ordered list of line IDs forming a closed polygon. */
  lines: LineId[];
}

/** A point in a group's local coordinate frame. */
export interface SketchGroupLocalPoint {
  id: PointId;
  lx: number;
  ly: number;
}

/**
 * A rigid-body group: N local points with a shared coordinate frame (x, y, θ).
 * The solver optimises over the 3 frame DOF instead of 2N point DOF.
 */
export interface SketchGroup {
  id: GroupId;
  /** World position of the group's local origin. */
  x: number;
  y: number;
  /** Rotation angle (radians) of the group frame. */
  theta: number;
  /** When true, all 3 DOF are frozen. */
  fixed: boolean;
  /** When true, θ is frozen — only translation DOF remain. */
  fixedRotation: boolean;
  /** Points in local coordinates. */
  points: SketchGroupLocalPoint[];
  /** Lines connecting local points (using their global IDs). */
  lines: { id: LineId; a: PointId; b: PointId }[];
}

export interface SketchPoint {
  id: PointId;
  x: number;
  y: number;
  fixed: boolean;
}

export interface SketchLine {
  id: LineId;
  a: PointId;
  b: PointId;
  construction: boolean;
  /** Optional human-readable name for display (e.g. "top", "bottom"). */
  name?: string;
}

export interface SketchCircle {
  id: CircleId;
  center: PointId;
  radius: number;
  construction: boolean;
  fixedRadius: boolean;
  segments: number;
  /** Optional human-readable name for display. */
  name?: string;
}

/** A cubic Bezier curve defined by four control points. */
export interface SketchBezier {
  id: BezierId;
  /** First control point (start of curve). */
  p0: PointId;
  /** Second control point (controls tangent at start). */
  p1: PointId;
  /** Third control point (controls tangent at end). */
  p2: PointId;
  /** Fourth control point (end of curve). */
  p3: PointId;
  construction: boolean;
  /** Optional human-readable name for display. */
  name?: string;
}

/** A segment in a mixed line/arc/bezier profile loop. */
export type ProfileSegment = { kind: 'line'; line: LineId } | { kind: 'arc'; arc: ArcId } | { kind: 'bezier'; bezier: BezierId };

export type SketchLoop =
  | { type: 'poly'; points: PointId[] }
  | { type: 'circle'; circle: CircleId }
  /** Mixed profile of line and arc segments forming a closed loop. */
  | { type: 'profile'; segments: ProfileSegment[] };

// ─── Annotation elements ──────────────────────────────────────────────────────

/** A single visual element in a constraint's annotation. */
export type AnnotationElement =
  /** Symbol placed at a specific position (geometric constraints like parallel, equal, fixed). */
  | { kind: 'symbol'; position: [number, number]; symbol: ConstraintSymbol; rotation?: number }
  /** Dimension line with extension lines (length, distance). */
  | { kind: 'dimension'; from: [number, number]; to: [number, number]; offset: number; value: string }
  /** Angle arc between two directions (angle, absoluteAngle). */
  | { kind: 'angle-arc'; center: [number, number]; startAngle: number; endAngle: number; radius: number; value: string }
  /** Fallback text label for constraints not yet migrated to annotations. */
  | { kind: 'text'; position: [number, number]; text: string };

/** Named symbols rendered as SVG paths, not Unicode glyphs. */
export type ConstraintSymbol =
  | 'parallel' // >> tick marks
  | 'equal' // = double line
  | 'perpendicular' // right-angle box
  | 'horizontal' // H
  | 'vertical' // V
  | 'fixed' // ground/anchor hatching
  | 'midpoint' // diamond
  | 'coincident' // target dot
  | 'collinear' // dot on line
  | 'tangent' // T
  | 'concentric' // concentric circles
  | 'ccw' // curved arrow
  | 'symmetric'; // mirror axis mark

// ─── Constraint display ───────────────────────────────────────────────────────

export interface ConstraintDisplay {
  id: string;
  type: string;
  label: string;
  /** Legacy position — used as fallback when annotations are not defined. */
  position: [number, number];
  value?: number;
  isDimension: boolean;
  /** True when the solver failed to satisfy this constraint (genuinely conflicting geometry). */
  isConflicting: boolean;
  /** True when this constraint is mathematically redundant — it duplicates an equation already
   * provided by another constraint, making the DOF count negative even though the solver converges. */
  isRedundant: boolean;
  /** For rejected constraints: why the builder rejected it (maxError, constraint params, blame). */
  rejectionReason?: string;
  /** Entity IDs referenced by this constraint (points, lines, circles, etc.). */
  entityIds: string[];
  /** Per-equation residual error for this constraint (how far off it is). */
  residual: number;
  /** Annotation elements for this constraint. Empty array → use legacy text fallback. */
  annotations: AnnotationElement[];
}

/** Metadata for a detected surface region (from arrangement detection). */
export interface SurfaceDisplay {
  /** Zero-based index, largest-first by area. */
  index: number;
  /** Region area in mm². */
  area: number;
  /** Centroid of the region polygon. */
  centroid: [number, number];
  /** Axis-aligned bounding box. */
  bounds: { min: [number, number]; max: [number, number] };
  /** A point guaranteed to be inside the region — usable as seed for detectArrangementRegion(). */
  seed: [number, number];
  /** Polygon vertices (CCW winding) for rendering the region fill. */
  polygon: [number, number][];
}

export interface SketchConstraintMeta {
  status: 'under' | 'fully' | 'over' | 'over-redundant';
  /** Net degrees of freedom: positive = under-constrained, 0 = fully, negative = over-constrained. */
  dof: number;
  maxError: number;
  constraints: ConstraintDisplay[];
  rejected: ConstraintDisplay[];
  /** Detected surfaces from line arrangement (DCEL face detection). Empty if no closed regions. */
  surfaces: SurfaceDisplay[];
  construction: {
    lines: { id: string; a: [number, number]; b: [number, number] }[];
    circles: { id: string; center: [number, number]; radius: number }[];
    arcs: { id: string; center: [number, number]; start: [number, number]; end: [number, number]; radius: number; clockwise: boolean }[];
  };
  /** Non-construction geometry edges rendered as solid wireframe overlay. */
  edges: {
    lines: { id: string; name?: string; a: [number, number]; b: [number, number] }[];
    circles: { id: string; name?: string; center: [number, number]; radius: number }[];
    arcs: {
      id: string;
      name?: string;
      center: [number, number];
      start: [number, number];
      end: [number, number];
      radius: number;
      clockwise: boolean;
    }[];
    beziers: { id: string; name?: string; points: [number, number][] }[];
    points: { id: string; pos: [number, number] }[];
  };
  /** True when the solver hit its time budget before fully converging. */
  timedOut?: boolean;
  /** Programmatic debug highlights from user code. */
  highlights?: HighlightDef[];
}

export interface ConstraintDefinition {
  points: SketchPoint[];
  lines: SketchLine[];
  circles: SketchCircle[];
  arcs: SketchArc[];
  beziers: SketchBezier[];
  shapes: SketchShape[];
  /** Rigid-body groups — the solver sees 3 DOF per group instead of 2N per point. */
  groups: SketchGroup[];
  loops: SketchLoop[];
  constraints: SketchConstraint[];
  rejectedConstraints: SketchConstraint[];
  /** Maps rejected constraint ID → human-readable reason. Populated by the builder. */
  rejectionReasons?: Map<string, string>;
}

export interface SolveOptions {
  /** Maximum number of LM outer iterations per restart. */
  iterations?: number;
  /** Infinity-norm residual tolerance for declaring convergence. */
  tolerance?: number;
  /** Number of deterministic restart seeds used by the global solver. */
  restarts?: number;
  /** Optional projector iterations used only for initialisation, not as the main solver. */
  warmStartIterations?: number;
  /** Maximum LM step length in scaled variable space. Larger = bolder, smaller = safer. */
  maxScaledStep?: number;
  /** Skip redundancy detection (safe when topology is unchanged and previous DOF >= 0). */
  skipRedundancyCheck?: boolean;
  /** Run the targeted presolve hook for this constraint before the main solve. */
  presolveConstraintId?: string;
  /** When set and the first solve exceeds tolerance*5, retry with this many restarts. */
  fallbackRestarts?: number;
  /** Add constraints progressively with short LM solves, all in one WASM call. */
  progressive?: boolean;
  /** Wall-clock time budget in ms for the entire solve. 0 = no limit. */
  timeBudgetMs?: number;
}

export interface SolverConstraintResidual {
  id: string;
  residual: number;
}

export interface SolveTrailStep {
  phase: string;
  error: number;
}

export interface SolverMetadata {
  status: 'under' | 'fully' | 'over' | 'over-redundant';
  dof: number;
  constraintResiduals: SolverConstraintResidual[];
  redundantConstraintIds: string[];
  conflictingConstraintIds: string[];
  solveTrail?: SolveTrailStep[];
  /** True when the solver hit its wall-clock time budget before converging. */
  timedOut?: boolean;
}

// ─── Extension interfaces (augmented by each constraint def file via declare module) ───

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConstraintTypeMap {}

export interface ConstraintBuilderMethods {
  // ─── Path construction ───────────────────────────────────────────────────────
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

  // ─── Geometric constraints ───────────────────────────────────────────────────
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

  // ─── Dimensional & tangency constraints ─────────────────────────────────────
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

  // ─── Import & reference geometry ────────────────────────────────────────────
  importPoint(pt: { x: number; y: number }, fixed?: boolean): PointId;
  importLine(l: { start: { x: number; y: number }; end: { x: number; y: number } }, fixed?: boolean): LineId;
  importRectangle(
    r: { vertices: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] },
    fixed?: boolean,
  ): { bottom: LineId; right: LineId; top: LineId; left: LineId; points: [PointId, PointId, PointId, PointId] };
  referencePoint(x: number, y: number): PointId;
  referenceLine(x1: number, y1: number, x2: number, y2: number): LineId;
  referenceFrom(source: any, entityId: string): PointId | LineId | null;
  referenceAllFrom(source: any): { points: Map<string, PointId>; lines: Map<string, LineId> };
}

// Derived union types — automatically include every registered constraint:
export type SketchConstraint = {
  [K in keyof ConstraintTypeMap]: { id: string; type: K } & ConstraintTypeMap[K];
}[keyof ConstraintTypeMap];

export type ConstraintType = keyof ConstraintTypeMap;

// ─── Solver / registry context types ───────────────────────────────────────────

export interface DisplayContext {
  points: Map<PointId, SketchPoint>;
  lines: Map<LineId, SketchLine>;
  circles: Map<CircleId, SketchCircle>;
  arcs: Map<ArcId, SketchArc>;
  beziers: Map<BezierId, SketchBezier>;
  shapes: Map<ShapeId, SketchShape>;
}

// ─── Constraint definition descriptor ─────────────────────────────────────────

export interface ConstraintDef<TType extends string = string, TData extends object = object> {
  type: TType;
  label: string;
  isDimension: boolean;
  /**
   * Number of independent constraint equations this constraint provides.
   * Used for proper DOF arithmetic: DOF = freeVars - sum(equations).
   * Examples: coincident=2, horizontal=1, fixed=0 (point already pinned via pt.fixed).
   */
  equations?: number;
  displayPosition: (constraint: { id: string; type: TType } & TData, ctx: DisplayContext) => [number, number];
  /**
   * Optional annotation geometry for Fusion360-style constraint visualization.
   * Returns an array of visual elements (symbols on entities, dimension lines, arcs).
   * When defined, these replace the single-position text label.
   */
  displayAnnotations?: (constraint: { id: string; type: TType } & TData, ctx: DisplayContext) => AnnotationElement[];
}

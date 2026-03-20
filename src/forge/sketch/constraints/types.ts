/**
 * Shared TS-side builder, display, and wire-format types for constraints.
 *
 * These types describe the Rust-backed boundary and the remaining UI/builder surface.
 */
export type PointId = string;
export type LineId = string;
export type CircleId = string;
export type ArcId = string;
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
}

export interface SketchCircle {
  id: CircleId;
  center: PointId;
  radius: number;
  construction: boolean;
  fixedRadius: boolean;
  segments: number;
}

/** A segment in a mixed line/arc profile loop. */
export type ProfileSegment =
  | { kind: 'line'; line: LineId }
  | { kind: 'arc'; arc: ArcId };

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
  | { kind: 'angle-arc'; center: [number, number]; startAngle: number; endAngle: number;
      radius: number; value: string }
  /** Fallback text label for constraints not yet migrated to annotations. */
  | { kind: 'text'; position: [number, number]; text: string };

/** Named symbols rendered as SVG paths, not Unicode glyphs. */
export type ConstraintSymbol =
  | 'parallel'       // >> tick marks
  | 'equal'          // = double line
  | 'perpendicular'  // right-angle box
  | 'horizontal'     // H
  | 'vertical'       // V
  | 'fixed'          // ground/anchor hatching
  | 'midpoint'       // diamond
  | 'coincident'     // target dot
  | 'collinear'      // dot on line
  | 'tangent'        // T
  | 'concentric'     // concentric circles
  | 'ccw'            // curved arrow
  | 'symmetric'      // mirror axis mark
  ;

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
    lines: { id: string; a: [number, number]; b: [number, number] }[];
    circles: { id: string; center: [number, number]; radius: number }[];
    arcs: { id: string; center: [number, number]; start: [number, number]; end: [number, number]; radius: number; clockwise: boolean }[];
    points: { id: string; pos: [number, number] }[];
  };
}

export interface ConstraintDefinition {
  points: SketchPoint[];
  lines: SketchLine[];
  circles: SketchCircle[];
  arcs: SketchArc[];
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
}

// ─── Extension interfaces (augmented by each constraint def file via declare module) ───

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConstraintTypeMap {}

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ConstraintBuilderMethods {}

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

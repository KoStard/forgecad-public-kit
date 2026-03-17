export type PointId = string;
export type LineId = string;
export type CircleId = string;
export type ArcId = string;
export type ShapeId = string;

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

export interface ConstraintDisplay {
  id: string;
  type: string;
  label: string;
  position: [number, number];
  value?: number;
  isDimension: boolean;
  isConflicting: boolean;
}

export interface SketchConstraintMeta {
  status: 'under' | 'fully' | 'over';
  maxError: number;
  constraints: ConstraintDisplay[];
  rejected: ConstraintDisplay[];
  construction: {
    lines: { a: [number, number]; b: [number, number] }[];
    circles: { center: [number, number]; radius: number }[];
    arcs: { center: [number, number]; start: [number, number]; end: [number, number]; radius: number; clockwise: boolean }[];
  };
  /** Non-construction geometry edges rendered as solid wireframe overlay. */
  edges: {
    lines: { a: [number, number]; b: [number, number] }[];
    circles: { center: [number, number]; radius: number }[];
    arcs: { center: [number, number]; start: [number, number]; end: [number, number]; radius: number; clockwise: boolean }[];
    points: { id: string; pos: [number, number] }[];
  };
}

export interface ConstraintDefinition {
  points: SketchPoint[];
  lines: SketchLine[];
  circles: SketchCircle[];
  arcs: SketchArc[];
  shapes: SketchShape[];
  loops: SketchLoop[];
  constraints: SketchConstraint[];
  rejectedConstraints: SketchConstraint[];
}

export interface SolveOptions {
  iterations?: number;
  tolerance?: number;
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

export interface SolverContext {
  points: Map<PointId, SketchPoint>;
  lines: Map<LineId, SketchLine>;
  circles: Map<CircleId, SketchCircle>;
  arcs: Map<ArcId, SketchArc>;
  shapes: Map<ShapeId, SketchShape>;
  tolerance: number;
  movePoint: (pt: SketchPoint, dx: number, dy: number) => boolean;
}

export interface DisplayContext {
  points: Map<PointId, SketchPoint>;
  lines: Map<LineId, SketchLine>;
  circles: Map<CircleId, SketchCircle>;
  arcs: Map<ArcId, SketchArc>;
  shapes: Map<ShapeId, SketchShape>;
}

export interface DofContext {
  refCount: Map<PointId, number>;
  lines: SketchLine[];
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
  /** Optional pre-solve hook called once before the iteration loop (used by 'fixed'). */
  presolve?: (constraint: { id: string; type: TType } & TData, ctx: SolverContext) => void;
  solve: (constraint: { id: string; type: TType } & TData, ctx: SolverContext) => number;
  /**
   * Optional residual vector for the Newton-Raphson solver.
   * Return an array of values that should all be 0 when the constraint is satisfied.
   * The length must match `equations`. When defined for all active constraints, the
   * NR solver is used instead of Gauss-Seidel, giving order-independent quadratic convergence.
   */
  residual?: (constraint: { id: string; type: TType } & TData, ctx: SolverContext) => number[];
  displayPosition: (constraint: { id: string; type: TType } & TData, ctx: DisplayContext) => [number, number];
  computeDof: (constraint: { id: string; type: TType } & TData, ctx: DofContext) => void;
}

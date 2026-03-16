export type PointId = string;
export type LineId = string;
export type CircleId = string;
export type ShapeId = string;

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

export type SketchLoop =
  | { type: 'poly'; points: PointId[] }
  | { type: 'circle'; circle: CircleId };

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
  };
  /** Non-construction geometry edges rendered as solid wireframe overlay. */
  edges: {
    lines: { a: [number, number]; b: [number, number] }[];
    circles: { center: [number, number]; radius: number }[];
    points: [number, number][];
  };
}

export interface ConstraintDefinition {
  points: SketchPoint[];
  lines: SketchLine[];
  circles: SketchCircle[];
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
  shapes: Map<ShapeId, SketchShape>;
  tolerance: number;
  movePoint: (pt: SketchPoint, dx: number, dy: number) => boolean;
}

export interface DisplayContext {
  points: Map<PointId, SketchPoint>;
  lines: Map<LineId, SketchLine>;
  circles: Map<CircleId, SketchCircle>;
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
  /** Optional pre-solve hook called once before the iteration loop (used by 'fixed'). */
  presolve?: (constraint: { id: string; type: TType } & TData, ctx: SolverContext) => void;
  solve: (constraint: { id: string; type: TType } & TData, ctx: SolverContext) => number;
  displayPosition: (constraint: { id: string; type: TType } & TData, ctx: DisplayContext) => [number, number];
  computeDof: (constraint: { id: string; type: TType } & TData, ctx: DofContext) => void;
}

/**
 * Public TS facade for the Rust-backed constraints package.
 *
 * This file only re-exports builder/types/UI helpers and loads thin descriptor modules.
 */
// Load all constraint definitions (side effects: populates the registry)
import './defs/index';
// Load builder method groups (side effects: augment ConstrainedSketchBuilder prototype)
import './builder-path';
import './builder-geometric';
import './builder-dimensional';
import './builder-reference';
import './builder-route';

import type { SketchConstraint } from './types';

// Re-export everything consumers need
export type {
  PointId,
  LineId,
  CircleId,
  ArcId,
  ShapeId,
  GroupId,
  SketchPoint,
  SketchLine,
  SketchCircle,
  SketchArc,
  SketchShape,
  SketchGroup,
  SketchGroupLocalPoint,
  SketchLoop,
  ProfileSegment,
  ConstraintDisplay,
  SurfaceDisplay,
  SketchConstraintMeta,
  ConstraintDefinition,
  SolveOptions,
  ConstraintType,
  SketchConstraint,
  ConstraintTypeMap,
  ConstraintBuilderMethods,
  ConstraintDef,
  DisplayContext,
} from './types';

export type { LineDistanceConstraint } from './defs/index';

export type { ConstrainedSketchOptions, SketchGroupHandle } from './builder';
export { ConstrainedSketchBuilder, SketchGroupBuilder, constrainedSketch } from './builder';

export {
  ConstraintSketch,
  isConstraintSketch,
  solveConstraintDefinition,
  updateConstraintValue,
  cloneDefinition,
} from './sketch';

export { registerConstraint, installBuilderMethod, getConstraintDef } from './registry';

export type {
  RouteStep,
  RouteLine,
  RouteCircle,
  RouteTangent,
  RouteFillet,
  RouteTangentArc,
  RoutePoint,
  RouteUntil,
} from './builder-route';

export { routeStepFactories } from './builder-route';

export { analyzeRigidity } from './rigidity';
export type { RigidityResult } from './rigidity';

// ─── Backward-compatible constraint interface aliases ──────────────────────────
// These match the old exported interface names from constraints.ts so existing
// code that imports them by name continues to compile.

export type CoincidentConstraint = Extract<SketchConstraint, { type: 'coincident' }>;
export type HorizontalConstraint = Extract<SketchConstraint, { type: 'horizontal' }>;
export type VerticalConstraint = Extract<SketchConstraint, { type: 'vertical' }>;
export type ParallelConstraint = Extract<SketchConstraint, { type: 'parallel' }>;
export type PerpendicularConstraint = Extract<SketchConstraint, { type: 'perpendicular' }>;
export type TangentConstraint = Extract<SketchConstraint, { type: 'tangent' }>;
export type EqualConstraint = Extract<SketchConstraint, { type: 'equal' }>;
export type SymmetricConstraint = Extract<SketchConstraint, { type: 'symmetric' }>;
export type ConcentricConstraint = Extract<SketchConstraint, { type: 'concentric' }>;
export type CollinearConstraint = Extract<SketchConstraint, { type: 'collinear' }>;
export type FixedConstraint = Extract<SketchConstraint, { type: 'fixed' }>;
export type MidpointConstraint = Extract<SketchConstraint, { type: 'midpoint' }>;
export type PointOnCircleConstraint = Extract<SketchConstraint, { type: 'pointOnCircle' }>;
export type DistanceConstraint = Extract<SketchConstraint, { type: 'distance' }>;
export type LengthConstraint = Extract<SketchConstraint, { type: 'length' }>;
export type AngleConstraint = Extract<SketchConstraint, { type: 'angle' }>;
export type RadiusConstraint = Extract<SketchConstraint, { type: 'radius' }>;
export type DiameterConstraint = Extract<SketchConstraint, { type: 'diameter' }>;
export type HorizontalDistanceConstraint = Extract<SketchConstraint, { type: 'hDistance' }>;
export type VerticalDistanceConstraint = Extract<SketchConstraint, { type: 'vDistance' }>;
export type AbsoluteAngleConstraint = Extract<SketchConstraint, { type: 'absoluteAngle' }>;
export type EqualRadiusConstraint = Extract<SketchConstraint, { type: 'equalRadius' }>;
export type ArcLengthConstraint = Extract<SketchConstraint, { type: 'arcLength' }>;
export type LineTangentArcConstraint = Extract<SketchConstraint, { type: 'lineTangentArc' }>;

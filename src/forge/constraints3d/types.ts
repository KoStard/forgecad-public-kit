/**
 * 3D Constraint Solver — Type Definitions
 *
 * Uses existing FaceRef/EdgeRef from topology.ts as geometry references.
 * The solver adds only what's genuinely new: rigid body state, constraint
 * definitions, and solve results.
 */

import type { Vec3 } from '../transform';
import type { FaceRef } from '../sketch/topology';

// ─── Rigid body (solver-internal state) ─────────────────────────────────────

/** Axis reference for cylindrical features (not in topology.ts — genuinely new). */
export interface AxisRef3D {
  /** A point on the axis (body-local). */
  origin: Vec3;
  /** Axis direction (unit vector, body-local). */
  direction: Vec3;
}

/** Named point reference (body-local). */
export interface PointRef3D {
  position: Vec3;
}

/**
 * Solver state for one rigid body.
 * Faces come from TrackedShape.topology — no duplication.
 */
export interface RigidBody {
  id: string;
  /** Translation: [tx, ty, tz]. */
  position: Vec3;
  /** Axis-angle rotation: direction = axis, magnitude = angle in radians. */
  rotation: Vec3;
  /** If true, solver won't move this body. */
  grounded: boolean;
  /** Named faces — sourced from TrackedShape.topology.faces */
  faces: Map<string, FaceRef>;
  /** Named axes — derived from cylindrical faces or user-defined. */
  axes: Map<string, AxisRef3D>;
  /** Named points — face centers, edge midpoints, or user-defined. */
  points: Map<string, PointRef3D>;
}

// ─── Constraint types ───────────────────────────────────────────────────────

export type Constraint3DType =
  | 'flush'
  | 'align'
  | 'parallel'
  | 'faceDistance'
  | 'concentric'
  | 'axisParallel'
  | 'pointCoincident'
  | 'pointOnFace'
  | 'pointOnAxis'
  | 'angle'
  | 'fixed';

/** A reference to a geometry feature on a body: "bodyId:featureName". */
export interface BodyFeatureRef {
  bodyId: string;
  featureName: string;
}

export interface Constraint3D {
  id: string;
  type: Constraint3DType;
  refA: BodyFeatureRef;
  refB: BodyFeatureRef;
  value?: number;
}

// ─── Constraint definition (registry pattern) ───────────────────────────────

export interface Constraint3DDef<T extends Constraint3DType = Constraint3DType> {
  type: T;
  equations: number;
  residual: (constraint: Constraint3D, ctx: Solver3DContext) => number[];
}

// ─── Solver context ─────────────────────────────────────────────────────────

export interface Solver3DContext {
  bodies: Map<string, RigidBody>;
  toWorld: (bodyId: string, point: Vec3) => Vec3;
  toWorldDir: (bodyId: string, dir: Vec3) => Vec3;
  worldFace: (bodyId: string, faceName: string) => { normal: Vec3; center: Vec3 };
  worldAxis: (bodyId: string, axisName: string) => { origin: Vec3; direction: Vec3 };
  worldPoint: (bodyId: string, pointName: string) => Vec3;
}

// ─── Solve options and result ───────────────────────────────────────────────

export interface Solve3DOptions {
  iterations?: number;
  tolerance?: number;
  restarts?: number;
  initialLambda?: number;
}

export type Solve3DStatus = 'under' | 'fully' | 'over' | 'over-redundant' | 'conflicting';

export interface Solve3DResult {
  status: Solve3DStatus;
  dof: number;
  maxError: number;
  transforms: Map<string, { position: Vec3; rotation: Vec3 }>;
  iterations: number;
  converged: boolean;
}

/**
 * 3D Constraint Solver — Public API
 *
 * Integrates with existing ecosystem:
 * - Uses FaceRef from topology.ts (no duplicate face type)
 * - bodyFromTrackedShape() bridges TrackedShape → solver
 * - MateBuilder collects constraints for Assembly.mate()
 * - constrain3d() is the standalone quick-positioning entry point
 */

export { bodyFromRefs, bodyFromTrackedShape, constrain3d, MateBuilder } from './builder';
export { add3, cross3, dot3, len3, normalize3, rodrigues, scale3, sub3, transformDir, transformPoint } from './rodrigues';
export { solve3D } from './solver';
export type {
  AxisRef3D,
  BodyFeatureRef,
  Constraint3D,
  Constraint3DDef,
  Constraint3DType,
  PointRef3D,
  RigidBody,
  Solve3DOptions,
  Solve3DResult,
  Solve3DStatus,
  Solver3DContext,
} from './types';

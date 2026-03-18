/**
 * 3D Constraint Solver — Public API
 *
 * Integrates with existing ecosystem:
 * - Uses FaceRef from topology.ts (no duplicate face type)
 * - bodyFromTrackedShape() bridges TrackedShape → solver
 * - MateBuilder collects constraints for Assembly.mate()
 * - constrain3d() is the standalone quick-positioning entry point
 */

export { solve3D } from './solver';
export { bodyFromTrackedShape, bodyFromRefs, MateBuilder, constrain3d } from './builder';
export type {
  RigidBody,
  Constraint3D,
  Constraint3DType,
  Constraint3DDef,
  AxisRef3D,
  PointRef3D,
  BodyFeatureRef,
  Solver3DContext,
  Solve3DOptions,
  Solve3DResult,
  Solve3DStatus,
} from './types';
export { rodrigues, transformPoint, transformDir, dot3, cross3, sub3, add3, scale3, len3, normalize3 } from './rodrigues';

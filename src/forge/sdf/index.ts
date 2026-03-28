/**
 * SDF module barrel export.
 *
 * The `sdf` namespace is the user-facing API. Internal types (SdfNode, evaluator)
 * are imported directly by the backend lowering code.
 */

export type { SdfToShapeOptions, TpmsOptions } from './sdf';
export {
  bend,
  box,
  capsule,
  cone,
  cylinder,
  diamond,
  // Custom
  fromFunction,
  // TPMS
  gyroid,
  morph,
  repeat,
  // Builder class
  SdfShape,
  schwarzP,
  smoothDifference,
  smoothIntersection,
  // Smooth combinators
  smoothUnion,
  // Primitives
  sphere,
  torus,
  // Domain ops
  twist,
} from './sdf';

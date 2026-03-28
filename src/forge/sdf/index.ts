/**
 * SDF module barrel export.
 *
 * The `sdf` namespace is the user-facing API. Internal types (SdfNode, evaluator)
 * are imported directly by the backend lowering code.
 */

export type {
  HoneycombOptions,
  KnurlOptions,
  NoiseOptions,
  PerforatedOptions,
  SdfToShapeOptions,
  TpmsOptions,
  VoronoiOptions,
  WavesOptions,
} from './sdf';
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
  // Patterns
  honeycomb,
  knurl,
  morph,
  // Noise
  noise,
  perforated,
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
  voronoi,
  waves,
} from './sdf';

/**
 * SDF module barrel export.
 *
 * The `sdf` namespace is the user-facing API. Internal types (SdfNode, evaluator)
 * are imported directly by the backend lowering code.
 */

export type {
  BlendOptions,
  BrickOptions,
  HoneycombOptions,
  KnurlOptions,
  NoiseOptions,
  PerforatedOptions,
  ScalesOptions,
  SdfToShapeOptions,
  TpmsOptions,
  VoronoiOptions,
  WavesOptions,
} from './sdf';
export {
  bend,
  blend,
  box,
  // Surface patterns
  brick,
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
  lidinoid,
  morph,
  // Noise
  noise,
  perforated,
  repeat,
  scales,
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

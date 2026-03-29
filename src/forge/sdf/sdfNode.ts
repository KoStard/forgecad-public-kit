/**
 * SDF Expression Tree — the compile-time IR for signed distance field shapes.
 *
 * Each node represents either a primitive distance function, a combinator
 * (boolean-like), or a domain operation (twist, bend, repeat, etc.).
 * The tree is compiled into a (Vec3) => number evaluator at lowering time.
 */

export type Vec3 = [number, number, number];

// ─── Primitive nodes ─────────────────────────────────────────────────────────

export interface SdfSphereNode {
  kind: 'sdf:sphere';
  radius: number;
}

export interface SdfBoxNode {
  kind: 'sdf:box';
  halfExtents: Vec3;
}

export interface SdfCylinderNode {
  kind: 'sdf:cylinder';
  height: number;
  radius: number;
}

export interface SdfTorusNode {
  kind: 'sdf:torus';
  majorRadius: number;
  minorRadius: number;
}

export interface SdfCapsuleNode {
  kind: 'sdf:capsule';
  height: number;
  radius: number;
}

export interface SdfConeNode {
  kind: 'sdf:cone';
  height: number;
  radius: number;
}

// ─── Combinator nodes ────────────────────────────────────────────────────────

export interface SdfUnionNode {
  kind: 'sdf:union';
  children: SdfNode[];
}

export interface SdfDifferenceNode {
  kind: 'sdf:difference';
  /** First child is the base; subsequent children are subtracted. */
  children: SdfNode[];
}

export interface SdfIntersectionNode {
  kind: 'sdf:intersection';
  children: SdfNode[];
}

export interface SdfSmoothUnionNode {
  kind: 'sdf:smoothUnion';
  children: SdfNode[];
  radius: number;
}

export interface SdfSmoothDifferenceNode {
  kind: 'sdf:smoothDifference';
  children: SdfNode[];
  radius: number;
}

export interface SdfSmoothIntersectionNode {
  kind: 'sdf:smoothIntersection';
  children: SdfNode[];
  radius: number;
}

export interface SdfMorphNode {
  kind: 'sdf:morph';
  a: SdfNode;
  b: SdfNode;
  /** 0 = fully a, 1 = fully b */
  t: number;
}

// ─── Domain operations ───────────────────────────────────────────────────────

export interface SdfTranslateNode {
  kind: 'sdf:translate';
  child: SdfNode;
  offset: Vec3;
}

export interface SdfRotateNode {
  kind: 'sdf:rotate';
  child: SdfNode;
  /** Euler angles in degrees (X, Y, Z) */
  degrees: Vec3;
}

export interface SdfScaleNode {
  kind: 'sdf:scale';
  child: SdfNode;
  factor: number;
}

export interface SdfTwistNode {
  kind: 'sdf:twist';
  child: SdfNode;
  /** Total twist angle in degrees over the full height of the shape */
  degreesPerUnit: number;
}

export interface SdfBendNode {
  kind: 'sdf:bend';
  child: SdfNode;
  /** Bend radius — larger = gentler bend */
  radius: number;
}

export interface SdfRepeatNode {
  kind: 'sdf:repeat';
  child: SdfNode;
  /** Spacing between repetitions [x, y, z]. 0 = no repetition on that axis. */
  spacing: Vec3;
  /** Max repetition count per side. 0 = infinite. */
  count: Vec3;
}

export interface SdfShellNode {
  kind: 'sdf:shell';
  child: SdfNode;
  thickness: number;
}

export interface SdfDisplaceNode {
  kind: 'sdf:displace';
  child: SdfNode;
  /** Serialized as a function body string: receives (x, y, z) and returns a number. */
  functionBody: string;
  /** Named constants injected as additional function parameters (avoids closure serialization issues). */
  constants?: Record<string, number>;
}

export interface SdfSurfaceDisplaceNode {
  kind: 'sdf:surfaceDisplace';
  child: SdfNode;
  /**
   * Function body string: receives (u, v) in surface millimeters and returns a height
   * displacement value. Negative = into surface, positive = outward.
   */
  patternBody: string;
  /** Named constants injected as additional function parameters. */
  constants?: Record<string, number>;
  /** Override auto-detected UV mode. Undefined or 'auto' = auto-detect from child tree. */
  uvMode?: 'auto' | 'sphere' | 'cylinder' | 'torus' | 'triplanar';
  /** Triplanar blend sharpness (only used when UV mode is triplanar). Default: 4. */
  triplanarSharpness?: number;
}

export interface SdfOnionNode {
  kind: 'sdf:onion';
  child: SdfNode;
  /** Number of concentric layers */
  layers: number;
  thickness: number;
}

// ─── TPMS lattice nodes ─────────────────────────────────────────────────────

export interface SdfGyroidNode {
  kind: 'sdf:gyroid';
  cellSize: number;
  thickness: number;
}

export interface SdfSchwarzPNode {
  kind: 'sdf:schwarzP';
  cellSize: number;
  thickness: number;
}

export interface SdfDiamondNode {
  kind: 'sdf:diamond';
  cellSize: number;
  thickness: number;
}

export interface SdfLidinoidNode {
  kind: 'sdf:lidinoid';
  cellSize: number;
  thickness: number;
}

// ─── Spatial blend ──────────────────────────────────────────────────────────

export interface SdfSpatialBlendNode {
  kind: 'sdf:spatialBlend';
  a: SdfNode;
  b: SdfNode;
  /** Function body returning 0..1. 0 = fully a, 1 = fully b. */
  functionBody: string;
  constants?: Record<string, number>;
}

// ─── Noise / pattern nodes ──────────────────────────────────────────────────

export interface SdfNoiseNode {
  kind: 'sdf:noise';
  /** Spatial frequency — smaller = larger features. */
  scale: number;
  /** Peak displacement amplitude. */
  amplitude: number;
  /** Number of octaves for fractal Brownian motion (1 = plain simplex). */
  octaves: number;
  /** Seed for deterministic variation. 0 = default permutation. */
  seed: number;
}

export interface SdfVoronoiNode {
  kind: 'sdf:voronoi';
  /** Size of each Voronoi cell in world units. */
  cellSize: number;
  /** Wall thickness between cells. */
  wallThickness: number;
  /** Seed for deterministic variation. */
  seed: number;
  /**
   * When set, enables surface-aware mode using IQ two-pass with membrane suppression.
   * The child SDF's gradient is used to estimate the surface normal, and walls aligned
   * with that normal are suppressed. This is the child SDF tree whose gradient provides
   * the surface normal for filtering.
   */
  surfaceChild?: SdfNode;
  /**
   * Membrane suppression threshold (0..1). Higher = more aggressive suppression.
   * 0 = no filtering, 1 = suppress all walls. Default: 0.7.
   */
  suppressionThreshold?: number;
}

// ─── Custom SDF function ─────────────────────────────────────────────────────

export interface SdfCustomNode {
  kind: 'sdf:custom';
  /** Function body string: receives (x, y, z) and returns signed distance. */
  functionBody: string;
  bounds: { min: Vec3; max: Vec3 };
  /** Named constants injected as additional function parameters (avoids closure serialization issues). */
  constants?: Record<string, number>;
}

// ─── Union type ──────────────────────────────────────────────────────────────

export type SdfNode =
  // Primitives
  | SdfSphereNode
  | SdfBoxNode
  | SdfCylinderNode
  | SdfTorusNode
  | SdfCapsuleNode
  | SdfConeNode
  // Combinators
  | SdfUnionNode
  | SdfDifferenceNode
  | SdfIntersectionNode
  | SdfSmoothUnionNode
  | SdfSmoothDifferenceNode
  | SdfSmoothIntersectionNode
  | SdfMorphNode
  // Domain ops
  | SdfTranslateNode
  | SdfRotateNode
  | SdfScaleNode
  | SdfTwistNode
  | SdfBendNode
  | SdfRepeatNode
  | SdfShellNode
  | SdfDisplaceNode
  | SdfSurfaceDisplaceNode
  | SdfOnionNode
  // TPMS
  | SdfGyroidNode
  | SdfSchwarzPNode
  | SdfDiamondNode
  | SdfLidinoidNode
  // Spatial blend
  | SdfSpatialBlendNode
  // Noise / patterns
  | SdfNoiseNode
  | SdfVoronoiNode
  // Custom
  | SdfCustomNode;

/** Deep-clone an SDF node tree. */
export function cloneSdfNode(node: SdfNode): SdfNode {
  switch (node.kind) {
    // Primitives — plain value types
    case 'sdf:sphere':
      return { kind: 'sdf:sphere', radius: node.radius };
    case 'sdf:box':
      return { kind: 'sdf:box', halfExtents: [...node.halfExtents] };
    case 'sdf:cylinder':
      return { kind: 'sdf:cylinder', height: node.height, radius: node.radius };
    case 'sdf:torus':
      return { kind: 'sdf:torus', majorRadius: node.majorRadius, minorRadius: node.minorRadius };
    case 'sdf:capsule':
      return { kind: 'sdf:capsule', height: node.height, radius: node.radius };
    case 'sdf:cone':
      return { kind: 'sdf:cone', height: node.height, radius: node.radius };

    // Combinators
    case 'sdf:union':
      return { kind: 'sdf:union', children: node.children.map(cloneSdfNode) };
    case 'sdf:difference':
      return { kind: 'sdf:difference', children: node.children.map(cloneSdfNode) };
    case 'sdf:intersection':
      return { kind: 'sdf:intersection', children: node.children.map(cloneSdfNode) };
    case 'sdf:smoothUnion':
      return { kind: 'sdf:smoothUnion', children: node.children.map(cloneSdfNode), radius: node.radius };
    case 'sdf:smoothDifference':
      return { kind: 'sdf:smoothDifference', children: node.children.map(cloneSdfNode), radius: node.radius };
    case 'sdf:smoothIntersection':
      return { kind: 'sdf:smoothIntersection', children: node.children.map(cloneSdfNode), radius: node.radius };
    case 'sdf:morph':
      return { kind: 'sdf:morph', a: cloneSdfNode(node.a), b: cloneSdfNode(node.b), t: node.t };

    // Domain ops
    case 'sdf:translate':
      return { kind: 'sdf:translate', child: cloneSdfNode(node.child), offset: [...node.offset] };
    case 'sdf:rotate':
      return { kind: 'sdf:rotate', child: cloneSdfNode(node.child), degrees: [...node.degrees] };
    case 'sdf:scale':
      return { kind: 'sdf:scale', child: cloneSdfNode(node.child), factor: node.factor };
    case 'sdf:twist':
      return { kind: 'sdf:twist', child: cloneSdfNode(node.child), degreesPerUnit: node.degreesPerUnit };
    case 'sdf:bend':
      return { kind: 'sdf:bend', child: cloneSdfNode(node.child), radius: node.radius };
    case 'sdf:repeat':
      return { kind: 'sdf:repeat', child: cloneSdfNode(node.child), spacing: [...node.spacing], count: [...node.count] };
    case 'sdf:shell':
      return { kind: 'sdf:shell', child: cloneSdfNode(node.child), thickness: node.thickness };
    case 'sdf:displace':
      return { kind: 'sdf:displace', child: cloneSdfNode(node.child), functionBody: node.functionBody, ...(node.constants ? { constants: { ...node.constants } } : {}) };
    case 'sdf:surfaceDisplace':
      return {
        kind: 'sdf:surfaceDisplace',
        child: cloneSdfNode(node.child),
        patternBody: node.patternBody,
        ...(node.constants ? { constants: { ...node.constants } } : {}),
        ...(node.uvMode ? { uvMode: node.uvMode } : {}),
        ...(node.triplanarSharpness !== undefined ? { triplanarSharpness: node.triplanarSharpness } : {}),
      };
    case 'sdf:onion':
      return { kind: 'sdf:onion', child: cloneSdfNode(node.child), layers: node.layers, thickness: node.thickness };

    // TPMS
    case 'sdf:gyroid':
      return { kind: 'sdf:gyroid', cellSize: node.cellSize, thickness: node.thickness };
    case 'sdf:schwarzP':
      return { kind: 'sdf:schwarzP', cellSize: node.cellSize, thickness: node.thickness };
    case 'sdf:diamond':
      return { kind: 'sdf:diamond', cellSize: node.cellSize, thickness: node.thickness };
    case 'sdf:lidinoid':
      return { kind: 'sdf:lidinoid', cellSize: node.cellSize, thickness: node.thickness };

    // Spatial blend
    case 'sdf:spatialBlend':
      return {
        kind: 'sdf:spatialBlend',
        a: cloneSdfNode(node.a),
        b: cloneSdfNode(node.b),
        functionBody: node.functionBody,
        constants: node.constants ? { ...node.constants } : undefined,
      };

    // Noise / patterns
    case 'sdf:noise':
      return { kind: 'sdf:noise', scale: node.scale, amplitude: node.amplitude, octaves: node.octaves, seed: node.seed };
    case 'sdf:voronoi':
      return {
        kind: 'sdf:voronoi',
        cellSize: node.cellSize,
        wallThickness: node.wallThickness,
        seed: node.seed,
        ...(node.surfaceChild ? { surfaceChild: cloneSdfNode(node.surfaceChild) } : {}),
        ...(node.suppressionThreshold !== undefined ? { suppressionThreshold: node.suppressionThreshold } : {}),
      };

    // Custom
    case 'sdf:custom':
      return { kind: 'sdf:custom', functionBody: node.functionBody, bounds: { min: [...node.bounds.min], max: [...node.bounds.max] }, ...(node.constants ? { constants: { ...node.constants } } : {}) };
  }
}

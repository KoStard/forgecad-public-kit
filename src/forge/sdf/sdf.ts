/**
 * ForgeCAD SDF API — user-facing signed distance field modeling.
 *
 * Usage:
 *   const shape = sdf.smoothUnion(sdf.sphere(10), sdf.box(15, 15, 15), { radius: 3 })
 *     .toShape({ edgeLength: 0.5 })
 *     .color('#4488cc');
 *
 * SDF shapes live in "SDF space" until `.toShape()` is called, which meshes
 * them via Manifold.levelSet() and returns a regular ForgeCAD Shape.
 */

import { buildShapeFromSdfPlan } from './sdfBridge';
import type { SdfBounds } from './sdfEval';
import { estimateSdfBounds } from './sdfEval';
import type { SdfNode, Vec3 } from './sdfNode';

// ─── SdfShape: the builder ───────────────────────────────────────────────────

export interface SdfToShapeOptions {
  /** Target mesh edge length. Smaller = finer mesh. Default: auto-computed from bounds. */
  edgeLength?: number;
  /** Override auto-computed bounds. */
  bounds?: { min: Vec3; max: Vec3 };
}

/**
 * An immutable SDF expression. Supports SDF-specific operations (smooth booleans,
 * domain warps, etc.) and converts to a ForgeCAD Shape via `.toShape()`.
 */
export class SdfShape {
  /** @internal */
  readonly _node: SdfNode;

  /** @internal */
  constructor(node: SdfNode) {
    this._node = node;
  }

  // ── Conversion ──

  /**
   * Mesh this SDF into a ForgeCAD Shape via Manifold.levelSet().
   * Once converted, the result is a regular Shape — booleans, transforms, export all work.
   */
  toShape(options?: SdfToShapeOptions): import('../kernel').Shape {
    const bounds = options?.bounds ?? estimateSdfBounds(this._node);
    const edgeLength = options?.edgeLength ?? autoEdgeLength(bounds);
    return buildShapeFromSdfPlan(this._node, edgeLength, bounds);
  }

  // ── Combinators (return new SdfShape) ──

  /** SDF union (sharp). */
  union(...others: SdfShape[]): SdfShape {
    return new SdfShape({ kind: 'sdf:union', children: [this._node, ...others.map((o) => o._node)] });
  }

  /** SDF difference (sharp) — subtracts others from this. */
  subtract(...others: SdfShape[]): SdfShape {
    return new SdfShape({ kind: 'sdf:difference', children: [this._node, ...others.map((o) => o._node)] });
  }

  /** SDF intersection (sharp). */
  intersect(...others: SdfShape[]): SdfShape {
    return new SdfShape({ kind: 'sdf:intersection', children: [this._node, ...others.map((o) => o._node)] });
  }

  /** Smooth union — blends shapes together with a smooth radius. */
  smoothUnion(other: SdfShape, radius: number): SdfShape {
    return new SdfShape({ kind: 'sdf:smoothUnion', children: [this._node, other._node], radius });
  }

  /** Smooth difference — smoothly carves other from this. */
  smoothSubtract(other: SdfShape, radius: number): SdfShape {
    return new SdfShape({ kind: 'sdf:smoothDifference', children: [this._node, other._node], radius });
  }

  /** Smooth intersection — smoothly intersects. */
  smoothIntersect(other: SdfShape, radius: number): SdfShape {
    return new SdfShape({ kind: 'sdf:smoothIntersection', children: [this._node, other._node], radius });
  }

  /** Morph between this shape and another. t=0 → this, t=1 → other. */
  morph(other: SdfShape, t: number): SdfShape {
    return new SdfShape({ kind: 'sdf:morph', a: this._node, b: other._node, t });
  }

  // ── Transforms ──

  translate(x: number, y: number, z: number): SdfShape {
    return new SdfShape({ kind: 'sdf:translate', child: this._node, offset: [x, y, z] });
  }

  rotate(xDeg: number, yDeg: number, zDeg: number): SdfShape {
    return new SdfShape({ kind: 'sdf:rotate', child: this._node, degrees: [xDeg, yDeg, zDeg] });
  }

  scale(factor: number): SdfShape {
    return new SdfShape({ kind: 'sdf:scale', child: this._node, factor });
  }

  // ── Domain operations ──

  /** Twist around the Y axis. */
  twist(degreesPerUnit: number): SdfShape {
    return new SdfShape({ kind: 'sdf:twist', child: this._node, degreesPerUnit });
  }

  /** Bend around the Z axis with given radius. */
  bend(radius: number): SdfShape {
    return new SdfShape({ kind: 'sdf:bend', child: this._node, radius });
  }

  /** Repeat in space. Spacing of 0 on an axis means no repetition. Count of 0 = infinite. */
  repeat(spacing: Vec3, count?: Vec3): SdfShape {
    return new SdfShape({ kind: 'sdf:repeat', child: this._node, spacing, count: count ?? [0, 0, 0] });
  }

  /** Hollow out, keeping only a shell of given thickness. */
  shell(thickness: number): SdfShape {
    return new SdfShape({ kind: 'sdf:shell', child: this._node, thickness });
  }

  /** Displace the surface by a function of position. */
  displace(fn: (x: number, y: number, z: number) => number): SdfShape {
    return new SdfShape({ kind: 'sdf:displace', child: this._node, functionBody: extractFunctionBody(fn) });
  }

  /** Create concentric onion layers. */
  onion(layers: number, thickness: number): SdfShape {
    return new SdfShape({ kind: 'sdf:onion', child: this._node, layers, thickness });
  }
}

// ─── Factory functions (the sdf namespace) ───────────────────────────────────

/** Create an SDF sphere centered at the origin. */
export function sphere(radius: number): SdfShape {
  return new SdfShape({ kind: 'sdf:sphere', radius });
}

/** Create an SDF box centered at the origin with given full dimensions (not half-extents). */
export function box(x: number, y: number, z: number): SdfShape {
  return new SdfShape({ kind: 'sdf:box', halfExtents: [x / 2, y / 2, z / 2] });
}

/** Create an SDF cylinder centered at the origin, axis along Y. */
export function cylinder(height: number, radius: number): SdfShape {
  return new SdfShape({ kind: 'sdf:cylinder', height, radius });
}

/** Create an SDF torus centered at the origin, lying in the XZ plane. */
export function torus(majorRadius: number, minorRadius: number): SdfShape {
  return new SdfShape({ kind: 'sdf:torus', majorRadius, minorRadius });
}

/** Create an SDF capsule centered at the origin, axis along Y. */
export function capsule(height: number, radius: number): SdfShape {
  return new SdfShape({ kind: 'sdf:capsule', height, radius });
}

/** Create an SDF cone with base at y=0 and tip at y=height. */
export function cone(height: number, radius: number): SdfShape {
  return new SdfShape({ kind: 'sdf:cone', height, radius });
}

// ─── Combinator factories ────────────────────────────────────────────────────

/** Smooth union — blends shapes together with a smooth transition radius. */
export function smoothUnion(a: SdfShape, b: SdfShape, options: { radius: number }): SdfShape {
  return new SdfShape({ kind: 'sdf:smoothUnion', children: [a._node, b._node], radius: options.radius });
}

/** Smooth difference — smoothly subtracts b from a. */
export function smoothDifference(a: SdfShape, b: SdfShape, options: { radius: number }): SdfShape {
  return new SdfShape({ kind: 'sdf:smoothDifference', children: [a._node, b._node], radius: options.radius });
}

/** Smooth intersection — smoothly intersects a and b. */
export function smoothIntersection(a: SdfShape, b: SdfShape, options: { radius: number }): SdfShape {
  return new SdfShape({ kind: 'sdf:smoothIntersection', children: [a._node, b._node], radius: options.radius });
}

/** Morph between two SDF shapes. t=0 → a, t=1 → b. */
export function morph(a: SdfShape, b: SdfShape, t: number): SdfShape {
  return new SdfShape({ kind: 'sdf:morph', a: a._node, b: b._node, t });
}

// ─── TPMS lattice factories ──────────────────────────────────────────────────

export interface TpmsOptions {
  cellSize: number;
  thickness: number;
}

/** Gyroid TPMS lattice — the most common lattice for additive manufacturing. */
export function gyroid(options: TpmsOptions): SdfShape {
  return new SdfShape({ kind: 'sdf:gyroid', cellSize: options.cellSize, thickness: options.thickness });
}

/** Schwarz-P TPMS lattice — isotropic pore structure. */
export function schwarzP(options: TpmsOptions): SdfShape {
  return new SdfShape({ kind: 'sdf:schwarzP', cellSize: options.cellSize, thickness: options.thickness });
}

/** Diamond TPMS lattice — stiffest TPMS structure. */
export function diamond(options: TpmsOptions): SdfShape {
  return new SdfShape({ kind: 'sdf:diamond', cellSize: options.cellSize, thickness: options.thickness });
}

// ─── Noise / pattern factories ──────────────────────────────────────────────

export interface NoiseOptions {
  /** Spatial frequency — smaller = larger features. Default: 0.1 */
  scale?: number;
  /** Peak displacement amplitude. Default: 1 */
  amplitude?: number;
  /** fBm octaves (1 = plain simplex, higher = more detail). Default: 1 */
  octaves?: number;
  /** Seed for deterministic variation. Default: 0 */
  seed?: number;
}

/**
 * 3D Simplex noise field — produces organic, natural-looking displacements.
 * Use as a standalone SDF (creates a bumpy surface) or intersect/displace with other shapes.
 *
 * ```js
 * // Organic textured sphere
 * sdf.sphere(20).subtract(sdf.sphere(18))  // hollow shell
 *   .intersect(sdf.noise({ scale: 0.2, amplitude: 3 }))
 *   .toShape()
 * ```
 */
export function noise(options?: NoiseOptions): SdfShape {
  return new SdfShape({
    kind: 'sdf:noise',
    scale: options?.scale ?? 0.1,
    amplitude: options?.amplitude ?? 1,
    octaves: options?.octaves ?? 1,
    seed: options?.seed ?? 0,
  });
}

export interface VoronoiOptions {
  /** Size of each Voronoi cell in world units. Default: 10 */
  cellSize?: number;
  /** Wall thickness between cells. Default: 1 */
  wallThickness?: number;
  /** Seed for deterministic variation. Default: 0 */
  seed?: number;
}

/**
 * 3D Voronoi pattern — organic cellular structures like bone, coral, or soap bubbles.
 * Returns an SDF where the walls between Voronoi cells are solid.
 *
 * ```js
 * // Voronoi vase
 * sdf.cylinder(80, 30).shell(2)
 *   .intersect(sdf.voronoi({ cellSize: 8, wallThickness: 1.5 }))
 *   .toShape()
 * ```
 */
export function voronoi(options?: VoronoiOptions): SdfShape {
  return new SdfShape({
    kind: 'sdf:voronoi',
    cellSize: options?.cellSize ?? 10,
    wallThickness: options?.wallThickness ?? 1,
    seed: options?.seed ?? 0,
  });
}

// ─── Pattern presets (convenience wrappers) ─────────────────────────────────

export interface HoneycombOptions {
  /** Size of each hex cell. Default: 8 */
  cellSize?: number;
  /** Wall thickness. Default: 1 */
  wallThickness?: number;
}

/**
 * Honeycomb (hexagonal) lattice pattern.
 * Approximated as a 2D hex grid extruded infinitely along Y.
 * Intersect with your shape to apply.
 *
 * ```js
 * sdf.box(60, 40, 60).shell(2)
 *   .intersect(sdf.honeycomb({ cellSize: 6, wallThickness: 1 }))
 *   .toShape()
 * ```
 */
export function honeycomb(options?: HoneycombOptions): SdfShape {
  const cell = options?.cellSize ?? 8;
  const wall = options?.wallThickness ?? 1;
  // Honeycomb as schwarzP restricted to XZ (a good 2D hex approximation)
  // is actually better done as a custom SDF using hex distance.
  // For a clean hex grid we use a custom function.
  const halfWall = wall / 2;
  const fn = `(function() {
    var s = ${cell};
    var hw = ${halfWall};
    var k = ${Math.PI / 3};
    var c = Math.cos(k), si = Math.sin(k);
    // Hex distance in XZ plane
    var px = Math.abs(x), pz = Math.abs(z);
    // Rotate to align hex grid
    var qx = px * c - pz * si;
    var qz = px * si + pz * c;
    qx = ((qx % s) + s) % s; qz = ((qz % s) + s) % s;
    qx = qx - s * 0.5; qz = qz - s * 0.5;
    var d = Math.max(Math.abs(qx), Math.abs(qz) * 0.866 + Math.abs(qx) * 0.5) - s * 0.5 + hw;
    return d;
  })()`;
  return new SdfShape({
    kind: 'sdf:custom',
    functionBody: fn,
    bounds: { min: [-100, -100, -100], max: [100, 100, 100] },
  });
}

export interface WavesOptions {
  /** Distance between wave peaks. Default: 10 */
  wavelength?: number;
  /** Height of waves. Default: 1 */
  amplitude?: number;
  /** Axis along which waves propagate: 'x', 'y', or 'z'. Default: 'x' */
  axis?: 'x' | 'y' | 'z';
}

/**
 * Sinusoidal wave ridges — parallel ridges along an axis.
 * The returned SDF is solid where the wave crests are.
 * Typically used with `.intersect(shape.shell(t))` to create ridged surfaces.
 */
export function waves(options?: WavesOptions): SdfShape {
  const wl = options?.wavelength ?? 10;
  const amp = options?.amplitude ?? 1;
  const axis = options?.axis ?? 'x';
  const freq = (2 * Math.PI) / wl;
  const coord = axis === 'x' ? 'x' : axis === 'y' ? 'y' : 'z';
  return new SdfShape({
    kind: 'sdf:custom',
    functionBody: `Math.sin(${coord} * ${freq}) * ${amp}`,
    bounds: { min: [-100, -100, -100], max: [100, 100, 100] },
  });
}

export interface KnurlOptions {
  /** Distance between knurl ridges. Default: 3 */
  pitch?: number;
  /** Depth of knurl grooves. Default: 0.5 */
  depth?: number;
  /** Helix angle in degrees. Default: 30 */
  angle?: number;
}

/**
 * Knurl pattern — crossed helical grooves for grips and handles.
 * Designed to be used with `.displace()` or intersected with cylindrical shapes.
 *
 * ```js
 * sdf.cylinder(20, 8)
 *   .displace(sdf.knurl({ pitch: 2, depth: 0.3 }))
 *   .toShape()
 * ```
 *
 * Returns an SDF whose value can be used as a displacement field.
 */
export function knurl(options?: KnurlOptions): SdfShape {
  const pitch = options?.pitch ?? 3;
  const depth = options?.depth ?? 0.5;
  const angle = (options?.angle ?? 30) * Math.PI / 180;
  const freq = (2 * Math.PI) / pitch;
  // Diamond knurl = intersection of two helical sine waves at opposing angles
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  return new SdfShape({
    kind: 'sdf:custom',
    functionBody: `(function() {
      var r = Math.sqrt(x * x + z * z);
      var theta = Math.atan2(z, x);
      var u1 = r * theta * ${cosA} + y * ${sinA};
      var u2 = r * theta * ${cosA} - y * ${sinA};
      return Math.min(Math.sin(u1 * ${freq}), Math.sin(u2 * ${freq})) * ${depth};
    })()`,
    bounds: { min: [-50, -50, -50], max: [50, 50, 50] },
  });
}

export interface PerforatedOptions {
  /** Hole radius. Default: 3 */
  radius?: number;
  /** Center-to-center spacing. Default: 8 */
  spacing?: number;
}

/**
 * Perforated plate pattern — regular array of cylindrical holes.
 * Subtract from a shape to punch holes in it.
 *
 * ```js
 * sdf.box(60, 2, 60)
 *   .subtract(sdf.perforated({ radius: 2, spacing: 6 }))
 *   .toShape()
 * ```
 */
export function perforated(options?: PerforatedOptions): SdfShape {
  const r = options?.radius ?? 3;
  const sp = options?.spacing ?? 8;
  // A cylinder repeated in XZ
  return cylinder(1000, r).repeat([sp, 0, sp], [0, 0, 0]);
}

// ─── Custom SDF ──────────────────────────────────────────────────────────────

/**
 * Create an SDF shape from an arbitrary distance function.
 * The function receives (x, y, z) and must return a signed distance
 * (negative = inside, positive = outside).
 *
 * You must provide bounds since the function is opaque.
 */
export function fromFunction(fn: (x: number, y: number, z: number) => number, bounds: { min: Vec3; max: Vec3 }): SdfShape {
  return new SdfShape({ kind: 'sdf:custom', functionBody: extractFunctionBody(fn), bounds });
}

// ─── Domain operation factories ──────────────────────────────────────────────

/** Twist an SDF shape around the Y axis. */
export function twist(shape: SdfShape, degreesPerUnit: number): SdfShape {
  return shape.twist(degreesPerUnit);
}

/** Bend an SDF shape around the Z axis. */
export function bend(shape: SdfShape, radius: number): SdfShape {
  return shape.bend(radius);
}

/** Repeat an SDF shape in space. */
export function repeat(shape: SdfShape, spacing: Vec3, count?: Vec3): SdfShape {
  return shape.repeat(spacing, count);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function autoEdgeLength(bounds: SdfBounds): number {
  const dx = bounds.max[0] - bounds.min[0];
  const dy = bounds.max[1] - bounds.min[1];
  const dz = bounds.max[2] - bounds.min[2];
  const maxDim = Math.max(dx, dy, dz);
  // Target ~100 cells across the largest dimension
  return Math.max(0.1, maxDim / 100);
}

function extractFunctionBody(fn: Function): string {
  const src = fn.toString();
  // Arrow function: (x, y, z) => expr
  const arrowIdx = src.indexOf('=>');
  if (arrowIdx !== -1) {
    const body = src.slice(arrowIdx + 2).trim();
    // If it's a block body { ... }, strip the braces
    if (body.startsWith('{') && body.endsWith('}')) {
      return body.slice(1, -1).trim();
    }
    return body;
  }
  // Regular function: extract body between first { and last }
  const start = src.indexOf('{');
  const end = src.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    return src.slice(start + 1, end).trim();
  }
  throw new Error('sdf.fromFunction(): could not extract function body. Use an arrow function: (x, y, z) => ...');
}

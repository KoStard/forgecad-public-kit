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

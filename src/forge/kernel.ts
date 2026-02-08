/**
 * ForgeCAD Geometry Kernel
 *
 * Wraps Manifold WASM to provide a clean, chainable API.
 * Every Shape holds a Manifold internally and exposes transform/boolean ops.
 */

import type { Manifold, ManifoldToplevel } from 'manifold-3d';

let _wasm: ManifoldToplevel | null = null;

export async function initKernel(): Promise<ManifoldToplevel> {
  if (_wasm) return _wasm;
  const Module = (await import('manifold-3d')).default;
  _wasm = await Module();
  _wasm.setup();
  _wasm.setMinCircularAngle(2);
  _wasm.setMinCircularEdgeLength(0.5);
  return _wasm;
}

export function getWasm(): ManifoldToplevel {
  if (!_wasm) throw new Error('Kernel not initialized — call initKernel() first');
  return _wasm;
}

/** Thin wrapper around Manifold with chainable API */
export class Shape {
  constructor(public readonly manifold: Manifold) {}

  // --- Transforms (all return new Shape, immutable) ---

  translate(x: number, y: number, z: number): Shape {
    return new Shape(this.manifold.translate(x, y, z));
  }

  rotate(x: number, y: number, z: number): Shape {
    return new Shape(this.manifold.rotate(x, y, z));
  }

  scale(v: number | [number, number, number]): Shape {
    return new Shape(this.manifold.scale(v as any));
  }

  mirror(normal: [number, number, number]): Shape {
    return new Shape(this.manifold.mirror(normal));
  }

  // --- Booleans ---

  add(other: Shape): Shape {
    return new Shape(this.manifold.add(other.manifold));
  }

  subtract(other: Shape): Shape {
    return new Shape(this.manifold.subtract(other.manifold));
  }

  intersect(other: Shape): Shape {
    return new Shape(this.manifold.intersect(other.manifold));
  }

  // --- Query ---

  boundingBox() {
    return this.manifold.boundingBox();
  }

  volume(): number {
    return this.manifold.volume();
  }

  /** Extract triangle mesh for Three.js rendering */
  getMesh() {
    return this.manifold.getMesh();
  }
}

// --- Primitive constructors ---

export function box(x: number, y: number, z: number, center = false): Shape {
  return new Shape(getWasm().Manifold.cube([x, y, z], center));
}

export function cylinder(
  height: number,
  radius: number,
  radiusTop?: number,
  segments?: number,
  center = false,
): Shape {
  return new Shape(
    getWasm().Manifold.cylinder(height, radius, radiusTop ?? -1, segments ?? 0, center),
  );
}

export function sphere(radius: number, segments?: number): Shape {
  return new Shape(getWasm().Manifold.sphere(radius, segments ?? 0));
}

// --- Boolean helpers ---

export function union(...shapes: Shape[]): Shape {
  if (shapes.length === 0) throw new Error('union requires at least one shape');
  if (shapes.length === 1) return shapes[0];
  return new Shape(getWasm().Manifold.union(shapes.map((s) => s.manifold)));
}

export function difference(...shapes: Shape[]): Shape {
  if (shapes.length < 2) throw new Error('difference requires at least two shapes');
  return new Shape(getWasm().Manifold.difference(shapes.map((s) => s.manifold)));
}

export function intersection(...shapes: Shape[]): Shape {
  if (shapes.length < 2) throw new Error('intersection requires at least two shapes');
  return new Shape(getWasm().Manifold.intersection(shapes.map((s) => s.manifold)));
}

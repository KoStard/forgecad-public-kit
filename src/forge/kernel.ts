/**
 * ForgeCAD Geometry Kernel
 *
 * Wraps Manifold WASM to provide a clean, chainable API.
 * Every Shape holds a Manifold internally and exposes transform/boolean ops.
 */

import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { Transform, type Mat4 } from './transform';

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

export interface ShapeDimension {
  id: string;
  from: [number, number, number];
  to: [number, number, number];
  offset: number;
  autoOffset?: boolean;
  label?: string;
  color?: string;
  components?: string[];
  currentComponent?: boolean;
}

const _shapeDimensions = new WeakMap<Shape, ShapeDimension[]>();
let _shapeDimensionCounter = 0;

function nextShapeDimensionId(): string {
  _shapeDimensionCounter += 1;
  return `shape-dim-${_shapeDimensionCounter}`;
}

function cloneDimension(def: ShapeDimension, regenerateId = false): ShapeDimension {
  return {
    id: regenerateId ? nextShapeDimensionId() : def.id,
    from: [def.from[0], def.from[1], def.from[2]],
    to: [def.to[0], def.to[1], def.to[2]],
    offset: def.offset,
    autoOffset: def.autoOffset,
    label: def.label,
    color: def.color,
    components: def.components ? [...def.components] : undefined,
    currentComponent: def.currentComponent,
  };
}

function cloneDimensions(defs: ShapeDimension[], regenerateIds = false): ShapeDimension[] {
  return defs.map((def) => cloneDimension(def, regenerateIds));
}

function setShapeDimensionsInternal(shape: Shape, dims: ShapeDimension[]): Shape {
  if (dims.length === 0) {
    _shapeDimensions.delete(shape);
  } else {
    _shapeDimensions.set(shape, dims);
  }
  return shape;
}

function getShapeDimensionsInternal(shape: Shape): ShapeDimension[] {
  return _shapeDimensions.get(shape) ?? [];
}

function transformPointByMat4(m: Mat4, p: [number, number, number]): [number, number, number] {
  const x = p[0], y = p[1], z = p[2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

function transformDimensions(defs: ShapeDimension[], m: Mat4): ShapeDimension[] {
  return defs.map((def) => ({
    id: nextShapeDimensionId(),
    from: transformPointByMat4(m, def.from),
    to: transformPointByMat4(m, def.to),
    offset: def.offset,
    autoOffset: def.autoOffset,
    label: def.label,
    color: def.color,
    components: def.components ? [...def.components] : undefined,
    currentComponent: def.currentComponent,
  }));
}

function rotationEulerMatrix(xDeg: number, yDeg: number, zDeg: number): Mat4 {
  return Transform.identity()
    .rotateAxis([1, 0, 0], xDeg)
    .rotateAxis([0, 1, 0], yDeg)
    .rotateAxis([0, 0, 1], zDeg)
    .toArray();
}

function mirrorMatrix(normal: [number, number, number]): Mat4 {
  const [nx0, ny0, nz0] = normal;
  const len = Math.hypot(nx0, ny0, nz0);
  if (len < 1e-12) return Transform.identity().toArray();
  const nx = nx0 / len;
  const ny = ny0 / len;
  const nz = nz0 / len;

  const m00 = 1 - 2 * nx * nx;
  const m01 = -2 * nx * ny;
  const m02 = -2 * nx * nz;
  const m10 = -2 * ny * nx;
  const m11 = 1 - 2 * ny * ny;
  const m12 = -2 * ny * nz;
  const m20 = -2 * nz * nx;
  const m21 = -2 * nz * ny;
  const m22 = 1 - 2 * nz * nz;

  return [
    m00, m10, m20, 0,
    m01, m11, m21, 0,
    m02, m12, m22, 0,
    0, 0, 0, 1,
  ];
}

function withCopiedDimensions(source: Shape, out: Shape): Shape {
  return setShapeDimensionsInternal(out, cloneDimensions(getShapeDimensionsInternal(source), true));
}

function withTransformedDimensions(source: Shape, out: Shape, m: Mat4): Shape {
  const dims = getShapeDimensionsInternal(source);
  if (dims.length === 0) return setShapeDimensionsInternal(out, []);
  return setShapeDimensionsInternal(out, transformDimensions(dims, m));
}

function withMergedDimensions(sources: Shape[], out: Shape): Shape {
  const merged = sources.flatMap((s) => getShapeDimensionsInternal(s));
  return setShapeDimensionsInternal(out, cloneDimensions(merged, true));
}

function withBaseDimensions(base: Shape, out: Shape): Shape {
  return setShapeDimensionsInternal(out, cloneDimensions(getShapeDimensionsInternal(base), true));
}

/**
 * Bind dimensions to a shape instance. Used for importPart-scoped dimensions.
 * By default IDs are regenerated so multiple instances never collide.
 */
export function setShapeDimensions(
  shape: Shape,
  dims: ShapeDimension[],
  options: { regenerateIds?: boolean } = {},
): Shape {
  const regenerateIds = options.regenerateIds ?? true;
  return setShapeDimensionsInternal(shape, cloneDimensions(dims, regenerateIds));
}

/** Read dimensions bound to this shape instance (defensive copy). */
export function getShapeDimensions(shape: Shape): ShapeDimension[] {
  return cloneDimensions(getShapeDimensionsInternal(shape), false);
}

/** Thin wrapper around Manifold with chainable API */
export class Shape {
  public colorHex: string | undefined;

  constructor(public readonly manifold: Manifold, color?: string) {
    this.colorHex = color;
  }

  /** Set the color of this shape (hex string, e.g. "#ff0000") */
  setColor(value: string | undefined): Shape {
    return withCopiedDimensions(this, new Shape(this.manifold, value));
  }

  /** Alias for setColor */
  color(value: string | undefined): Shape {
    return this.setColor(value);
  }

  /** Return a new Shape wrapper for explicit duplication in scripts. */
  clone(): Shape {
    return withCopiedDimensions(this, new Shape(this.manifold, this.colorHex));
  }

  /** Alias for clone() */
  duplicate(): Shape {
    return this.clone();
  }

  // --- Transforms (all return new Shape, immutable) ---

  translate(x: number, y: number, z: number): Shape {
    return withTransformedDimensions(
      this,
      new Shape(this.manifold.translate(x, y, z), this.colorHex),
      Transform.translation(x, y, z).toArray(),
    );
  }

  /** Move so bounding box min corner is at the given global coordinate */
  moveTo(x: number, y: number, z: number): Shape {
    const bb = this.boundingBox();
    return this.translate(x - (bb.min as number[])[0], y - (bb.min as number[])[1], z - (bb.min as number[])[2]);
  }

  /** Move so bounding box min corner is at target's bounding box min + (x, y, z) offset */
  moveToLocal(target: Shape | { toShape(): Shape }, x: number, y: number, z: number): Shape {
    const s = 'toShape' in target ? target.toShape() : target;
    const tbb = s.boundingBox();
    return this.moveTo((tbb.min as number[])[0] + x, (tbb.min as number[])[1] + y, (tbb.min as number[])[2] + z);
  }

  rotate(x: number, y: number, z: number): Shape {
    return withTransformedDimensions(
      this,
      new Shape(this.manifold.rotate(x, y, z), this.colorHex),
      rotationEulerMatrix(x, y, z),
    );
  }

  /** Apply a 4x4 affine transform matrix (column-major) or a Transform object. */
  transform(m: Mat4 | Transform): Shape {
    const mat = m instanceof Transform ? m.toArray() : m;
    return withTransformedDimensions(this, new Shape(this.manifold.transform(mat), this.colorHex), mat);
  }

  scale(v: number | [number, number, number]): Shape {
    return withTransformedDimensions(
      this,
      new Shape(this.manifold.scale(v as any), this.colorHex),
      Transform.scale(v).toArray(),
    );
  }

  mirror(normal: [number, number, number]): Shape {
    return withTransformedDimensions(
      this,
      new Shape(this.manifold.mirror(normal), this.colorHex),
      mirrorMatrix(normal),
    );
  }

  /**
   * Reorient a shape so its primary axis (Z) points along the given direction.
   * Useful for laying cylinders/extrusions along X or Y without thinking about Euler angles.
   *
   * Example: cylinder(40, 5).pointAlong([1, 0, 0]) — lays cylinder along X
   */
  pointAlong(direction: [number, number, number]): Shape {
    const [dx, dy, dz] = direction;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const nx = dx / len, ny = dy / len, nz = dz / len;
    // From [0,0,1] to [nx,ny,nz] via cross product (rotation axis) and dot product (angle)
    // cross([0,0,1], [nx,ny,nz]) = [-ny, nx, 0]
    const cx = -ny, cy = nx, cz = 0;
    const sinA = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const cosA = nz; // dot([0,0,1], [nx,ny,nz])
    if (sinA < 1e-10) {
      // Parallel or anti-parallel to Z
      return cosA > 0 ? this : this.rotate(180, 0, 0);
    }
    const angleDeg = Math.atan2(sinA, cosA) * 180 / Math.PI;
    // Normalize cross product to get rotation axis
    const ax = cx / sinA, ay = cy / sinA, az = cz / sinA;
    return this.rotateAround([ax, ay, az], angleDeg);
  }

  /**
   * Rotate around an arbitrary axis through a pivot point.
   * Equivalent to: translate(-pivot) → rotate around axis → translate(+pivot)
   */
  rotateAround(
    axis: [number, number, number],
    angleDeg: number,
    pivot: [number, number, number] = [0, 0, 0],
  ): Shape {
    const [px, py, pz] = pivot;
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // Normalize axis
    const len = Math.sqrt(axis[0] ** 2 + axis[1] ** 2 + axis[2] ** 2) || 1;
    const ux = axis[0] / len, uy = axis[1] / len, uz = axis[2] / len;
    // Rodrigues' rotation matrix + translation for pivot
    const m00 = cos + ux * ux * (1 - cos);
    const m01 = ux * uy * (1 - cos) - uz * sin;
    const m02 = ux * uz * (1 - cos) + uy * sin;
    const m10 = uy * ux * (1 - cos) + uz * sin;
    const m11 = cos + uy * uy * (1 - cos);
    const m12 = uy * uz * (1 - cos) - ux * sin;
    const m20 = uz * ux * (1 - cos) - uy * sin;
    const m21 = uz * uy * (1 - cos) + ux * sin;
    const m22 = cos + uz * uz * (1 - cos);
    // Translation: pivot + R * (-pivot)
    const tx = px - (m00 * px + m01 * py + m02 * pz);
    const ty = py - (m10 * px + m11 * py + m12 * pz);
    const tz = pz - (m20 * px + m21 * py + m22 * pz);
    // Manifold.transform takes column-major 4x3 (first 12 of 4x4)
    const matrix = [
      m00, m10, m20, 0,
      m01, m11, m21, 0,
      m02, m12, m22, 0,
      tx,  ty,  tz,  1,
    ] as Mat4;
    return withTransformedDimensions(this, new Shape(this.manifold.transform(matrix as any), this.colorHex), matrix);
  }

  // --- Smoothing ---

  /** Mark edges for smoothing based on angle. Call refine() after to apply. */
  smoothOut(minSharpAngle = 60, minSmoothness = 0): Shape {
    return withCopiedDimensions(this, new Shape(this.manifold.smoothOut(minSharpAngle, minSmoothness), this.colorHex));
  }

  /** Subdivide mesh, interpolating smooth surfaces set by smoothOut(). */
  refine(n: number): Shape {
    return withCopiedDimensions(this, new Shape(this.manifold.refine(n), this.colorHex));
  }

  /** Subdivide until edges are shorter than length. */
  refineToLength(length: number): Shape {
    return withCopiedDimensions(this, new Shape(this.manifold.refineToLength(length), this.colorHex));
  }

  /** Subdivide until surface is within tolerance of smooth surface. */
  refineToTolerance(tolerance: number): Shape {
    return withCopiedDimensions(this, new Shape(this.manifold.refineToTolerance(tolerance), this.colorHex));
  }

  /** Warp vertices with a function. */
  warp(fn: (vert: [number, number, number]) => void): Shape {
    return withCopiedDimensions(this, new Shape(this.manifold.warp(fn as any), this.colorHex));
  }

  // --- Booleans ---

  /** Unwrap TrackedShape (or any object with toShape()) without circular import. */
  private static _unwrap(s: any): Shape {
    return typeof s.toShape === 'function' ? s.toShape() : s;
  }

  add(other: Shape | { toShape(): Shape }): Shape {
    const o = Shape._unwrap(other);
    return withMergedDimensions([this, o], new Shape(this.manifold.add(o.manifold), this.colorHex));
  }

  subtract(other: Shape | { toShape(): Shape }): Shape {
    const o = Shape._unwrap(other);
    return withBaseDimensions(this, new Shape(this.manifold.subtract(o.manifold), this.colorHex));
  }

  intersect(other: Shape | { toShape(): Shape }): Shape {
    const o = Shape._unwrap(other);
    return withMergedDimensions([this, o], new Shape(this.manifold.intersect(o.manifold), this.colorHex));
  }

  // --- Cutting ---

  /** Split into [inside, outside] by another shape. */
  split(cutter: Shape | { toShape(): Shape }): [Shape, Shape] {
    const c = Shape._unwrap(cutter);
    const [a, b] = this.manifold.split(c.manifold);
    return [
      withBaseDimensions(this, new Shape(a, this.colorHex)),
      withBaseDimensions(this, new Shape(b, this.colorHex)),
    ];
  }

  /** Split by infinite plane. Returns [below/inside, above/outside]. */
  splitByPlane(normal: [number, number, number], originOffset = 0): [Shape, Shape] {
    const [a, b] = this.manifold.splitByPlane(normal, originOffset);
    return [
      withBaseDimensions(this, new Shape(a, this.colorHex)),
      withBaseDimensions(this, new Shape(b, this.colorHex)),
    ];
  }

  /** Cut away everything on the positive side of the plane. */
  trimByPlane(normal: [number, number, number], originOffset = 0): Shape {
    return withBaseDimensions(this, new Shape(this.manifold.trimByPlane(normal, originOffset), this.colorHex));
  }

  // --- Hull ---

  /** Convex hull of this shape. */
  hull(): Shape {
    return withBaseDimensions(this, new Shape(this.manifold.hull(), this.colorHex));
  }

  // --- Simplification ---

  /** Reduce mesh complexity. Vertices closer than tolerance are merged. */
  simplify(tolerance?: number): Shape {
    return withBaseDimensions(this, new Shape(this.manifold.simplify(tolerance), this.colorHex));
  }

  // --- Query ---

  boundingBox() {
    return this.manifold.boundingBox();
  }

  volume(): number {
    return this.manifold.volume();
  }

  surfaceArea(): number {
    return this.manifold.surfaceArea();
  }

  /** Minimum distance between this shape and another. */
  minGap(other: Shape | { toShape(): Shape }, searchLength: number): number {
    const s = 'toShape' in other ? other.toShape() : other;
    return this.manifold.minGap(s.manifold, searchLength);
  }

  isEmpty(): boolean {
    return this.manifold.isEmpty();
  }

  numTri(): number {
    return this.manifold.numTri();
  }

  /** Extract triangle mesh for Three.js rendering */
  getMesh() {
    return this.manifold.getMesh();
  }

  /** Position this shape relative to another using named 3D anchor points */
  attachTo(
    target: Shape | { _bbox(): { min: number[]; max: number[] } },
    targetAnchor: Anchor3D,
    selfAnchor: Anchor3D = 'center',
    offset?: [number, number, number],
  ): Shape {
    let tp: [number, number, number];
    if (typeof (target as any)._bbox === 'function') {
      const bb = (target as any)._bbox();
      tp = resolveAnchor3D(bb.min, bb.max, targetAnchor);
    } else {
      tp = getAnchorPoint3D(target as Shape, targetAnchor);
    }
    const sp = getAnchorPoint3D(this, selfAnchor);
    let dx = tp[0] - sp[0], dy = tp[1] - sp[1], dz = tp[2] - sp[2];
    if (offset) { dx += offset[0]; dy += offset[1]; dz += offset[2]; }
    return this.translate(dx, dy, dz);
  }

  /**
   * Place this shape on a face of a parent shape.
   *
   * Think of it like sticking a label on a box surface:
   * - `face` picks which surface ('front', 'back', 'top', etc.)
   * - `u, v` position within that face's 2D plane (from center)
   *   - front/back: u = left/right (X), v = up/down (Z)
   *   - left/right: u = forward/back (Y), v = up/down (Z)
   *   - top/bottom: u = left/right (X), v = forward/back (Y)
   * - `protrude` = how far the child sticks out (positive = outward from face)
   */
  onFace(
    parent: Shape | { _bbox(): { min: number[]; max: number[] } },
    face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom',
    opts: { u?: number; v?: number; protrude?: number } = {},
  ): Shape {
    const u = opts.u ?? 0;
    const v = opts.v ?? 0;
    const p = opts.protrude ?? 0;

    // Map face → which attachTo anchors + how u,v,protrude map to x,y,z offset
    // The child's "inward" face attaches to the parent's face, then protrude pushes outward
    type FaceAnchor = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';
    const opposite: Record<FaceAnchor, FaceAnchor> = {
      front: 'back', back: 'front', left: 'right', right: 'left', top: 'bottom', bottom: 'top',
    };
    // For each parent face, map (u, v, protrude) → (dx, dy, dz)
    const uvMap: Record<FaceAnchor, (u: number, v: number, p: number) => [number, number, number]> = {
      front:  (u, v, p) => [u, -p, v],   // front = −Y face, outward = −Y
      back:   (u, v, p) => [u, p, v],     // back = +Y face, outward = +Y
      left:   (u, v, p) => [-p, u, v],    // left = −X face, outward = −X
      right:  (u, v, p) => [p, u, v],     // right = +X face, outward = +X
      top:    (u, v, p) => [u, v, p],     // top = +Z face, outward = +Z
      bottom: (u, v, p) => [u, v, -p],    // bottom = −Z face, outward = −Z
    };

    const selfAnchor = opposite[face]; // child's inward face
    const offset = uvMap[face](u, v, p);
    return this.attachTo(parent, face, selfAnchor, offset);
  }
}

// --- 3D Anchor positioning ---

export type Anchor3D = 'center' | 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
  // edge midpoints (2 axes specified)
  | 'front-left' | 'front-right' | 'back-left' | 'back-right'
  | 'top-front' | 'top-back' | 'top-left' | 'top-right'
  | 'bottom-front' | 'bottom-back' | 'bottom-left' | 'bottom-right'
  // true corners (3 axes specified)
  | 'top-front-left' | 'top-front-right' | 'top-back-left' | 'top-back-right'
  | 'bottom-front-left' | 'bottom-front-right' | 'bottom-back-left' | 'bottom-back-right';

export function resolveAnchor3D(
  min: [number, number, number],
  max: [number, number, number],
  anchor: Anchor3D,
): [number, number, number] {
  const cx = (min[0] + max[0]) / 2;
  const cy = (min[1] + max[1]) / 2;
  const cz = (min[2] + max[2]) / 2;

  switch (anchor) {
    case 'center': return [cx, cy, cz];
    // face centers (1 axis pinned)
    case 'front': return [cx, min[1], cz];
    case 'back': return [cx, max[1], cz];
    case 'left': return [min[0], cy, cz];
    case 'right': return [max[0], cy, cz];
    case 'top': return [cx, cy, max[2]];
    case 'bottom': return [cx, cy, min[2]];
    // edge midpoints (2 axes pinned)
    case 'front-left': return [min[0], min[1], cz];
    case 'front-right': return [max[0], min[1], cz];
    case 'back-left': return [min[0], max[1], cz];
    case 'back-right': return [max[0], max[1], cz];
    case 'top-front': return [cx, min[1], max[2]];
    case 'top-back': return [cx, max[1], max[2]];
    case 'top-left': return [min[0], cy, max[2]];
    case 'top-right': return [max[0], cy, max[2]];
    case 'bottom-front': return [cx, min[1], min[2]];
    case 'bottom-back': return [cx, max[1], min[2]];
    case 'bottom-left': return [min[0], cy, min[2]];
    case 'bottom-right': return [max[0], cy, min[2]];
    // true corners (3 axes pinned)
    case 'top-front-left': return [min[0], min[1], max[2]];
    case 'top-front-right': return [max[0], min[1], max[2]];
    case 'top-back-left': return [min[0], max[1], max[2]];
    case 'top-back-right': return [max[0], max[1], max[2]];
    case 'bottom-front-left': return [min[0], min[1], min[2]];
    case 'bottom-front-right': return [max[0], min[1], min[2]];
    case 'bottom-back-left': return [min[0], max[1], min[2]];
    case 'bottom-back-right': return [max[0], max[1], min[2]];
    default: throw new Error(`Unknown anchor "${anchor}". Valid anchors: center, front, back, left, right, top, bottom, front-left, front-right, back-left, back-right, top-front, top-back, top-left, top-right, bottom-front, bottom-back, bottom-left, bottom-right, top-front-left, top-front-right, top-back-left, top-back-right, bottom-front-left, bottom-front-right, bottom-back-left, bottom-back-right`);
  }
}

export function getAnchorPoint3D(shape: Shape, anchor: Anchor3D): [number, number, number] {
  const s: Shape = typeof (shape as any).toShape === 'function' ? (shape as any).toShape() : shape;
  const bb = s.boundingBox();
  return resolveAnchor3D(bb.min as [number, number, number], bb.max as [number, number, number], anchor);
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
  return withMergedDimensions(shapes, new Shape(getWasm().Manifold.union(shapes.map((s) => s.manifold))));
}

export function difference(...shapes: Shape[]): Shape {
  if (shapes.length < 2) throw new Error('difference requires at least two shapes');
  return withBaseDimensions(shapes[0], new Shape(getWasm().Manifold.difference(shapes.map((s) => s.manifold))));
}

export function intersection(...shapes: Shape[]): Shape {
  if (shapes.length < 2) throw new Error('intersection requires at least two shapes');
  return withMergedDimensions(shapes, new Shape(getWasm().Manifold.intersection(shapes.map((s) => s.manifold))));
}

/** Convex hull of multiple shapes and/or points. */
export function hull3d(...args: (Shape | [number, number, number])[]): Shape {
  const items = args.map(a => a instanceof Shape ? a.manifold : a);
  const out = new Shape(getWasm().Manifold.hull(items));
  const shapeArgs = args.filter((a): a is Shape => a instanceof Shape);
  return withMergedDimensions(shapeArgs, out);
}

/** Create shape from a signed distance function. Positive = inside. */
export function levelSet(
  sdf: (point: [number, number, number]) => number,
  bounds: { min: [number, number, number]; max: [number, number, number] },
  edgeLength: number,
  level = 0,
): Shape {
  return new Shape(getWasm().Manifold.levelSet(
    sdf as any,
    { min: bounds.min, max: bounds.max },
    edgeLength,
    level,
  ));
}

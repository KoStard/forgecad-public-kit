/**
 * ShapeGroup — groups multiple shapes/sketches for joint transforms
 * without merging them into a single mesh (unlike union).
 * Colors, individual identities are preserved.
 */

import { type Anchor3D, isAnchor3D, normalizeAnchor3D, resolveAnchor3D, Shape } from './kernel';
import {
  applyPlacementReferenceInput,
  clonePlacementReferences,
  createPlacementReferences,
  hasPlacementReferences,
  type PlacementAnchorLike,
  type PlacementReferenceInput,
  type PlacementReferenceKind,
  type PlacementReferences,
  placementReferenceNames,
  resolvePlacementReferencePoint,
  transformPlacementReferences,
} from './placement';
import type { PortInput, PortMap } from './port';
import { normalizePortMapInput, clonePortMap, hasAnyPorts, mergePortMaps, transformPortMap } from './port';
import { Sketch } from './sketch/core';
import { TrackedShape } from './sketch/topology';
import { type Mat4, type RotateAroundToOptions, Transform } from './transform';

export type GroupChild = Shape | Sketch | TrackedShape | ShapeGroup;

export interface NamedGroupChild {
  name: string;
  shape?: Shape | TrackedShape | ShapeGroup;
  sketch?: Sketch;
  group?: GroupInput[] | ShapeGroup;
}

export type GroupInput = GroupChild | NamedGroupChild;

// --- Placement reference storage ---

const _groupPlacementRefs = new WeakMap<ShapeGroup, PlacementReferences>();
const _groupPorts = new WeakMap<ShapeGroup, PortMap>();

function getGroupRefs(g: ShapeGroup): PlacementReferences {
  return _groupPlacementRefs.get(g) ?? createPlacementReferences();
}

function setGroupRefs(g: ShapeGroup, refs: PlacementReferences): ShapeGroup {
  if (hasPlacementReferences(refs)) {
    _groupPlacementRefs.set(g, clonePlacementReferences(refs));
  } else {
    _groupPlacementRefs.delete(g);
  }
  return g;
}

function copyGroupRefs(source: ShapeGroup, dest: ShapeGroup): ShapeGroup {
  return setGroupRefs(dest, getGroupRefs(source));
}

function transformGroupRefs(source: ShapeGroup, dest: ShapeGroup, matrix: Mat4): ShapeGroup {
  const refs = getGroupRefs(source);
  if (hasPlacementReferences(refs)) {
    setGroupRefs(dest, transformPlacementReferences(refs, matrix));
  }
  return dest;
}

// --- Port storage ---

function getGroupPorts(g: ShapeGroup): PortMap {
  return _groupPorts.get(g) ?? {};
}

function setGroupPorts(g: ShapeGroup, ports: PortMap): ShapeGroup {
  if (hasAnyPorts(ports)) {
    _groupPorts.set(g, clonePortMap(ports));
  } else {
    _groupPorts.delete(g);
  }
  return g;
}

function copyGroupPorts(source: ShapeGroup, dest: ShapeGroup): ShapeGroup {
  return setGroupPorts(dest, getGroupPorts(source));
}

function transformGroupPortsHelper(source: ShapeGroup, dest: ShapeGroup, matrix: Mat4): ShapeGroup {
  const ports = getGroupPorts(source);
  if (hasAnyPorts(ports)) {
    setGroupPorts(dest, transformPortMap(ports, matrix));
  }
  return dest;
}

export function getShapeGroupPorts(g: ShapeGroup): PortMap {
  return clonePortMap(getGroupPorts(g));
}

// --- Transform helpers ---

function eulerRotationMatrix(xDeg: number, yDeg: number, zDeg: number): Mat4 {
  return Transform.identity().rotateAxis([1, 0, 0], xDeg).rotateAxis([0, 1, 0], yDeg).rotateAxis([0, 0, 1], zDeg).toArray();
}

function mirrorPlaneMatrix(normal: [number, number, number]): Mat4 {
  const [nx0, ny0, nz0] = normal;
  const len = Math.hypot(nx0, ny0, nz0);
  if (len < 1e-12) return Transform.identity().toArray();
  const nx = nx0 / len,
    ny = ny0 / len,
    nz = nz0 / len;
  const m00 = 1 - 2 * nx * nx,
    m01 = -2 * nx * ny,
    m02 = -2 * nx * nz;
  const m10 = -2 * ny * nx,
    m11 = 1 - 2 * ny * ny,
    m12 = -2 * ny * nz;
  const m20 = -2 * nz * nx,
    m21 = -2 * nz * ny,
    m22 = 1 - 2 * nz * nz;
  return [m00, m10, m20, 0, m01, m11, m21, 0, m02, m12, m22, 0, 0, 0, 0, 1];
}

// --- Group child helpers ---

function normalizeChildName(name?: string): string | undefined {
  if (typeof name !== 'string') return undefined;
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isNamedGroupChild(value: unknown): value is NamedGroupChild {
  return !!value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string';
}

function resolveNamedGroupChild(item: NamedGroupChild): GroupChild {
  const childName = normalizeChildName(item.name);
  if (!childName) {
    throw new Error('group(...) named items require a non-empty name');
  }

  const hasShape = item.shape !== undefined;
  const hasSketch = item.sketch !== undefined;
  const hasGroup = Array.isArray(item.group) || item.group instanceof ShapeGroup;
  const payloadCount = Number(hasShape) + Number(hasSketch) + Number(hasGroup);
  if (payloadCount !== 1) {
    throw new Error(`group(...) named item "${childName}" must provide exactly one of shape, sketch, or group`);
  }

  if (hasShape) {
    if (!(item.shape instanceof Shape) && !(item.shape instanceof TrackedShape) && !(item.shape instanceof ShapeGroup)) {
      throw new Error(`group(...) named item "${childName}" shape must be a Shape, TrackedShape, or ShapeGroup`);
    }
    return item.shape as Shape | TrackedShape | ShapeGroup;
  }
  if (hasSketch) {
    if (!(item.sketch instanceof Sketch)) {
      throw new Error(`group(...) named item "${childName}" sketch must be a Sketch`);
    }
    return item.sketch as Sketch;
  }
  if (item.group instanceof ShapeGroup) return item.group;
  return group(...(item.group as GroupInput[]));
}

function normalizeGroupInputs(items: GroupInput[]): {
  children: GroupChild[];
  childNames: Array<string | undefined>;
} {
  const children: GroupChild[] = [];
  const childNames: Array<string | undefined> = [];

  items.forEach((item) => {
    if (isNamedGroupChild(item)) {
      children.push(resolveNamedGroupChild(item));
      childNames.push(normalizeChildName(item.name));
      return;
    }
    children.push(item);
    childNames.push(undefined);
  });

  return { children, childNames };
}

export class ShapeGroup {
  public readonly children: GroupChild[];
  public readonly childNames: Array<string | undefined>;

  constructor(children: GroupChild[], childNames?: Array<string | undefined>) {
    if (childNames && childNames.length !== children.length) {
      throw new Error('ShapeGroup childNames must match children length');
    }
    this.children = [...children];
    this.childNames = this.children.map((_, index) => normalizeChildName(childNames?.[index]));
  }

  childName(index: number): string | undefined {
    return this.childNames[index];
  }

  /**
   * Return the named child by name. Throws if not found.
   * Useful when importing a multipart group and working on components individually.
   */
  child(name: string): GroupChild {
    const idx = this.childNames.indexOf(name);
    if (idx === -1) {
      const available = this.childNames.filter(Boolean).join(', ') || 'none';
      throw new Error(`ShapeGroup has no child named "${name}". Available: ${available}`);
    }
    return this.children[idx];
  }

  /** Apply fn to all children, producing a new ShapeGroup that also copies placement refs. */
  private mapChildren(fn: (child: GroupChild) => GroupChild): ShapeGroup {
    const next = new ShapeGroup(this.children.map(fn), this.childNames);
    copyGroupPorts(this, next);
    return copyGroupRefs(this, next);
  }

  /** Apply fn to all children and also transform placement refs by the given matrix. */
  private mapChildrenTransform(fn: (child: GroupChild) => GroupChild, matrix: Mat4): ShapeGroup {
    const next = new ShapeGroup(this.children.map(fn), this.childNames);
    transformGroupPortsHelper(this, next, matrix);
    return transformGroupRefs(this, next, matrix);
  }

  /** Return a deep-cloned ShapeGroup tree (refs copied). */
  clone(): ShapeGroup {
    return this.mapChildren((c) => {
      if (c instanceof ShapeGroup) return c.clone();
      if (c instanceof TrackedShape) return c.clone();
      if (c instanceof Shape) return c.clone();
      return c.clone();
    });
  }

  /** Alias for clone() */
  duplicate(): ShapeGroup {
    return this.clone();
  }

  translate(x: number, y: number, z: number): ShapeGroup {
    const matrix = Transform.translation(x, y, z).toArray();
    return this.mapChildrenTransform((c) => {
      if (c instanceof ShapeGroup) return c.translate(x, y, z);
      if (c instanceof TrackedShape) return c.translate(x, y, z);
      if (c instanceof Shape) return c.translate(x, y, z);
      return c.translate(x, y);
    }, matrix);
  }

  /** Compute combined bounding box of all 3D children */
  private _bbox(): { min: number[]; max: number[] } {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const c of this.children) {
      if (c instanceof ShapeGroup) {
        const bb = c._bbox();
        for (let i = 0; i < 3; i++) {
          if (bb.min[i] < min[i]) min[i] = bb.min[i];
          if (bb.max[i] > max[i]) max[i] = bb.max[i];
        }
        continue;
      }
      const s = c instanceof TrackedShape ? c.toShape() : c instanceof Shape ? c : null;
      if (!s) continue;
      const bb = s.boundingBox();
      for (let i = 0; i < 3; i++) {
        if ((bb.min as number[])[i] < min[i]) min[i] = (bb.min as number[])[i];
        if ((bb.max as number[])[i] > max[i]) max[i] = (bb.max as number[])[i];
      }
    }
    return { min, max };
  }

  boundingBox(): { min: [number, number, number]; max: [number, number, number] } {
    const bb = this._bbox();
    return { min: bb.min as [number, number, number], max: bb.max as [number, number, number] };
  }

  private resolveRotatePoint(point: Anchor3D | [number, number, number]): [number, number, number] {
    if (Array.isArray(point)) return [point[0], point[1], point[2]];
    const bb = this._bbox();
    return resolveAnchor3D(bb.min as [number, number, number], bb.max as [number, number, number], point);
  }

  /** Move so combined bounding box min corner is at the given global coordinate */
  moveTo(x: number, y: number, z: number): ShapeGroup {
    const bb = this._bbox();
    return this.translate(x - bb.min[0], y - bb.min[1], z - bb.min[2]);
  }

  /** Move so combined bounding box min corner is at target's bounding box min + (x, y, z) offset */
  moveToLocal(target: Shape | TrackedShape | ShapeGroup, x: number, y: number, z: number): ShapeGroup {
    let tbb: { min: number[] };
    if (target instanceof ShapeGroup) {
      tbb = target._bbox();
    } else {
      const ts = target instanceof TrackedShape ? target.toShape() : target;
      const bb = ts.boundingBox();
      tbb = { min: bb.min as number[] };
    }
    return this.moveTo(tbb.min[0] + x, tbb.min[1] + y, tbb.min[2] + z);
  }

  attachTo(
    target: Shape | TrackedShape | ShapeGroup,
    targetAnchor: Anchor3D | string,
    selfAnchor: Anchor3D = 'center',
    offset?: [number, number, number],
  ): ShapeGroup {
    const tbb =
      target instanceof ShapeGroup
        ? target._bbox()
        : (() => {
            const s = target instanceof TrackedShape ? target.toShape() : target;
            const b = s.boundingBox();
            return { min: b.min as [number, number, number], max: b.max as [number, number, number] };
          })();
    const sbb = this._bbox();
    // Use referencePoint() when the target has it (supports named refs), otherwise fall back to built-in anchors
    let tp: [number, number, number];
    if (isAnchor3D(targetAnchor)) {
      tp = resolveAnchor3D(tbb.min as [number, number, number], tbb.max as [number, number, number], targetAnchor);
    } else if ('referencePoint' in target && typeof (target as { referencePoint?: unknown }).referencePoint === 'function') {
      tp = (target as { referencePoint(ref: string): [number, number, number] }).referencePoint(targetAnchor);
    } else {
      const normalized = normalizeAnchor3D(targetAnchor);
      if (!normalized) {
        throw new Error(`Unknown anchor "${targetAnchor}" on target`);
      }
      tp = resolveAnchor3D(tbb.min as [number, number, number], tbb.max as [number, number, number], normalized);
    }
    const sp = resolveAnchor3D(sbb.min as [number, number, number], sbb.max as [number, number, number], selfAnchor);
    let dx = tp[0] - sp[0],
      dy = tp[1] - sp[1],
      dz = tp[2] - sp[2];
    if (offset) {
      dx += offset[0];
      dy += offset[1];
      dz += offset[2];
    }
    return this.translate(dx, dy, dz);
  }

  /**
   * Place this group on a face of a parent shape.
   * See Shape.onFace() for full documentation.
   */
  onFace(
    parent: Shape | TrackedShape | ShapeGroup,
    face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom',
    opts: { u?: number; v?: number; protrude?: number } = {},
  ): ShapeGroup {
    const u = opts.u ?? 0,
      v = opts.v ?? 0,
      p = opts.protrude ?? 0;
    type F = typeof face;
    const opp: Record<F, F> = { front: 'back', back: 'front', left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
    const uvMap: Record<F, (u: number, v: number, p: number) => [number, number, number]> = {
      front: (u, v, p) => [u, -p, v],
      back: (u, v, p) => [u, p, v],
      left: (u, v, p) => [-p, u, v],
      right: (u, v, p) => [p, u, v],
      top: (u, v, p) => [u, v, p],
      bottom: (u, v, p) => [u, v, -p],
    };
    return this.attachTo(parent, face as Anchor3D, opp[face] as Anchor3D, uvMap[face](u, v, p));
  }

  rotate(x: number, y: number, z: number): ShapeGroup {
    const matrix = eulerRotationMatrix(x, y, z);
    return this.mapChildrenTransform((c) => {
      if (c instanceof ShapeGroup) return c.rotate(x, y, z);
      if (c instanceof TrackedShape) return c.rotate(x, y, z);
      if (c instanceof Shape) return c.rotate(x, y, z);
      return c.rotate(x); // 2D rotation only uses first arg
    }, matrix);
  }

  /**
   * Rotate around an arbitrary axis through a pivot point.
   * Sugar for: group.transform(Transform.rotationAxis(axis, angleDeg, pivot))
   */
  rotateAround(axis: [number, number, number], angleDeg: number, pivot: [number, number, number] = [0, 0, 0]): ShapeGroup {
    return this.transform(Transform.rotationAxis(axis, angleDeg, pivot));
  }

  /**
   * Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point.
   * ShapeGroup string points use built-in anchors only.
   */
  rotateAroundTo(
    axis: [number, number, number],
    pivot: [number, number, number],
    movingPoint: Anchor3D | [number, number, number],
    targetPoint: Anchor3D | [number, number, number],
    options: RotateAroundToOptions = {},
  ): ShapeGroup {
    return this.transform(
      Transform.rotateAroundTo(axis, pivot, this.resolveRotatePoint(movingPoint), this.resolveRotatePoint(targetPoint), options),
    );
  }

  /**
   * Reorient all 3D children so their primary axis (Z) points along direction.
   * Sugar for a single group-wide axis rotation via Transform.rotationAxis(...).
   */
  pointAlong(direction: [number, number, number]): ShapeGroup {
    const [dx, dy, dz] = direction;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    const nx = dx / len,
      ny = dy / len,
      nz = dz / len;
    // cross([0,0,1], [nx,ny,nz]) = [-ny, nx, 0]
    const cx = -ny,
      cy = nx,
      cz = 0;
    const sinA = Math.sqrt(cx * cx + cy * cy + cz * cz);
    const cosA = nz;
    if (sinA < 1e-10) {
      return cosA > 0 ? this : this.rotate(180, 0, 0);
    }
    const angleDeg = (Math.atan2(sinA, cosA) * 180) / Math.PI;
    const ax: [number, number, number] = [cx / sinA, cy / sinA, cz / sinA];
    return this.rotateAround(ax, angleDeg);
  }

  /** Apply a 4x4 transform matrix or Transform object to all 3D children. */
  transform(m: Mat4 | Transform): ShapeGroup {
    const matrix = m instanceof Transform ? m.toArray() : m;
    const next = new ShapeGroup(
      this.children.map((c) => {
        if (c instanceof ShapeGroup) return c.transform(m);
        if (c instanceof TrackedShape) return c.transform(m);
        if (c instanceof Shape) return c.transform(m);
        throw new Error(
          'ShapeGroup.transform only supports 3D children (Shape/TrackedShape/ShapeGroup). For Sketch children, use 2D transforms (translate/rotate/scale/mirror).',
        );
      }),
      this.childNames,
    );
    transformGroupPortsHelper(this, next, matrix);
    return transformGroupRefs(this, next, matrix);
  }

  scale(v: number | [number, number, number]): ShapeGroup {
    const matrix = Transform.scale(v).toArray();
    return this.mapChildrenTransform((c) => {
      if (c instanceof ShapeGroup) return c.scale(v);
      if (c instanceof TrackedShape) return c.scale(v);
      if (c instanceof Shape) return c.scale(v);
      return c.scale(typeof v === 'number' ? v : [v[0], v[1]]);
    }, matrix);
  }

  mirror(normal: [number, number, number]): ShapeGroup {
    const matrix = mirrorPlaneMatrix(normal);
    return this.mapChildrenTransform((c) => {
      if (c instanceof ShapeGroup) return c.mirror(normal);
      if (c instanceof TrackedShape) return c.mirror(normal);
      if (c instanceof Shape) return c.mirror(normal);
      return c.mirror([normal[0], normal[1]]);
    }, matrix);
  }

  color(hex: string): ShapeGroup {
    return this.mapChildren((c) => {
      if (c instanceof ShapeGroup) return c.color(hex);
      if (c instanceof TrackedShape) return c.color(hex);
      if (c instanceof Shape) return c.color(hex);
      return c.color(hex);
    });
  }

  // --- Placement References ---

  /**
   * Attach named placement references to this group.
   * References survive normal transforms (translate/rotate/scale/mirror/transform).
   *
   * ```javascript
   * const bracket = group(
   *   { name: 'Left', shape: leftShape },
   *   { name: 'Right', shape: rightShape },
   * ).withReferences({
   *   points: { mountCenter: [0, 0, 0] },
   * });
   * ```
   */
  withReferences(refs: PlacementReferenceInput): ShapeGroup {
    const next = new ShapeGroup(this.children, this.childNames);
    const merged = applyPlacementReferenceInput(getGroupRefs(this), refs);
    return setGroupRefs(next, merged);
  }

  /** List named placement references carried by this group. */
  referenceNames(kind?: PlacementReferenceKind): string[] {
    return placementReferenceNames(getGroupRefs(this), kind);
  }

  /** Attach named assembly ports (origin + axis + up) that survive transforms. */
  withPorts(ports: Record<string, PortInput>): ShapeGroup {
    const next = new ShapeGroup(this.children, this.childNames);
    copyGroupRefs(this, next);
    const existing = getGroupPorts(this);
    const incoming = normalizePortMapInput(ports);
    return setGroupPorts(next, mergePortMaps(existing, incoming));
  }

  /** List named port identifiers carried by this group. */
  portNames(): string[] {
    return Object.keys(getGroupPorts(this)).sort();
  }

  /**
   * Resolve a named placement reference or built-in Anchor3D to a 3D point.
   * Named refs take priority over built-in anchors.
   */
  referencePoint(ref: PlacementAnchorLike): [number, number, number] {
    const refs = getGroupRefs(this);
    if (!isAnchor3D(ref)) {
      const point = resolvePlacementReferencePoint(refs, ref);
      if (point) return point;
      const normalized = normalizeAnchor3D(ref);
      if (normalized) {
        const bb = this._bbox();
        return resolveAnchor3D(bb.min as [number, number, number], bb.max as [number, number, number], normalized);
      }
      throw new Error(`Unknown placement reference "${ref}". Available: ${placementReferenceNames(refs).join(', ') || 'none'}`);
    }
    const bb = this._bbox();
    return resolveAnchor3D(bb.min as [number, number, number], bb.max as [number, number, number], ref);
  }

  /**
   * Translate the group so the given reference lands on the target coordinate.
   *
   * ```javascript
   * const placed = importGroup('bracket-assembly.forge.js')
   *   .placeReference('mountCenter', [0, 0, 50]);
   * ```
   */
  placeReference(ref: PlacementAnchorLike, target: [number, number, number], offset?: [number, number, number]): ShapeGroup {
    const sourcePoint = this.referencePoint(ref);
    let dx = target[0] - sourcePoint[0];
    let dy = target[1] - sourcePoint[1];
    let dz = target[2] - sourcePoint[2];
    if (offset) {
      dx += offset[0];
      dy += offset[1];
      dz += offset[2];
    }
    return this.translate(dx, dy, dz);
  }
}

export function group(...items: GroupInput[]): ShapeGroup {
  const normalized = normalizeGroupInputs(items);
  return new ShapeGroup(normalized.children, normalized.childNames);
}

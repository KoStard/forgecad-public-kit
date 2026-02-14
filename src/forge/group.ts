/**
 * ShapeGroup — groups multiple shapes/sketches for joint transforms
 * without merging them into a single mesh (unlike union).
 * Colors, individual identities are preserved.
 */

import { Shape, Anchor3D, resolveAnchor3D } from './kernel';
import { Sketch } from './sketch/core';
import { TrackedShape } from './sketch/topology';

export type GroupChild = Shape | Sketch | TrackedShape | ShapeGroup;

export class ShapeGroup {
  constructor(public readonly children: GroupChild[]) {}

  private mapChildren(fn: (child: GroupChild) => GroupChild): ShapeGroup {
    return new ShapeGroup(this.children.map(fn));
  }

  translate(x: number, y: number, z: number): ShapeGroup {
    return this.mapChildren(c => {
      if (c instanceof ShapeGroup) return c.translate(x, y, z);
      if (c instanceof TrackedShape) return c.translate(x, y, z);
      if (c instanceof Shape) return c.translate(x, y, z);
      return c.translate(x, y);
    });
  }

  /** Compute combined bounding box of all 3D children */
  private _bbox(): { min: number[]; max: number[] } {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
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
    targetAnchor: Anchor3D,
    selfAnchor: Anchor3D = 'center',
    offset?: [number, number, number],
  ): ShapeGroup {
    const tbb = target instanceof ShapeGroup
      ? target._bbox()
      : (() => { const s = target instanceof TrackedShape ? target.toShape() : target; const b = s.boundingBox(); return { min: b.min as [number, number, number], max: b.max as [number, number, number] }; })();
    const sbb = this._bbox();
    const tp = resolveAnchor3D(tbb.min as [number, number, number], tbb.max as [number, number, number], targetAnchor);
    const sp = resolveAnchor3D(sbb.min as [number, number, number], sbb.max as [number, number, number], selfAnchor);
    let dx = tp[0] - sp[0], dy = tp[1] - sp[1], dz = tp[2] - sp[2];
    if (offset) { dx += offset[0]; dy += offset[1]; dz += offset[2]; }
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
    const u = opts.u ?? 0, v = opts.v ?? 0, p = opts.protrude ?? 0;
    type F = typeof face;
    const opp: Record<F, F> = { front: 'back', back: 'front', left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
    const uvMap: Record<F, (u: number, v: number, p: number) => [number, number, number]> = {
      front: (u, v, p) => [u, -p, v], back: (u, v, p) => [u, p, v],
      left: (u, v, p) => [-p, u, v], right: (u, v, p) => [p, u, v],
      top: (u, v, p) => [u, v, p], bottom: (u, v, p) => [u, v, -p],
    };
    return this.attachTo(parent, face as Anchor3D, opp[face] as Anchor3D, uvMap[face](u, v, p));
  }

  rotate(x: number, y: number, z: number): ShapeGroup {
    return this.mapChildren(c => {
      if (c instanceof ShapeGroup) return c.rotate(x, y, z);
      if (c instanceof TrackedShape) return c.rotate(x, y, z);
      if (c instanceof Shape) return c.rotate(x, y, z);
      return c.rotate(x); // 2D rotation only uses first arg
    });
  }

  scale(v: number | [number, number, number]): ShapeGroup {
    return this.mapChildren(c => {
      if (c instanceof ShapeGroup) return c.scale(v);
      if (c instanceof TrackedShape) return new TrackedShape(
        c.toShape().scale(v), c.topology, 0, true,
      );
      if (c instanceof Shape) return c.scale(v);
      return c.scale(typeof v === 'number' ? v : [v[0], v[1]]);
    });
  }

  mirror(normal: [number, number, number]): ShapeGroup {
    return this.mapChildren(c => {
      if (c instanceof ShapeGroup) return c.mirror(normal);
      if (c instanceof TrackedShape) return new TrackedShape(
        c.toShape().mirror(normal), c.topology, 0, true,
      );
      if (c instanceof Shape) return c.mirror(normal);
      return c.mirror([normal[0], normal[1]]);
    });
  }

  color(hex: string): ShapeGroup {
    return this.mapChildren(c => {
      if (c instanceof ShapeGroup) return c.color(hex);
      if (c instanceof TrackedShape) return c.color(hex);
      if (c instanceof Shape) return c.color(hex);
      return c.color(hex);
    });
  }
}

export function group(...items: GroupChild[]): ShapeGroup {
  return new ShapeGroup(items);
}

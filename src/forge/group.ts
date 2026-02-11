/**
 * ShapeGroup — groups multiple shapes/sketches for joint transforms
 * without merging them into a single mesh (unlike union).
 * Colors, individual identities are preserved.
 */

import { Shape } from './kernel';
import { Sketch } from './sketch/core';
import { TrackedShape } from './sketch/topology';

export type GroupChild = Shape | Sketch | TrackedShape;

export class ShapeGroup {
  constructor(public readonly children: GroupChild[]) {}

  translate(x: number, y: number, z: number): ShapeGroup {
    return new ShapeGroup(this.children.map(c => {
      if (c instanceof TrackedShape) return c.translate(x, y, z);
      if (c instanceof Shape) return c.translate(x, y, z);
      return c.translate(x, y);
    }));
  }

  /** Compute combined bounding box of all 3D children */
  private _bbox(): { min: number[]; max: number[] } {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const c of this.children) {
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

  rotate(x: number, y: number, z: number): ShapeGroup {
    return new ShapeGroup(this.children.map(c => {
      if (c instanceof TrackedShape) return c.rotate(x, y, z);
      if (c instanceof Shape) return c.rotate(x, y, z);
      return c.rotate(x); // 2D rotation only uses first arg
    }));
  }

  scale(v: number | [number, number, number]): ShapeGroup {
    return new ShapeGroup(this.children.map(c => {
      if (c instanceof TrackedShape) return new TrackedShape(
        c.toShape().scale(v), c.topology, 0, true,
      );
      if (c instanceof Shape) return c.scale(v);
      return c.scale(typeof v === 'number' ? v : [v[0], v[1]]);
    }));
  }

  mirror(normal: [number, number, number]): ShapeGroup {
    return new ShapeGroup(this.children.map(c => {
      if (c instanceof TrackedShape) return new TrackedShape(
        c.toShape().mirror(normal), c.topology, 0, true,
      );
      if (c instanceof Shape) return c.mirror(normal);
      return c.mirror([normal[0], normal[1]]);
    }));
  }

  color(hex: string): ShapeGroup {
    return new ShapeGroup(this.children.map(c => {
      if (c instanceof TrackedShape) return c.color(hex);
      if (c instanceof Shape) return c.color(hex);
      return c.color(hex);
    }));
  }
}

export function group(...items: GroupChild[]): ShapeGroup {
  return new ShapeGroup(items);
}

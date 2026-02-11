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

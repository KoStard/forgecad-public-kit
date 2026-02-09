import type { CrossSection } from 'manifold-3d';
import { Shape } from '../kernel';

type Anchor = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';

export class Sketch {
  public colorHex: string | undefined;

  constructor(public readonly cross: CrossSection, color?: string) {
    this.colorHex = color;
  }

  /** Set the color of this sketch (hex string, e.g. "#ff0000") */
  color(value: string | undefined): Sketch {
    return new Sketch(this.cross, value);
  }

  area(): number { return this.cross.area(); }
  bounds() { return this.cross.bounds(); }
  isEmpty(): boolean { return this.cross.isEmpty(); }
  numVert(): number { return this.cross.numVert(); }
  toPolygons() { return this.cross.toPolygons(); }

  // Method declarations (implementations added by feature modules)
  translate(x: number, y?: number): Sketch { throw new Error('Not implemented'); }
  rotate(degrees: number): Sketch { throw new Error('Not implemented'); }
  rotateAround(degrees: number, pivot: [number, number]): Sketch { throw new Error('Not implemented'); }
  scale(v: number | [number, number]): Sketch { throw new Error('Not implemented'); }
  mirror(ax: [number, number]): Sketch { throw new Error('Not implemented'); }
  add(other: Sketch): Sketch { throw new Error('Not implemented'); }
  subtract(other: Sketch): Sketch { throw new Error('Not implemented'); }
  intersect(other: Sketch): Sketch { throw new Error('Not implemented'); }
  offset(delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round'): Sketch {
    return new Sketch(this.cross.offset(delta, join), this.colorHex);
  }
  hull(): Sketch {
    return new Sketch(this.cross.hull(), this.colorHex);
  }
  simplify(epsilon = 1e-6): Sketch {
    return new Sketch(this.cross.simplify(epsilon), this.colorHex);
  }
  warp(fn: (vert: [number, number]) => void): Sketch {
    return new Sketch(this.cross.warp(fn as any), this.colorHex);
  }
  extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: number | [number, number]; center?: boolean; }): Shape { throw new Error('Not implemented'); }
  revolve(degrees?: number, segments?: number): Shape { throw new Error('Not implemented'); }
  attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor): Sketch { throw new Error('Not implemented'); }
}

export type { Anchor };

import type { CrossSection } from 'manifold-3d';
import { Shape } from '../kernel';

type Anchor = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';

export class Sketch {
  constructor(public readonly cross: CrossSection) {}

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
  offset(delta: number, join?: 'Square' | 'Round' | 'Miter'): Sketch { throw new Error('Not implemented'); }
  hull(): Sketch { throw new Error('Not implemented'); }
  simplify(epsilon?: number): Sketch { throw new Error('Not implemented'); }
  warp(fn: (vert: [number, number]) => void): Sketch { throw new Error('Not implemented'); }
  extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: number | [number, number]; center?: boolean; }): Shape { throw new Error('Not implemented'); }
  revolve(degrees?: number, segments?: number): Shape { throw new Error('Not implemented'); }
  attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor): Sketch { throw new Error('Not implemented'); }
}

export type { Anchor };

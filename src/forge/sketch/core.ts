import type { CrossSection } from 'manifold-3d';
import { Shape } from '../kernel';
import type { BrepProfilePlan } from '../brepPlan';
import { cloneBrepProfilePlan } from '../brepPlan';
import type { Mat4 } from '../transform';

type Anchor = 'center' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'top' | 'bottom' | 'left' | 'right';
type SketchPlacement3D = Mat4;

const _sketchBrepProfilePlans = new WeakMap<Sketch, BrepProfilePlan | null>();
const _sketchPlacement3D = new WeakMap<Sketch, SketchPlacement3D | null>();

function setSketchBrepProfilePlanInternal(sketch: Sketch, plan: BrepProfilePlan | null): Sketch {
  _sketchBrepProfilePlans.set(sketch, cloneBrepProfilePlan(plan));
  return sketch;
}

function cloneSketchPlacement3D(placement: SketchPlacement3D | null): SketchPlacement3D | null {
  return placement ? [...placement] as SketchPlacement3D : null;
}

function setSketchPlacement3DInternal(sketch: Sketch, placement: SketchPlacement3D | null): Sketch {
  _sketchPlacement3D.set(sketch, cloneSketchPlacement3D(placement));
  return sketch;
}

export class Sketch {
  public colorHex: string | undefined;

  constructor(public readonly cross: CrossSection, color?: string) {
    this.colorHex = color;
    setSketchBrepProfilePlanInternal(this, null);
    setSketchPlacement3DInternal(this, null);
  }

  /** Set the color of this sketch (hex string, e.g. "#ff0000") */
  color(value: string | undefined): Sketch {
    return setSketchPlacement3DInternal(
      setSketchBrepProfilePlanInternal(new Sketch(this.cross, value), getSketchBrepProfilePlan(this)),
      getSketchPlacement3D(this),
    );
  }

  /** Return a new Sketch wrapper for explicit duplication in scripts. */
  clone(): Sketch {
    return setSketchPlacement3DInternal(
      setSketchBrepProfilePlanInternal(new Sketch(this.cross, this.colorHex), getSketchBrepProfilePlan(this)),
      getSketchPlacement3D(this),
    );
  }

  /** Alias for clone() */
  duplicate(): Sketch {
    return this.clone();
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
    return copySketchPlacement3D(this, new Sketch(this.cross.offset(delta, join), this.colorHex));
  }
  hull(): Sketch {
    return copySketchPlacement3D(this, new Sketch(this.cross.hull(), this.colorHex));
  }
  simplify(epsilon = 1e-6): Sketch {
    return copySketchPlacement3D(this, new Sketch(this.cross.simplify(epsilon), this.colorHex));
  }
  warp(fn: (vert: [number, number]) => void): Sketch {
    return copySketchPlacement3D(this, new Sketch(this.cross.warp(fn as any), this.colorHex));
  }
  extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: number | [number, number]; center?: boolean; }): Shape | any { throw new Error('Not implemented'); }
  revolve(degrees?: number, segments?: number): Shape { throw new Error('Not implemented'); }
  attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor, offset?: [number, number]): Sketch { throw new Error('Not implemented'); }
  onFace(
    parent: Shape | { toShape(): Shape } | { _bbox(): { min: number[]; max: number[] } },
    face: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom',
    opts?: { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor },
  ): Sketch { throw new Error('Not implemented'); }
}

export type { Anchor };

export function getSketchBrepProfilePlan(sketch: Sketch): BrepProfilePlan | null {
  return cloneBrepProfilePlan(_sketchBrepProfilePlans.get(sketch) ?? null);
}

export function setSketchBrepProfilePlan(sketch: Sketch, plan: BrepProfilePlan | null): Sketch {
  return setSketchBrepProfilePlanInternal(sketch, plan);
}

export function getSketchPlacement3D(sketch: Sketch): SketchPlacement3D | null {
  return cloneSketchPlacement3D(_sketchPlacement3D.get(sketch) ?? null);
}

export function setSketchPlacement3D(sketch: Sketch, placement: SketchPlacement3D | null): Sketch {
  return setSketchPlacement3DInternal(sketch, placement);
}

export function copySketchPlacement3D(source: Sketch, target: Sketch): Sketch {
  return setSketchPlacement3DInternal(target, getSketchPlacement3D(source));
}

function matricesNearlyEqual(a: SketchPlacement3D | null, b: SketchPlacement3D | null, eps = 1e-8): boolean {
  if (a == null || b == null) return a == null && b == null;
  for (let i = 0; i < 16; i += 1) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}

export function mergeSketchPlacement3D(sketches: Sketch[]): SketchPlacement3D | null {
  if (sketches.length === 0) return null;
  const first = getSketchPlacement3D(sketches[0]);
  for (let i = 1; i < sketches.length; i += 1) {
    if (!matricesNearlyEqual(first, getSketchPlacement3D(sketches[i]))) return null;
  }
  return first;
}

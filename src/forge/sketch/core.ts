import type { ProfileBackend } from '../profileBackend';
import { Shape } from '../kernel';
import type { ProfileCompilePlan } from '../compilePlan';
import { cloneProfileCompilePlan } from '../compilePlan';
import type { Mat4 } from '../transform';
import type { FaceRef } from './topology';
import { lowerProfileCompilePlan } from '../profileOps';
import { faceQueryRefsEqual } from '../queryModel';
import {
  cloneSketchPlacementModel,
  type Anchor,
  type SketchFace3D,
  type SketchPlacementModel,
  type SketchWorkplane,
} from './workplaneModel';

type SketchPlacement3D = Mat4;
export type SketchOperandInput = Sketch | readonly Sketch[];

const _sketchCompileProfilePlans = new WeakMap<Sketch, ProfileCompilePlan | null>();
const _sketchPlacement3D = new WeakMap<Sketch, SketchPlacement3D | null>();
const _sketchPlacementModels = new WeakMap<Sketch, SketchPlacementModel | null>();

function setSketchCompileProfilePlanInternal(sketch: Sketch, plan: ProfileCompilePlan | null): Sketch {
  _sketchCompileProfilePlans.set(sketch, cloneProfileCompilePlan(plan));
  return sketch;
}

function cloneSketchPlacement3D(placement: SketchPlacement3D | null): SketchPlacement3D | null {
  return placement ? [...placement] as SketchPlacement3D : null;
}

function setSketchPlacement3DInternal(sketch: Sketch, placement: SketchPlacement3D | null): Sketch {
  _sketchPlacement3D.set(sketch, cloneSketchPlacement3D(placement));
  return sketch;
}

function setSketchPlacementModelInternal(sketch: Sketch, model: SketchPlacementModel | null): Sketch {
  _sketchPlacementModels.set(sketch, cloneSketchPlacementModel(model));
  return sketch;
}

export class Sketch {
  public colorHex: string | undefined;

  constructor(public readonly cross: ProfileBackend, color?: string) {
    this.colorHex = color;
    setSketchCompileProfilePlanInternal(this, null);
    setSketchPlacement3DInternal(this, null);
    setSketchPlacementModelInternal(this, null);
  }

  /** Set the color of this sketch (hex string, e.g. "#ff0000") */
  color(value: string | undefined): Sketch {
    return setSketchPlacementModelInternal(
      setSketchPlacement3DInternal(
        setSketchCompileProfilePlanInternal(new Sketch(this.cross, value), getSketchCompileProfilePlan(this)),
        getSketchPlacement3D(this),
      ),
      getSketchPlacementModel(this),
    );
  }

  /** Return a new Sketch wrapper for explicit duplication in scripts. */
  clone(): Sketch {
    return setSketchPlacementModelInternal(
      setSketchPlacement3DInternal(
        setSketchCompileProfilePlanInternal(new Sketch(this.cross, this.colorHex), getSketchCompileProfilePlan(this)),
        getSketchPlacement3D(this),
      ),
      getSketchPlacementModel(this),
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
  add(...others: SketchOperandInput[]): Sketch { throw new Error('Not implemented'); }
  subtract(...others: SketchOperandInput[]): Sketch { throw new Error('Not implemented'); }
  intersect(...others: SketchOperandInput[]): Sketch { throw new Error('Not implemented'); }
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
    return copySketchPlacement3D(this, new Sketch(this.cross.warp(fn), this.colorHex));
  }
  /**
   * Decompose this sketch into its distinct filled regions. See `sketchRegions()`.
   * Regions are returned largest-first by area.
   */
  regions(): Sketch[] { throw new Error('Not implemented'); }

  /**
   * Select the single filled region that contains the given 2D seed point.
   * Throws if the seed is outside all regions. See `sketchRegion()`.
   */
  region(seed: [number, number]): Sketch { throw new Error('Not implemented'); }

  extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: number | [number, number]; center?: boolean; }): Shape | any { throw new Error('Not implemented'); }
  revolve(degrees?: number, segments?: number): Shape { throw new Error('Not implemented'); }
  attachTo(target: Sketch, targetAnchor: Anchor, selfAnchor?: Anchor, offset?: [number, number]): Sketch { throw new Error('Not implemented'); }
  onFace(
    parentOrFace: Shape | { toShape(): Shape } | { _bbox(): { min: number[]; max: number[] } } | FaceRef,
    faceOrOpts?: 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | string | FaceRef | { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor },
    opts?: { u?: number; v?: number; protrude?: number; selfAnchor?: Anchor },
  ): Sketch { throw new Error('Not implemented'); }
}

export type {
  Anchor,
  SketchFace3D,
  SketchPlacementModel,
  SketchWorkplane,
} from './workplaneModel';

export function getSketchCompileProfilePlan(sketch: Sketch): ProfileCompilePlan | null {
  return cloneProfileCompilePlan(_sketchCompileProfilePlans.get(sketch) ?? null);
}

export function setSketchCompileProfilePlan(sketch: Sketch, plan: ProfileCompilePlan | null): Sketch {
  return setSketchCompileProfilePlanInternal(sketch, plan);
}

export function buildSketchFromCompileProfilePlan(plan: ProfileCompilePlan, color?: string): Sketch {
  return setSketchCompileProfilePlan(
    new Sketch(lowerProfileCompilePlan(plan), color),
    plan,
  );
}

export const getSketchBrepProfilePlan = getSketchCompileProfilePlan;
export const setSketchBrepProfilePlan = setSketchCompileProfilePlan;

export function getSketchPlacement3D(sketch: Sketch): SketchPlacement3D | null {
  return cloneSketchPlacement3D(_sketchPlacement3D.get(sketch) ?? null);
}

export function setSketchPlacement3D(sketch: Sketch, placement: SketchPlacement3D | null): Sketch {
  return setSketchPlacement3DInternal(sketch, placement);
}

export function getSketchPlacementModel(sketch: Sketch): SketchPlacementModel | null {
  return cloneSketchPlacementModel(_sketchPlacementModels.get(sketch) ?? null);
}

export function setSketchPlacementModel(sketch: Sketch, model: SketchPlacementModel | null): Sketch {
  return setSketchPlacementModelInternal(sketch, model);
}

export function getSketchWorkplane(sketch: Sketch): SketchWorkplane | null {
  return cloneSketchPlacementModel(_sketchPlacementModels.get(sketch) ?? null)?.workplane ?? null;
}

export function copySketchPlacement3D(source: Sketch, target: Sketch): Sketch {
  return setSketchPlacementModelInternal(
    setSketchPlacement3DInternal(target, getSketchPlacement3D(source)),
    getSketchPlacementModel(source),
  );
}

function matricesNearlyEqual(a: SketchPlacement3D | null, b: SketchPlacement3D | null, eps = 1e-8): boolean {
  if (a == null || b == null) return a == null && b == null;
  for (let i = 0; i < 16; i += 1) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}

function workplanesNearlyEqual(a: SketchWorkplane | null, b: SketchWorkplane | null, eps = 1e-8): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (!faceQueryRefsEqual(a.source, b.source)) return false;

  const vectors = [
    [a.origin, b.origin],
    [a.u, b.u],
    [a.v, b.v],
    [a.normal, b.normal],
  ] as const;
  for (const [lhs, rhs] of vectors) {
    for (let index = 0; index < lhs.length; index += 1) {
      if (Math.abs(lhs[index] - rhs[index]) > eps) return false;
    }
  }
  return true;
}

function placementModelsNearlyEqual(a: SketchPlacementModel | null, b: SketchPlacementModel | null, eps = 1e-8): boolean {
  if (a == null || b == null) return a == null && b == null;
  return workplanesNearlyEqual(a.workplane, b.workplane, eps)
    && Math.abs(a.u - b.u) <= eps
    && Math.abs(a.v - b.v) <= eps
    && Math.abs(a.protrude - b.protrude) <= eps
    && a.selfAnchor === b.selfAnchor;
}

export function mergeSketchPlacement3D(sketches: Sketch[]): SketchPlacement3D | null {
  if (sketches.length === 0) return null;
  const first = getSketchPlacement3D(sketches[0]);
  for (let i = 1; i < sketches.length; i += 1) {
    if (!matricesNearlyEqual(first, getSketchPlacement3D(sketches[i]))) return null;
  }
  return first;
}

export function mergeSketchPlacementModel(sketches: Sketch[]): SketchPlacementModel | null {
  if (sketches.length === 0) return null;
  const first = getSketchPlacementModel(sketches[0]);
  for (let i = 1; i < sketches.length; i += 1) {
    if (!placementModelsNearlyEqual(first, getSketchPlacementModel(sketches[i]))) return null;
  }
  return first;
}

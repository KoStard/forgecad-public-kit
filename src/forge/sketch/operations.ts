import {
  buildSketchFromCompileProfilePlan,
  Sketch,
  copySketchPlacement3D,
  getSketchCompileProfilePlan,
  setSketchCompileProfilePlan,
} from './core';
import { buildOffsetProfileCompilePlan } from '../compilePlan';

export function sketchOffset(sketch: Sketch, delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round'): Sketch {
  const nextPlan = join === 'Round' ? buildOffsetProfileCompilePlan(getSketchCompileProfilePlan(sketch), delta, 'Round') : null;
  return copySketchPlacement3D(
    sketch,
    nextPlan
      ? buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex)
      : setSketchCompileProfilePlan(new Sketch(sketch.cross.offset(delta, join), sketch.colorHex), null),
  );
}

export function sketchHull(sketch: Sketch): Sketch {
  return copySketchPlacement3D(sketch, new Sketch(sketch.cross.hull(), sketch.colorHex));
}

export function sketchSimplify(sketch: Sketch, epsilon = 1e-6): Sketch {
  return copySketchPlacement3D(sketch, new Sketch(sketch.cross.simplify(epsilon), sketch.colorHex));
}

export function sketchWarp(sketch: Sketch, fn: (vert: [number, number]) => void): Sketch {
  return copySketchPlacement3D(sketch, new Sketch(sketch.cross.warp(fn as any), sketch.colorHex));
}

Sketch.prototype.offset = function(delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round') { return sketchOffset(this, delta, join); };
Sketch.prototype.hull = function() { return sketchHull(this); };
Sketch.prototype.simplify = function(epsilon = 1e-6) { return sketchSimplify(this, epsilon); };
Sketch.prototype.warp = function(fn: (vert: [number, number]) => void) { return sketchWarp(this, fn); };

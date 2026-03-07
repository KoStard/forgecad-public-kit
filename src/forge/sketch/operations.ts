import { Sketch, copySketchPlacement3D, getSketchBrepProfilePlan, setSketchBrepProfilePlan } from './core';
import { buildBrepOffsetProfilePlan } from '../brepPlan';

export function sketchOffset(sketch: Sketch, delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round'): Sketch {
  return copySketchPlacement3D(
    sketch,
    setSketchBrepProfilePlan(
      new Sketch(sketch.cross.offset(delta, join), sketch.colorHex),
      join === 'Round' ? buildBrepOffsetProfilePlan(getSketchBrepProfilePlan(sketch), delta, 'Round') : null,
    ),
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

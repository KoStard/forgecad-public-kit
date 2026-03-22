import {
  buildSketchFromCompileProfilePlan,
  Sketch,
  copySketchPlacement3D,
  getSketchCompileProfilePlan,
  setSketchCompileProfilePlan,
} from './core';
import { buildHullProfileCompilePlan, buildOffsetProfileCompilePlan } from '../compilePlan';


export function sketchOffset(sketch: Sketch, delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round'): Sketch {
  const nextPlan = buildOffsetProfileCompilePlan(getSketchCompileProfilePlan(sketch), delta, join);
  return copySketchPlacement3D(
    sketch,
    nextPlan
      ? buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex)
      : setSketchCompileProfilePlan(new Sketch(sketch.cross.offset(delta, join), sketch.colorHex), null),
  );
}

export function sketchHull(sketch: Sketch): Sketch {
  const nextPlan = buildHullProfileCompilePlan([getSketchCompileProfilePlan(sketch)]);
  return copySketchPlacement3D(
    sketch,
    nextPlan
      ? buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex)
      : setSketchCompileProfilePlan(new Sketch(sketch.cross.hull(), sketch.colorHex), null),
  );
}

Sketch.prototype.offset = function(delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round') { return sketchOffset(this, delta, join); };
Sketch.prototype.hull = function() { return sketchHull(this); };

import {
  buildSketchFromCompileProfilePlan,
  Sketch,
  copySketchPlacement3D,
  getSketchCompileProfilePlan,
} from './core';
import { buildHullProfileCompilePlan, buildOffsetProfileCompilePlan } from '../compilePlan';


export function sketchOffset(sketch: Sketch, delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round'): Sketch {
  const nextPlan = buildOffsetProfileCompilePlan(getSketchCompileProfilePlan(sketch), delta, join);
  return copySketchPlacement3D(
    sketch,
    buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex),
  );
}

export function sketchHull(sketch: Sketch): Sketch {
  const nextPlan = buildHullProfileCompilePlan([getSketchCompileProfilePlan(sketch)]);
  return copySketchPlacement3D(
    sketch,
    buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex),
  );
}

Sketch.prototype.offset = function(delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round') { return sketchOffset(this, delta, join); };
Sketch.prototype.hull = function() { return sketchHull(this); };

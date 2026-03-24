import { buildOffsetProfileCompilePlan } from '../compilePlan';
import { buildSketchFromCompileProfilePlan, copySketchPlacement3D, getSketchCompileProfilePlan, Sketch } from './core';

export function sketchOffset(sketch: Sketch, delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round'): Sketch {
  const nextPlan = buildOffsetProfileCompilePlan(getSketchCompileProfilePlan(sketch), delta, join);
  return copySketchPlacement3D(sketch, buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex));
}

Sketch.prototype.offset = function (delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round') {
  return sketchOffset(this, delta, join);
};

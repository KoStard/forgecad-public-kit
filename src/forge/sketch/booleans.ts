import {
  buildSketchFromCompileProfilePlan,
  Sketch,
  type SketchOperandInput,
  getSketchCompileProfilePlan,
  mergeSketchPlacementModel,
  mergeSketchPlacement3D,
  setSketchPlacement3D,
  setSketchPlacementModel,
} from './core';
import { buildBooleanProfileCompilePlan } from '../compilePlan';
import { describeApiArg, normalizeVariadicArgs } from '../apiArgs';

function normalizeSketchOperands(apiName: string, inputs: readonly unknown[], minCount: number, usage: string): Sketch[] {
  return normalizeVariadicArgs({
    apiName,
    inputs,
    minCount,
    itemName: 'sketch',
    usage,
    coerce: (value) => {
      if (value instanceof Sketch) return value;
      throw new Error(`expected a Sketch, got ${describeApiArg(value)}`);
    },
  });
}

export function sketchAdd(sketch: Sketch, ...others: SketchOperandInput[]): Sketch {
  const sketches = [sketch, ...normalizeSketchOperands(
    'Sketch.add()',
    others,
    1,
    'Use sketch.add(other1, other2) or sketch.add([other1, other2]).',
  )];
  const nextPlan = buildBooleanProfileCompilePlan('union', sketches.map((entry) => getSketchCompileProfilePlan(entry)));
  return setSketchPlacementModel(
    setSketchPlacement3D(
      buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex),
      mergeSketchPlacement3D(sketches),
    ),
    mergeSketchPlacementModel(sketches),
  );
}

export function sketchSubtract(sketch: Sketch, ...others: SketchOperandInput[]): Sketch {
  const sketches = [sketch, ...normalizeSketchOperands(
    'Sketch.subtract()',
    others,
    1,
    'Use sketch.subtract(other1, other2) or sketch.subtract([other1, other2]).',
  )];
  const nextPlan = buildBooleanProfileCompilePlan('difference', sketches.map((entry) => getSketchCompileProfilePlan(entry)));
  return setSketchPlacementModel(
    setSketchPlacement3D(
      buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex),
      mergeSketchPlacement3D(sketches),
    ),
    mergeSketchPlacementModel(sketches),
  );
}

export function sketchIntersect(sketch: Sketch, ...others: SketchOperandInput[]): Sketch {
  const sketches = [sketch, ...normalizeSketchOperands(
    'Sketch.intersect()',
    others,
    1,
    'Use sketch.intersect(other1, other2) or sketch.intersect([other1, other2]).',
  )];
  const nextPlan = buildBooleanProfileCompilePlan('intersection', sketches.map((entry) => getSketchCompileProfilePlan(entry)));
  return setSketchPlacementModel(
    setSketchPlacement3D(
      buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex),
      mergeSketchPlacement3D(sketches),
    ),
    mergeSketchPlacementModel(sketches),
  );
}

export function union2d(...inputs: SketchOperandInput[]): Sketch {
  const sketches = normalizeSketchOperands(
    'union2d()',
    inputs,
    1,
    'Use union2d(sketch1, sketch2) or union2d([sketch1, sketch2]).',
  );
  if (sketches.length === 0) throw new Error('union2d requires at least one sketch');
  if (sketches.length === 1) return sketches[0];
  const nextPlan = buildBooleanProfileCompilePlan('union', sketches.map((sketch) => getSketchCompileProfilePlan(sketch)));
  return setSketchPlacementModel(
    setSketchPlacement3D(
      buildSketchFromCompileProfilePlan(nextPlan, sketches[0].colorHex),
      mergeSketchPlacement3D(sketches),
    ),
    mergeSketchPlacementModel(sketches),
  );
}

export function difference2d(...inputs: SketchOperandInput[]): Sketch {
  const sketches = normalizeSketchOperands(
    'difference2d()',
    inputs,
    2,
    'Use difference2d(base, cutter1, cutter2) or difference2d([base, cutter1, cutter2]).',
  );
  if (sketches.length < 2) throw new Error('difference2d requires at least two sketches');
  const nextPlan = buildBooleanProfileCompilePlan('difference', sketches.map((sketch) => getSketchCompileProfilePlan(sketch)));
  return setSketchPlacementModel(
    setSketchPlacement3D(
      buildSketchFromCompileProfilePlan(nextPlan, sketches[0].colorHex),
      mergeSketchPlacement3D(sketches),
    ),
    mergeSketchPlacementModel(sketches),
  );
}

export function intersection2d(...inputs: SketchOperandInput[]): Sketch {
  const sketches = normalizeSketchOperands(
    'intersection2d()',
    inputs,
    2,
    'Use intersection2d(sketch1, sketch2) or intersection2d([sketch1, sketch2]).',
  );
  if (sketches.length < 2) throw new Error('intersection2d requires at least two sketches');
  const nextPlan = buildBooleanProfileCompilePlan('intersection', sketches.map((sketch) => getSketchCompileProfilePlan(sketch)));
  return setSketchPlacementModel(
    setSketchPlacement3D(
      buildSketchFromCompileProfilePlan(nextPlan, sketches[0].colorHex),
      mergeSketchPlacement3D(sketches),
    ),
    mergeSketchPlacementModel(sketches),
  );
}

Sketch.prototype.add = function (...others: SketchOperandInput[]) { return sketchAdd(this, ...others); };
Sketch.prototype.subtract = function (...others: SketchOperandInput[]) { return sketchSubtract(this, ...others); };
Sketch.prototype.intersect = function (...others: SketchOperandInput[]) { return sketchIntersect(this, ...others); };

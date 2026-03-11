import { Sketch, type SketchOperandInput, getSketchCompileProfilePlan, mergeSketchPlacement3D, setSketchCompileProfilePlan, setSketchPlacement3D } from './core';
import { getWasm } from '../kernel';
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
  return setSketchPlacement3D(
    setSketchCompileProfilePlan(
      new Sketch(getWasm().CrossSection.union(sketches.map((entry) => entry.cross)), sketch.colorHex),
      buildBooleanProfileCompilePlan('union', sketches.map((entry) => getSketchCompileProfilePlan(entry))),
    ),
    mergeSketchPlacement3D(sketches),
  );
}

export function sketchSubtract(sketch: Sketch, ...others: SketchOperandInput[]): Sketch {
  const sketches = [sketch, ...normalizeSketchOperands(
    'Sketch.subtract()',
    others,
    1,
    'Use sketch.subtract(other1, other2) or sketch.subtract([other1, other2]).',
  )];
  return setSketchPlacement3D(
    setSketchCompileProfilePlan(
      new Sketch(getWasm().CrossSection.difference(sketches.map((entry) => entry.cross)), sketch.colorHex),
      buildBooleanProfileCompilePlan('difference', sketches.map((entry) => getSketchCompileProfilePlan(entry))),
    ),
    mergeSketchPlacement3D(sketches),
  );
}

export function sketchIntersect(sketch: Sketch, ...others: SketchOperandInput[]): Sketch {
  const sketches = [sketch, ...normalizeSketchOperands(
    'Sketch.intersect()',
    others,
    1,
    'Use sketch.intersect(other1, other2) or sketch.intersect([other1, other2]).',
  )];
  return setSketchPlacement3D(
    setSketchCompileProfilePlan(
      new Sketch(getWasm().CrossSection.intersection(sketches.map((entry) => entry.cross)), sketch.colorHex),
      buildBooleanProfileCompilePlan('intersection', sketches.map((entry) => getSketchCompileProfilePlan(entry))),
    ),
    mergeSketchPlacement3D(sketches),
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
  return setSketchPlacement3D(
    setSketchCompileProfilePlan(
      new Sketch(getWasm().CrossSection.union(sketches.map(s => s.cross)), sketches[0].colorHex),
      buildBooleanProfileCompilePlan('union', sketches.map((sketch) => getSketchCompileProfilePlan(sketch))),
    ),
    mergeSketchPlacement3D(sketches),
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
  return setSketchPlacement3D(
    setSketchCompileProfilePlan(
      new Sketch(getWasm().CrossSection.difference(sketches.map(s => s.cross)), sketches[0].colorHex),
      buildBooleanProfileCompilePlan('difference', sketches.map((sketch) => getSketchCompileProfilePlan(sketch))),
    ),
    mergeSketchPlacement3D(sketches),
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
  return setSketchPlacement3D(
    setSketchCompileProfilePlan(
      new Sketch(getWasm().CrossSection.intersection(sketches.map(s => s.cross)), sketches[0].colorHex),
      buildBooleanProfileCompilePlan('intersection', sketches.map((sketch) => getSketchCompileProfilePlan(sketch))),
    ),
    mergeSketchPlacement3D(sketches),
  );
}

export function hull2d(...inputs: SketchOperandInput[]): Sketch {
  const sketches = normalizeSketchOperands(
    'hull2d()',
    inputs,
    1,
    'Use hull2d(sketch1, sketch2) or hull2d([sketch1, sketch2]).',
  );
  if (sketches.length === 0) throw new Error('hull2d requires at least one sketch');
  return setSketchPlacement3D(
    setSketchCompileProfilePlan(
      new Sketch(getWasm().CrossSection.hull(sketches.map(s => s.cross)), sketches[0].colorHex),
      null,
    ),
    mergeSketchPlacement3D(sketches),
  );
}

Sketch.prototype.add = function (...others: SketchOperandInput[]) { return sketchAdd(this, ...others); };
Sketch.prototype.subtract = function (...others: SketchOperandInput[]) { return sketchSubtract(this, ...others); };
Sketch.prototype.intersect = function (...others: SketchOperandInput[]) { return sketchIntersect(this, ...others); };

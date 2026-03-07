import { Sketch, getSketchBrepProfilePlan, mergeSketchPlacement3D, setSketchBrepProfilePlan, setSketchPlacement3D } from './core';
import { getWasm } from '../kernel';
import { buildBrepBooleanProfilePlan } from '../brepPlan';

export function sketchAdd(sketch: Sketch, other: Sketch): Sketch {
  return setSketchPlacement3D(
    setSketchBrepProfilePlan(
      new Sketch(sketch.cross.add(other.cross), sketch.colorHex),
      buildBrepBooleanProfilePlan('union', [getSketchBrepProfilePlan(sketch), getSketchBrepProfilePlan(other)]),
    ),
    mergeSketchPlacement3D([sketch, other]),
  );
}

export function sketchSubtract(sketch: Sketch, other: Sketch): Sketch {
  return setSketchPlacement3D(
    setSketchBrepProfilePlan(
      new Sketch(sketch.cross.subtract(other.cross), sketch.colorHex),
      buildBrepBooleanProfilePlan('difference', [getSketchBrepProfilePlan(sketch), getSketchBrepProfilePlan(other)]),
    ),
    mergeSketchPlacement3D([sketch, other]),
  );
}

export function sketchIntersect(sketch: Sketch, other: Sketch): Sketch {
  return setSketchPlacement3D(
    setSketchBrepProfilePlan(
      new Sketch(sketch.cross.intersect(other.cross), sketch.colorHex),
      buildBrepBooleanProfilePlan('intersection', [getSketchBrepProfilePlan(sketch), getSketchBrepProfilePlan(other)]),
    ),
    mergeSketchPlacement3D([sketch, other]),
  );
}

export function union2d(...sketches: Sketch[]): Sketch {
  if (sketches.length === 0) throw new Error('union2d requires at least one sketch');
  if (sketches.length === 1) return sketches[0];
  return setSketchPlacement3D(
    setSketchBrepProfilePlan(
      new Sketch(getWasm().CrossSection.union(sketches.map(s => s.cross)), sketches[0].colorHex),
      buildBrepBooleanProfilePlan('union', sketches.map((sketch) => getSketchBrepProfilePlan(sketch))),
    ),
    mergeSketchPlacement3D(sketches),
  );
}

export function difference2d(...sketches: Sketch[]): Sketch {
  if (sketches.length < 2) throw new Error('difference2d requires at least two sketches');
  return setSketchPlacement3D(
    setSketchBrepProfilePlan(
      new Sketch(getWasm().CrossSection.difference(sketches.map(s => s.cross)), sketches[0].colorHex),
      buildBrepBooleanProfilePlan('difference', sketches.map((sketch) => getSketchBrepProfilePlan(sketch))),
    ),
    mergeSketchPlacement3D(sketches),
  );
}

export function intersection2d(...sketches: Sketch[]): Sketch {
  if (sketches.length < 2) throw new Error('intersection2d requires at least two sketches');
  return setSketchPlacement3D(
    setSketchBrepProfilePlan(
      new Sketch(getWasm().CrossSection.intersection(sketches.map(s => s.cross)), sketches[0].colorHex),
      buildBrepBooleanProfilePlan('intersection', sketches.map((sketch) => getSketchBrepProfilePlan(sketch))),
    ),
    mergeSketchPlacement3D(sketches),
  );
}

export function hull2d(...sketches: Sketch[]): Sketch {
  if (sketches.length === 0) throw new Error('hull2d requires at least one sketch');
  return setSketchPlacement3D(
    setSketchBrepProfilePlan(
      new Sketch(getWasm().CrossSection.hull(sketches.map(s => s.cross)), sketches[0].colorHex),
      null,
    ),
    mergeSketchPlacement3D(sketches),
  );
}

Sketch.prototype.add = function (other: Sketch) { return sketchAdd(this, other); };
Sketch.prototype.subtract = function (other: Sketch) { return sketchSubtract(this, other); };
Sketch.prototype.intersect = function (other: Sketch) { return sketchIntersect(this, other); };

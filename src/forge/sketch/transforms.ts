import {
  buildSketchFromCompileProfilePlan,
  Sketch,
  copySketchPlacement3D,
  getSketchCompileProfilePlan,
  setSketchCompileProfilePlan,
} from './core';
import { appendProfileCompileTransform } from '../compilePlan';
import { asCrossSection, fromCrossSection } from '../backends/manifold/profileCast';

export function sketchTranslate(sketch: Sketch, x: number, y = 0): Sketch {
  const nextPlan = appendProfileCompileTransform(getSketchCompileProfilePlan(sketch), { kind: 'translate', x, y });
  return copySketchPlacement3D(
    sketch,
    nextPlan
      ? buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex)
      : setSketchCompileProfilePlan(new Sketch(fromCrossSection(asCrossSection(sketch.cross).translate(x, y)), sketch.colorHex), null),
  );
}

export function sketchRotate(sketch: Sketch, degrees: number): Sketch {
  const nextPlan = appendProfileCompileTransform(getSketchCompileProfilePlan(sketch), { kind: 'rotate', degrees });
  return copySketchPlacement3D(
    sketch,
    nextPlan
      ? buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex)
      : setSketchCompileProfilePlan(new Sketch(fromCrossSection(asCrossSection(sketch.cross).rotate(degrees)), sketch.colorHex), null),
  );
}

export function sketchRotateAround(sketch: Sketch, degrees: number, pivot: [number, number]): Sketch {
  return sketchTranslate(sketchRotate(sketchTranslate(sketch, -pivot[0], -pivot[1]), degrees), pivot[0], pivot[1]);
}

export function sketchScale(sketch: Sketch, v: number | [number, number]): Sketch {
  const scale = typeof v === 'number' ? [v, v] : v;
  const nextPlan = appendProfileCompileTransform(getSketchCompileProfilePlan(sketch), { kind: 'scale', x: scale[0], y: scale[1] });
  return copySketchPlacement3D(
    sketch,
    nextPlan
      ? buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex)
      : setSketchCompileProfilePlan(new Sketch(fromCrossSection(asCrossSection(sketch.cross).scale(v as any)), sketch.colorHex), null),
  );
}

export function sketchMirror(sketch: Sketch, ax: [number, number]): Sketch {
  const nextPlan = appendProfileCompileTransform(getSketchCompileProfilePlan(sketch), {
    kind: 'mirror',
    normalX: ax[0],
    normalY: ax[1],
  });
  return copySketchPlacement3D(
    sketch,
    nextPlan
      ? buildSketchFromCompileProfilePlan(nextPlan, sketch.colorHex)
      : setSketchCompileProfilePlan(new Sketch(fromCrossSection(asCrossSection(sketch.cross).mirror(ax)), sketch.colorHex), null),
  );
}

Sketch.prototype.translate = function (x: number, y = 0) { return sketchTranslate(this, x, y); };
Sketch.prototype.rotate = function (degrees: number) { return sketchRotate(this, degrees); };
Sketch.prototype.rotateAround = function (degrees: number, pivot: [number, number]) { return sketchRotateAround(this, degrees, pivot); };
Sketch.prototype.scale = function (v: number | [number, number]) { return sketchScale(this, v); };
Sketch.prototype.mirror = function (ax: [number, number]) { return sketchMirror(this, ax); };

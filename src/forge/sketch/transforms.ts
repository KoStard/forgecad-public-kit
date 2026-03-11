import { Sketch, copySketchPlacement3D, getSketchCompileProfilePlan, setSketchCompileProfilePlan } from './core';
import { appendProfileCompileTransform } from '../compilePlan';

export function sketchTranslate(sketch: Sketch, x: number, y = 0): Sketch {
  return copySketchPlacement3D(
    sketch,
    setSketchCompileProfilePlan(
      new Sketch(sketch.cross.translate(x, y), sketch.colorHex),
      appendProfileCompileTransform(getSketchCompileProfilePlan(sketch), { kind: 'translate', x, y }),
    ),
  );
}

export function sketchRotate(sketch: Sketch, degrees: number): Sketch {
  return copySketchPlacement3D(
    sketch,
    setSketchCompileProfilePlan(
      new Sketch(sketch.cross.rotate(degrees), sketch.colorHex),
      appendProfileCompileTransform(getSketchCompileProfilePlan(sketch), { kind: 'rotate', degrees }),
    ),
  );
}

export function sketchRotateAround(sketch: Sketch, degrees: number, pivot: [number, number]): Sketch {
  return sketchTranslate(sketchRotate(sketchTranslate(sketch, -pivot[0], -pivot[1]), degrees), pivot[0], pivot[1]);
}

export function sketchScale(sketch: Sketch, v: number | [number, number]): Sketch {
  const scale = typeof v === 'number' ? [v, v] : v;
  return copySketchPlacement3D(
    sketch,
    setSketchCompileProfilePlan(
      new Sketch(sketch.cross.scale(v as any), sketch.colorHex),
      appendProfileCompileTransform(getSketchCompileProfilePlan(sketch), { kind: 'scale', x: scale[0], y: scale[1] }),
    ),
  );
}

export function sketchMirror(sketch: Sketch, ax: [number, number]): Sketch {
  return copySketchPlacement3D(
    sketch,
    setSketchCompileProfilePlan(
      new Sketch(sketch.cross.mirror(ax), sketch.colorHex),
      appendProfileCompileTransform(getSketchCompileProfilePlan(sketch), {
        kind: 'mirror',
        normalX: ax[0],
        normalY: ax[1],
      }),
    ),
  );
}

Sketch.prototype.translate = function (x: number, y = 0) { return sketchTranslate(this, x, y); };
Sketch.prototype.rotate = function (degrees: number) { return sketchRotate(this, degrees); };
Sketch.prototype.rotateAround = function (degrees: number, pivot: [number, number]) { return sketchRotateAround(this, degrees, pivot); };
Sketch.prototype.scale = function (v: number | [number, number]) { return sketchScale(this, v); };
Sketch.prototype.mirror = function (ax: [number, number]) { return sketchMirror(this, ax); };

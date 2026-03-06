import { Sketch, getSketchBrepProfilePlan, setSketchBrepProfilePlan } from './core';
import { appendBrepProfileTransform } from '../brepPlan';

export function sketchTranslate(sketch: Sketch, x: number, y = 0): Sketch {
  return setSketchBrepProfilePlan(
    new Sketch(sketch.cross.translate(x, y), sketch.colorHex),
    appendBrepProfileTransform(getSketchBrepProfilePlan(sketch), { kind: 'translate', x, y }),
  );
}

export function sketchRotate(sketch: Sketch, degrees: number): Sketch {
  return setSketchBrepProfilePlan(
    new Sketch(sketch.cross.rotate(degrees), sketch.colorHex),
    appendBrepProfileTransform(getSketchBrepProfilePlan(sketch), { kind: 'rotate', degrees }),
  );
}

export function sketchRotateAround(sketch: Sketch, degrees: number, pivot: [number, number]): Sketch {
  return sketchTranslate(sketchRotate(sketchTranslate(sketch, -pivot[0], -pivot[1]), degrees), pivot[0], pivot[1]);
}

export function sketchScale(sketch: Sketch, v: number | [number, number]): Sketch {
  const scale = typeof v === 'number' ? [v, v] : v;
  return setSketchBrepProfilePlan(
    new Sketch(sketch.cross.scale(v as any), sketch.colorHex),
    appendBrepProfileTransform(getSketchBrepProfilePlan(sketch), { kind: 'scale', x: scale[0], y: scale[1] }),
  );
}

export function sketchMirror(sketch: Sketch, ax: [number, number]): Sketch {
  return setSketchBrepProfilePlan(new Sketch(sketch.cross.mirror(ax), sketch.colorHex), null);
}

Sketch.prototype.translate = function (x: number, y = 0) { return sketchTranslate(this, x, y); };
Sketch.prototype.rotate = function (degrees: number) { return sketchRotate(this, degrees); };
Sketch.prototype.rotateAround = function (degrees: number, pivot: [number, number]) { return sketchRotateAround(this, degrees, pivot); };
Sketch.prototype.scale = function (v: number | [number, number]) { return sketchScale(this, v); };
Sketch.prototype.mirror = function (ax: [number, number]) { return sketchMirror(this, ax); };

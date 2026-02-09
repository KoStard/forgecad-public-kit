import { Sketch } from './core';

export function sketchTranslate(sketch: Sketch, x: number, y = 0): Sketch {
  return new Sketch(sketch.cross.translate(x, y), sketch.colorHex);
}

export function sketchRotate(sketch: Sketch, degrees: number): Sketch {
  return new Sketch(sketch.cross.rotate(degrees), sketch.colorHex);
}

export function sketchRotateAround(sketch: Sketch, degrees: number, pivot: [number, number]): Sketch {
  return sketchTranslate(sketchRotate(sketchTranslate(sketch, -pivot[0], -pivot[1]), degrees), pivot[0], pivot[1]);
}

export function sketchScale(sketch: Sketch, v: number | [number, number]): Sketch {
  return new Sketch(sketch.cross.scale(v as any), sketch.colorHex);
}

export function sketchMirror(sketch: Sketch, ax: [number, number]): Sketch {
  return new Sketch(sketch.cross.mirror(ax), sketch.colorHex);
}

Sketch.prototype.translate = function (x: number, y = 0) { return sketchTranslate(this, x, y); };
Sketch.prototype.rotate = function (degrees: number) { return sketchRotate(this, degrees); };
Sketch.prototype.rotateAround = function (degrees: number, pivot: [number, number]) { return sketchRotateAround(this, degrees, pivot); };
Sketch.prototype.scale = function (v: number | [number, number]) { return sketchScale(this, v); };
Sketch.prototype.mirror = function (ax: [number, number]) { return sketchMirror(this, ax); };

import { Sketch } from './core';

export function sketchOffset(sketch: Sketch, delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round'): Sketch {
  return new Sketch(sketch.cross.offset(delta, join));
}

export function sketchHull(sketch: Sketch): Sketch {
  return new Sketch(sketch.cross.hull());
}

export function sketchSimplify(sketch: Sketch, epsilon = 1e-6): Sketch {
  return new Sketch(sketch.cross.simplify(epsilon));
}

export function sketchWarp(sketch: Sketch, fn: (vert: [number, number]) => void): Sketch {
  return new Sketch(sketch.cross.warp(fn as any));
}

Sketch.prototype.offset = function(delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round') { return sketchOffset(this, delta, join); };
Sketch.prototype.hull = function() { return sketchHull(this); };
Sketch.prototype.simplify = function(epsilon = 1e-6) { return sketchSimplify(this, epsilon); };
Sketch.prototype.warp = function(fn: (vert: [number, number]) => void) { return sketchWarp(this, fn); };

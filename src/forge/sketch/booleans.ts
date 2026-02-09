import { Sketch } from './core';
import { getWasm } from '../kernel';

export function sketchAdd(sketch: Sketch, other: Sketch): Sketch {
  return new Sketch(sketch.cross.add(other.cross), sketch.colorHex);
}

export function sketchSubtract(sketch: Sketch, other: Sketch): Sketch {
  return new Sketch(sketch.cross.subtract(other.cross), sketch.colorHex);
}

export function sketchIntersect(sketch: Sketch, other: Sketch): Sketch {
  return new Sketch(sketch.cross.intersect(other.cross), sketch.colorHex);
}

export function union2d(...sketches: Sketch[]): Sketch {
  if (sketches.length === 0) throw new Error('union2d requires at least one sketch');
  if (sketches.length === 1) return sketches[0];
  return new Sketch(getWasm().CrossSection.union(sketches.map(s => s.cross)), sketches[0].colorHex);
}

export function difference2d(...sketches: Sketch[]): Sketch {
  if (sketches.length < 2) throw new Error('difference2d requires at least two sketches');
  return new Sketch(getWasm().CrossSection.difference(sketches.map(s => s.cross)), sketches[0].colorHex);
}

export function intersection2d(...sketches: Sketch[]): Sketch {
  if (sketches.length < 2) throw new Error('intersection2d requires at least two sketches');
  return new Sketch(getWasm().CrossSection.intersection(sketches.map(s => s.cross)), sketches[0].colorHex);
}

export function hull2d(...sketches: Sketch[]): Sketch {
  if (sketches.length === 0) throw new Error('hull2d requires at least one sketch');
  return new Sketch(getWasm().CrossSection.hull(sketches.map(s => s.cross)), sketches[0].colorHex);
}

Sketch.prototype.add = function (other: Sketch) { return sketchAdd(this, other); };
Sketch.prototype.subtract = function (other: Sketch) { return sketchSubtract(this, other); };
Sketch.prototype.intersect = function (other: Sketch) { return sketchIntersect(this, other); };

import { Sketch } from './core';
import { Shape } from '../kernel';

export function sketchExtrude(sketch: Sketch, height: number, opts?: {
  twist?: number;
  divisions?: number;
  scaleTop?: number | [number, number];
  center?: boolean;
}): Shape {
  const m = sketch.cross.extrude(
    height,
    opts?.divisions ?? 0,
    opts?.twist ?? 0,
    opts?.scaleTop as any,
    opts?.center ?? false,
  );
  return new Shape(m);
}

export function sketchRevolve(sketch: Sketch, degrees = 360, segments?: number): Shape {
  return new Shape(sketch.cross.revolve(segments ?? 0, degrees));
}

Sketch.prototype.extrude = function(height: number, opts?: {
  twist?: number;
  divisions?: number;
  scaleTop?: number | [number, number];
  center?: boolean;
}) { return sketchExtrude(this, height, opts); };

Sketch.prototype.revolve = function(degrees = 360, segments?: number) { return sketchRevolve(this, degrees, segments); };

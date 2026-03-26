/**
 * Basic fastener and hardware shapes: boltHole, fastenerHole, counterbore, tube, pipe,
 * hexNut, roundedBox, bracket, holePattern, and the METRIC_HOLE_TABLE.
 */

import { box, cylinder, Shape, union } from '../kernel';

export type MetricSize = 'M2' | 'M2.5' | 'M3' | 'M4' | 'M5' | 'M6' | 'M8' | 'M10';
export type FastenerFit = 'close' | 'normal' | 'loose' | 'tap';

export interface FastenerHoleOptions {
  standard?: 'iso-metric';
  size: MetricSize;
  fit?: FastenerFit;
  depth: number;
  counterbore?: { depth: number; diameter?: number };
  countersink?: { diameter: number; angleDeg?: number };
  center?: boolean;
  segments?: number;
}

export const METRIC_HOLE_TABLE: Record<MetricSize, { close: number; normal: number; loose: number; tap: number; head: number }> = {
  M2: { close: 2.2, normal: 2.4, loose: 2.6, tap: 1.6, head: 4.0 },
  'M2.5': { close: 2.7, normal: 2.9, loose: 3.1, tap: 2.05, head: 5.0 },
  M3: { close: 3.2, normal: 3.4, loose: 3.6, tap: 2.5, head: 5.6 },
  M4: { close: 4.3, normal: 4.5, loose: 4.8, tap: 3.3, head: 7.5 },
  M5: { close: 5.3, normal: 5.5, loose: 5.8, tap: 4.2, head: 9.2 },
  M6: { close: 6.4, normal: 6.6, loose: 7.0, tap: 5.0, head: 11.0 },
  M8: { close: 8.4, normal: 9.0, loose: 10.0, tap: 6.8, head: 14.0 },
  M10: { close: 10.5, normal: 11.0, loose: 12.0, tap: 8.5, head: 18.0 },
};

/** Through-hole cylinder centered at origin, intended as a cutter (subtract from part). */
export function boltHole(diameter: number, depth: number): Shape {
  return cylinder(depth, diameter / 2, undefined, 32, true);
}

/**
 * Standardized metric fastener hole (through-hole/tap drill + optional counterbore/countersink).
 * Returns hole geometry intended as a cutter (subtract from part).
 */
export function fastenerHole(opts: FastenerHoleOptions): Shape {
  const standard = opts.standard ?? 'iso-metric';
  if (standard !== 'iso-metric') {
    throw new Error(`Unsupported fastener standard "${standard}"`);
  }

  const sizeData = METRIC_HOLE_TABLE[opts.size];
  if (!sizeData) throw new Error(`Unsupported fastener size "${opts.size}"`);

  const fit = opts.fit ?? 'normal';
  const holeDia = sizeData[fit];
  const depth = opts.depth;
  const segs = opts.segments ?? 48;
  const centered = opts.center ?? true;

  let hole = cylinder(depth, holeDia / 2, undefined, segs, true);

  if (opts.counterbore) {
    const boreDepth = Math.max(0.01, opts.counterbore.depth);
    const boreDia = Math.max(holeDia, opts.counterbore.diameter ?? sizeData.head);
    const bore = cylinder(boreDepth, boreDia / 2, undefined, segs, true).translate(0, 0, depth / 2 - boreDepth / 2);
    hole = union(hole, bore);
  }

  if (opts.countersink) {
    const sinkDia = Math.max(holeDia, opts.countersink.diameter);
    const angleDeg = opts.countersink.angleDeg ?? 90;
    const angleRad = (angleDeg * Math.PI) / 180;
    const sinkDepth = ((sinkDia - holeDia) * 0.5) / Math.tan(angleRad * 0.5);
    const sink = cylinder(Math.max(0.01, sinkDepth), sinkDia / 2, holeDia / 2, segs, true).translate(0, 0, depth / 2 - sinkDepth / 2);
    hole = union(hole, sink);
  }

  if (!centered) {
    hole = hole.translate(0, 0, depth / 2);
  }

  return hole;
}

/** Counterbore hole — through-hole with a wider recess at the top */
export function counterbore(holeDia: number, boreDia: number, boreDepth: number, totalDepth: number): Shape {
  const through = cylinder(totalDepth, holeDia / 2, undefined, 32, true);
  const bore = cylinder(boreDepth, boreDia / 2, undefined, 32).translate(0, 0, totalDepth / 2 - boreDepth);
  return union(through, bore);
}

/** Rectangular tube / hollow box */
export function tube(outerX: number, outerY: number, outerZ: number, wall: number): Shape {
  const outer = box(outerX, outerY, outerZ);
  const inner = box(outerX - wall * 2, outerY - wall * 2, outerZ + 1).translate(wall, wall, -0.5);
  return outer.subtract(inner);
}

/** Pipe — hollow cylinder */
export function pipe(height: number, outerRadius: number, wall: number, segments = 32): Shape {
  const outer = cylinder(height, outerRadius, undefined, segments);
  const inner = cylinder(height + 1, outerRadius - wall, undefined, segments).translate(0, 0, -0.5);
  return outer.subtract(inner);
}

/** Hex nut via intersection of three rotated slabs with a center bore. */
export function hexNut(acrossFlats: number, height: number, holeDia: number): Shape {
  const _r = acrossFlats / 2;
  const w = acrossFlats * 1.2; // oversized box
  const slab = box(w, acrossFlats, height, true);
  const hex = slab.intersect(slab.rotate(0, 0, 60)).intersect(slab.rotate(0, 0, 120));
  const hole = cylinder(height + 1, holeDia / 2, undefined, 32, true);
  return hex.subtract(hole);
}

/** Approximate rounded box via union of axis-aligned slabs. Corner radius is applied by inset. */
export function roundedBox(x: number, y: number, z: number, radius: number): Shape {
  // Intersect 3 axis-aligned rounded slabs
  const sx = box(x - radius * 2, y, z, true);
  const sy = box(x, y - radius * 2, z, true);
  const sz = box(x, y, z - radius * 2, true);
  return union(sx, sy, sz).translate(x / 2, y / 2, z / 2);
}

/** L-shaped mounting bracket with optional through-holes in both the base and wall. */
export function bracket(width: number, height: number, depth: number, thick: number, holeDia = 0): Shape {
  const base = box(width, depth, thick);
  const wall = box(width, thick, height).translate(0, 0, thick);
  let shape = union(base, wall);

  if (holeDia > 0) {
    const baseHole = cylinder(thick + 1, holeDia / 2, undefined, 24).translate(width / 2, depth / 2, 0);
    const wallHole = cylinder(thick + 1, holeDia / 2, undefined, 24)
      .rotate(90, 0, 0)
      .translate(width / 2, 0, thick + height / 2);
    shape = shape.subtract(baseHole).subtract(wallHole);
  }

  return shape;
}

/** Grid of cylindrical holes intended as a cutter pattern (subtract from part). */
export function holePattern(rows: number, cols: number, spacingX: number, spacingY: number, holeDia: number, depth: number): Shape {
  const holes: Shape[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      holes.push(cylinder(depth, holeDia / 2, undefined, 24).translate(c * spacingX, r * spacingY, 0));
    }
  }
  return union(...holes);
}

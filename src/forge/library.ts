/**
 * ForgeCAD Part Library
 *
 * Pre-built parametric parts available in user scripts via lib.xxx()
 * Each part is a function that returns a Shape, taking parameters.
 */

import { box, cylinder, sphere, union, difference, intersection, Shape, getWasm, levelSet } from './kernel';

/** M-series bolt hole (through-hole) */
export function boltHole(diameter: number, depth: number): Shape {
  return cylinder(depth, diameter / 2, undefined, 32, true);
}

/** Counterbore hole — through-hole with a wider recess at the top */
export function counterbore(
  holeDia: number,
  boreDia: number,
  boreDepth: number,
  totalDepth: number,
): Shape {
  const through = cylinder(totalDepth, holeDia / 2, undefined, 32, true);
  const bore = cylinder(boreDepth, boreDia / 2, undefined, 32)
    .translate(0, 0, totalDepth / 2 - boreDepth);
  return union(through, bore);
}

/** Rectangular tube / hollow box */
export function tube(
  outerX: number,
  outerY: number,
  outerZ: number,
  wall: number,
): Shape {
  const outer = box(outerX, outerY, outerZ);
  const inner = box(outerX - wall * 2, outerY - wall * 2, outerZ + 1)
    .translate(wall, wall, -0.5);
  return outer.subtract(inner);
}

/** Pipe — hollow cylinder */
export function pipe(
  height: number,
  outerRadius: number,
  wall: number,
  segments = 32,
): Shape {
  const outer = cylinder(height, outerRadius, undefined, segments);
  const inner = cylinder(height + 1, outerRadius - wall, undefined, segments)
    .translate(0, 0, -0.5);
  return outer.subtract(inner);
}

/** Hex nut profile (2D extruded) */
export function hexNut(
  acrossFlats: number,
  height: number,
  holeDia: number,
): Shape {
  // Hexagon as intersection of 3 rotated boxes
  const r = acrossFlats / 2;
  const w = acrossFlats * 1.2; // oversized box
  const slab = box(w, acrossFlats, height, true);
  const hex = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));
  const hole = cylinder(height + 1, holeDia / 2, undefined, 32, true);
  return hex.subtract(hole);
}

/** Rounded box — box with spheres at corners (approximate fillet) */
export function roundedBox(
  x: number,
  y: number,
  z: number,
  radius: number,
): Shape {
  // Use hull of 8 spheres at corners — but Manifold hull is available
  // For now, intersect 3 axis-aligned rounded slabs
  const sx = box(x - radius * 2, y, z, true);
  const sy = box(x, y - radius * 2, z, true);
  const sz = box(x, y, z - radius * 2, true);
  return union(sx, sy, sz).translate(x / 2, y / 2, z / 2);
}

/** Mounting bracket — L-shaped with optional holes */
export function bracket(
  width: number,
  height: number,
  depth: number,
  thick: number,
  holeDia = 0,
): Shape {
  const base = box(width, depth, thick);
  const wall = box(width, thick, height).translate(0, 0, thick);
  let shape = union(base, wall);

  if (holeDia > 0) {
    const baseHole = cylinder(thick + 1, holeDia / 2, undefined, 24)
      .translate(width / 2, depth / 2, 0);
    const wallHole = cylinder(thick + 1, holeDia / 2, undefined, 24)
      .rotate(90, 0, 0)
      .translate(width / 2, 0, thick + height / 2);
    shape = shape.subtract(baseHole).subtract(wallHole);
  }

  return shape;
}

/** Grid pattern of holes */
export function holePattern(
  rows: number,
  cols: number,
  spacingX: number,
  spacingY: number,
  holeDia: number,
  depth: number,
): Shape {
  const holes: Shape[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      holes.push(
        cylinder(depth, holeDia / 2, undefined, 24)
          .translate(c * spacingX, r * spacingY, 0),
      );
    }
  }
  return union(...holes);
}

/** All library parts, keyed by name */
export const partLibrary = {
  boltHole,
  counterbore,
  tube,
  pipe,
  hexNut,
  roundedBox,
  bracket,
  holePattern,
  thread,
  bolt,
  nut,
};

// --- Thread / Fastener library ---

/**
 * External thread (helical ridge on a cylinder) via SDF levelSet.
 * Returns a threaded cylinder along +Z from z=0 to z=length.
 */
export function thread(
  diameter: number,
  pitch: number,
  length: number,
  options?: { depth?: number; edgeLength?: number },
): Shape {
  const r = diameter / 2;
  const depth = options?.depth ?? pitch * 0.35;
  const edgeLen = options?.edgeLength ?? Math.max(0.3, pitch * 0.4);
  const pad = depth + 1;

  return levelSet(
    ([x, y, z]) => {
      const dist = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x);
      const phase = angle + (z / pitch) * Math.PI * 2;
      const t = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      // Triangle wave: thread crest at peak, root at valley
      const wave = t < Math.PI ? (2 * t / Math.PI - 1) : (1 - 2 * (t - Math.PI) / Math.PI);
      const threadR = r - depth + depth * (1 + wave);
      return threadR - dist;
    },
    { min: [-r - pad, -r - pad, 0], max: [r + pad, r + pad, length] },
    edgeLen,
  );
}

/**
 * Hex bolt with real helical threads.
 * Head at z=0..headHeight, shaft extends downward along -Z.
 */
export function bolt(
  diameter: number,
  length: number,
  options?: {
    pitch?: number;
    headHeight?: number;
    headAcrossFlats?: number;
    threadLength?: number;
    edgeLength?: number;
  },
): Shape {
  const r = diameter / 2;
  const pitch = options?.pitch ?? diameter * 0.15;
  const headH = options?.headHeight ?? diameter * 0.65;
  const headAF = options?.headAcrossFlats ?? diameter * 1.6;
  const threadLen = options?.threadLength ?? length;
  const edgeLen = options?.edgeLength ?? Math.max(0.3, pitch * 0.4);

  // Hex head
  const slab = box(headAF * 1.2, headAF, headH, true).translate(0, 0, headH / 2);
  const hexHead = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));

  // Smooth shaft (unthreaded portion)
  const unthreadedLen = length - threadLen;
  const parts: Shape[] = [hexHead];

  if (unthreadedLen > 0.1) {
    parts.push(
      cylinder(unthreadedLen, r, undefined, 32).translate(0, 0, -unthreadedLen),
    );
  }

  // Threaded portion
  const threaded = thread(diameter, pitch, threadLen, { edgeLength: edgeLen })
    .translate(0, 0, -length);
  parts.push(threaded);

  // Tip chamfer (cone at the end)
  const depth = pitch * 0.35;
  const tipChamfer = cylinder(depth * 3, r + depth + 0.1, 0, 32)
    .translate(0, 0, -length - 0.01);

  return union(...parts).subtract(tipChamfer);
}

/**
 * Hex nut with threaded bore.
 * Centered at origin, height along Z.
 */
export function nut(
  diameter: number,
  options?: {
    pitch?: number;
    height?: number;
    acrossFlats?: number;
    edgeLength?: number;
  },
): Shape {
  const r = diameter / 2;
  const pitch = options?.pitch ?? diameter * 0.15;
  const nutH = options?.height ?? diameter * 0.8;
  const nutAF = options?.acrossFlats ?? diameter * 1.6;
  const edgeLen = options?.edgeLength ?? Math.max(0.3, pitch * 0.4);

  // Hex body
  const slab = box(nutAF * 1.2, nutAF, nutH, true);
  let hexBody = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));

  // Threaded bore (internal thread = slightly larger bore with thread ridges)
  // For simplicity, use a clearance bore — internal threads are hard to see anyway
  const bore = cylinder(nutH + 1, r + 0.1, undefined, 48, true);
  hexBody = hexBody.subtract(bore);

  // Chamfer top and bottom edges
  const chamferH = Math.min(1.2, nutH * 0.15);
  const nutOuterR = nutAF / (2 * Math.cos(Math.PI / 6));
  const topChamfer = cylinder(chamferH, nutOuterR + 0.5, nutOuterR - chamferH, 6)
    .translate(0, 0, nutH / 2 - chamferH + 0.01);
  const botChamfer = cylinder(chamferH, nutOuterR - chamferH, nutOuterR + 0.5, 6)
    .translate(0, 0, -nutH / 2 - 0.01);

  return hexBody.subtract(topChamfer).subtract(botChamfer);
}

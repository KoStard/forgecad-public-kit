/**
 * ForgeCAD 2D Sketch System
 *
 * Wraps Manifold's CrossSection to provide a chainable 2D API.
 * Sketches are 2D profiles that can be extruded/revolved into 3D Shapes.
 */

import type { CrossSection } from 'manifold-3d';
import { getWasm } from './kernel';
import { Shape } from './kernel';

/** Immutable wrapper around CrossSection with chainable API */
export class Sketch {
  constructor(public readonly cross: CrossSection) {}

  // --- Transforms ---

  translate(x: number, y = 0): Sketch {
    return new Sketch(this.cross.translate(x, y));
  }

  rotate(degrees: number): Sketch {
    return new Sketch(this.cross.rotate(degrees));
  }

  scale(v: number | [number, number]): Sketch {
    return new Sketch(this.cross.scale(v as any));
  }

  mirror(ax: [number, number]): Sketch {
    return new Sketch(this.cross.mirror(ax));
  }

  // --- Booleans ---

  add(other: Sketch): Sketch {
    return new Sketch(this.cross.add(other.cross));
  }

  subtract(other: Sketch): Sketch {
    return new Sketch(this.cross.subtract(other.cross));
  }

  intersect(other: Sketch): Sketch {
    return new Sketch(this.cross.intersect(other.cross));
  }

  // --- 2D Operations ---

  /** Offset (inflate/deflate) the contour. Positive = outward, negative = inward. */
  offset(delta: number, join: 'Square' | 'Round' | 'Miter' = 'Round'): Sketch {
    return new Sketch(this.cross.offset(delta, join));
  }

  /** Convex hull of this sketch */
  hull(): Sketch {
    return new Sketch(this.cross.hull());
  }

  /** Simplify contour — remove vertices closer than epsilon to the line between neighbors */
  simplify(epsilon = 1e-6): Sketch {
    return new Sketch(this.cross.simplify(epsilon));
  }

  /** Warp vertices with an arbitrary function */
  warp(fn: (vert: [number, number]) => void): Sketch {
    return new Sketch(this.cross.warp(fn as any));
  }

  // --- 2D → 3D ---

  /** Extrude along Z axis. Supports twist and taper. */
  extrude(height: number, opts?: {
    twist?: number;
    divisions?: number;
    scaleTop?: number | [number, number];
    center?: boolean;
  }): Shape {
    const m = this.cross.extrude(
      height,
      opts?.divisions ?? 0,
      opts?.twist ?? 0,
      opts?.scaleTop as any,
      opts?.center ?? false,
    );
    return new Shape(m);
  }

  /** Revolve around Y axis (which becomes Z in the result). */
  revolve(degrees = 360, segments?: number): Shape {
    return new Shape(this.cross.revolve(segments ?? 0, degrees));
  }

  // --- Query ---

  area(): number { return this.cross.area(); }
  bounds() { return this.cross.bounds(); }
  isEmpty(): boolean { return this.cross.isEmpty(); }
  numVert(): number { return this.cross.numVert(); }

  /** Get raw polygon contours for rendering */
  toPolygons() { return this.cross.toPolygons(); }
}

// --- 2D Primitive constructors ---

export function rect(width: number, height: number, center = false): Sketch {
  return new Sketch(getWasm().CrossSection.square([width, height], center));
}

export function circle2d(radius: number, segments?: number): Sketch {
  return new Sketch(getWasm().CrossSection.circle(radius, segments ?? 0));
}

/** Rounded rectangle — a rect with offset-based corner rounding */
export function roundedRect(width: number, height: number, radius: number, center = false): Sketch {
  const r = Math.min(radius, width / 2, height / 2);
  // Shrink rect by radius, then offset outward with round join
  const inner = getWasm().CrossSection.square([width - 2 * r, height - 2 * r], true)
    .translate(center ? 0 : width / 2, center ? 0 : height / 2);
  return new Sketch(inner.offset(r, 'Round'));
}

/** Polygon from array of [x,y] points */
export function polygon(points: [number, number][]): Sketch {
  return new Sketch(new (getWasm().CrossSection)([points]));
}

/** Regular polygon (equilateral triangle, hexagon, etc.) */
export function ngon(sides: number, radius: number): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides - Math.PI / 2;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return polygon(pts);
}

/** Ellipse approximated with segments */
export function ellipse(rx: number, ry: number, segments = 64): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  return polygon(pts);
}

/** Slot shape — rectangle with semicircle ends (like an oblong hole) */
export function slot(length: number, width: number): Sketch {
  const r = width / 2;
  const body = rect(length - width, width, true);
  const capL = circle2d(r).translate(-(length - width) / 2, 0);
  const capR = circle2d(r).translate((length - width) / 2, 0);
  return body.add(capL).add(capR);
}

/** Text-like: star shape with n points */
export function star(points: number, outerR: number, innerR: number): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polygon(pts);
}

/** 2D boolean union of multiple sketches */
export function union2d(...sketches: Sketch[]): Sketch {
  if (sketches.length === 0) throw new Error('union2d requires at least one sketch');
  if (sketches.length === 1) return sketches[0];
  return new Sketch(getWasm().CrossSection.union(sketches.map(s => s.cross)));
}

/** 2D boolean difference */
export function difference2d(...sketches: Sketch[]): Sketch {
  if (sketches.length < 2) throw new Error('difference2d requires at least two sketches');
  return new Sketch(getWasm().CrossSection.difference(sketches.map(s => s.cross)));
}

/** 2D boolean intersection */
export function intersection2d(...sketches: Sketch[]): Sketch {
  if (sketches.length < 2) throw new Error('intersection2d requires at least two sketches');
  return new Sketch(getWasm().CrossSection.intersection(sketches.map(s => s.cross)));
}

/** Convex hull of multiple sketches */
export function hull2d(...sketches: Sketch[]): Sketch {
  return new Sketch(getWasm().CrossSection.hull(sketches.map(s => s.cross)));
}

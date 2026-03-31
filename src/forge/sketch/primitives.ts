import { buildSketchFromCompileProfilePlan, Sketch } from './core';
import type { Point2D } from './entities';

function normalizePolygonPoints(points: ([number, number] | Point2D)[]): [number, number][] {
  const pts: [number, number][] = points.map((p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x, p.y]));

  // Manifold expects CCW loops, so flip CW input before building the cross-section.
  let signedArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    signedArea += (x2 - x1) * (y2 + y1);
  }
  if (signedArea > 0) pts.reverse();

  return pts.map(([x, y]) => [x, y]);
}

/** Create a 2D rectangle. When center is true, the origin is at the rectangle center; otherwise at the bottom-left corner. */
export function rect(width: number, height: number, center = false): Sketch {
  return buildSketchFromCompileProfilePlan({ kind: 'rect', width, height, center, transforms: [] });
}

/** Create a 2D circle centered at the origin. Use segments for lower-poly approximations. */
export function circle2d(radius: number, segments?: number): Sketch {
  return buildSketchFromCompileProfilePlan({
    kind: 'circle',
    radius,
    segments: segments != null && segments > 0 ? segments : undefined,
    transforms: [],
  });
}

/** Create a 2D rectangle with rounded corners. The radius is clamped to fit within the dimensions. */
export function roundedRect(width: number, height: number, radius: number, center = false): Sketch {
  const r = Math.min(radius, width / 2, height / 2);
  return buildSketchFromCompileProfilePlan({
    kind: 'roundedRect',
    width,
    height,
    radius: r,
    center,
    transforms: [],
  });
}

/** Create a 2D polygon from an array of [x, y] points or Point2D objects. Winding is normalized to CCW. */
export function polygon(points: ([number, number] | Point2D)[]): Sketch {
  const pts = normalizePolygonPoints(points);
  return buildSketchFromCompileProfilePlan({ kind: 'polygon', points: pts, transforms: [] });
}

/** Create a regular polygon (equilateral triangle, hexagon, etc.) inscribed in a circle of the given radius. */
export function ngon(sides: number, radius: number): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides - Math.PI / 2;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return polygon(pts);
}

/** Create a 2D ellipse centered at the origin with the given X and Y radii. */
export function ellipse(rx: number, ry: number, segments = 64): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  return polygon(pts);
}

/** Create a slot (stadium/discorectangle) — a rectangle with semicircular ends, centered at origin. */
export function slot(length: number, width: number): Sketch {
  const r = width / 2;
  const body = rect(length - width, width, true);
  const capL = circle2d(r).translate(-(length - width) / 2, 0);
  const capR = circle2d(r).translate((length - width) / 2, 0);
  return body.add(capL).add(capR);
}

/**
 * Create an arc-shaped slot (banana/annular sector) centered at the origin.
 * The slot is symmetric about the +X axis.
 *
 * @param pitchRadius — distance from center to the middle of the slot
 * @param sweepDeg — angular extent in degrees
 * @param thickness — width of the slot (radial direction)
 *
 * ```js
 * arcSlot(135, 74, 40)  // pitch R135, 74° sweep, 40mm wide
 * ```
 */
export function arcSlot(pitchRadius: number, sweepDeg: number, thickness: number): Sketch {
  const { path } = require('./path') as { path: () => import('./path').PathBuilder };
  const halfT = thickness / 2;
  const rOuter = pitchRadius + halfT;
  const rInner = pitchRadius - halfT;
  const halfSweep = (sweepDeg / 2) * (Math.PI / 180);
  const capR = halfT; // semicircular end cap radius

  // Four key points: outer start/end, inner start/end
  // "Start" = +halfSweep angle, "End" = -halfSweep angle
  const cosH = Math.cos(halfSweep);
  const sinH = Math.sin(halfSweep);

  // End cap centers sit at pitchRadius on the ±halfSweep rays
  const capStartCx = pitchRadius * cosH;
  const capStartCy = pitchRadius * sinH;
  const capEndCx = pitchRadius * cosH;
  const capEndCy = -pitchRadius * sinH;

  return path()
    .moveTo(rOuter * cosH, rOuter * sinH)           // outer arc start (+halfSweep)
    .arcAround(0, 0, -sweepDeg)                      // outer arc CW to -halfSweep
    .arcAround(capEndCx, capEndCy, -180)              // end cap: semicircle inward
    .arcAround(0, 0, sweepDeg)                        // inner arc CCW back to +halfSweep
    .arcAround(capStartCx, capStartCy, -180)          // start cap: semicircle to close
    .close();
}

/** Create a star shape with alternating outer and inner radii. */
export function star(points: number, outerR: number, innerR: number): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polygon(pts);
}

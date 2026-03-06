import { Sketch, setSketchBrepProfilePlan } from './core';
import { getWasm } from '../kernel';
import type { Point2D } from './entities';

export function rect(width: number, height: number, center = false): Sketch {
  return setSketchBrepProfilePlan(
    new Sketch(getWasm().CrossSection.square([width, height], center)),
    { kind: 'rect', width, height, center, transforms: [] },
  );
}

export function circle2d(radius: number, segments?: number): Sketch {
  return setSketchBrepProfilePlan(
    new Sketch(getWasm().CrossSection.circle(radius, segments ?? 0)),
    { kind: 'circle', radius, transforms: [] },
  );
}

export function roundedRect(width: number, height: number, radius: number, center = false): Sketch {
  const r = Math.min(radius, width / 2, height / 2);
  const inner = getWasm().CrossSection.square([width - 2 * r, height - 2 * r], true)
    .translate(center ? 0 : width / 2, center ? 0 : height / 2);
  return new Sketch(inner.offset(r, 'Round'));
}

export function polygon(points: ([number, number] | Point2D)[]): Sketch {
  // Normalize: accept Point2D or [x, y] tuples
  const raw: [number, number][] = points.map(p =>
    Array.isArray(p) ? p : [p.x, p.y] as [number, number]
  );
  // Auto-fix winding: Manifold needs CCW, so reverse if CW (positive signed area)
  const pts = [...raw];
  let signedArea = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    signedArea += (x2 - x1) * (y2 + y1);
  }
  if (signedArea > 0) pts.reverse();
  return new Sketch(new (getWasm().CrossSection)([pts]));
}

export function ngon(sides: number, radius: number): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < sides; i++) {
    const a = (2 * Math.PI * i) / sides - Math.PI / 2;
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return polygon(pts);
}

export function ellipse(rx: number, ry: number, segments = 64): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (2 * Math.PI * i) / segments;
    pts.push([rx * Math.cos(a), ry * Math.sin(a)]);
  }
  return polygon(pts);
}

export function slot(length: number, width: number): Sketch {
  const r = width / 2;
  const body = rect(length - width, width, true);
  const capL = circle2d(r).translate(-(length - width) / 2, 0);
  const capR = circle2d(r).translate((length - width) / 2, 0);
  return body.add(capL).add(capR);
}

export function star(points: number, outerR: number, innerR: number): Sketch {
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI * i) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return polygon(pts);
}

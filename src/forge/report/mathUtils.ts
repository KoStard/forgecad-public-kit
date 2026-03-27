/**
 * Vec3/Vec2 math helpers for the report module.
 */

import type { Vec2 } from '../export/pdfUtils';
import type { Vec3, Bounds2, Bounds3, LabelBox, Segment2 } from './_internal';

export function norm(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function sub3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function _add3(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function mul3(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function distance3(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function bboxCenter(b: Bounds3): Vec3 {
  return [(b.min[0] + b.max[0]) * 0.5, (b.min[1] + b.max[1]) * 0.5, (b.min[2] + b.max[2]) * 0.5];
}

export function mergeBounds3(bounds: Bounds3[]): Bounds3 | null {
  if (bounds.length === 0) return null;
  const out: Bounds3 = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  bounds.forEach((b) => {
    out.min[0] = Math.min(out.min[0], b.min[0]);
    out.min[1] = Math.min(out.min[1], b.min[1]);
    out.min[2] = Math.min(out.min[2], b.min[2]);
    out.max[0] = Math.max(out.max[0], b.max[0]);
    out.max[1] = Math.max(out.max[1], b.max[1]);
    out.max[2] = Math.max(out.max[2], b.max[2]);
  });
  return out;
}

export function bboxCorners(bounds: Bounds3): Vec3[] {
  const [x0, y0, z0] = bounds.min;
  const [x1, y1, z1] = bounds.max;
  return [
    [x0, y0, z0],
    [x1, y0, z0],
    [x0, y1, z0],
    [x1, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x0, y1, z1],
    [x1, y1, z1],
  ];
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function scaleBounds2(bounds: Bounds2, factor: number): Bounds2 {
  if (!Number.isFinite(factor) || factor <= 1) return bounds;
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const hx = (bounds.maxX - bounds.minX) * 0.5 * factor;
  const hy = (bounds.maxY - bounds.minY) * 0.5 * factor;
  return {
    minX: cx - hx,
    minY: cy - hy,
    maxX: cx + hx,
    maxY: cy + hy,
  };
}

export function expandBounds2(bounds: Bounds2, pad: number): Bounds2 {
  if (!Number.isFinite(pad) || pad <= 0) return bounds;
  return {
    minX: bounds.minX - pad,
    minY: bounds.minY - pad,
    maxX: bounds.maxX + pad,
    maxY: bounds.maxY + pad,
  };
}

export function boundsCenter2(b: Bounds2): Vec2 {
  return [(b.minX + b.maxX) * 0.5, (b.minY + b.maxY) * 0.5];
}

export function makeLabelBox(center: Vec2, textHalfW: number, textHalfH: number): LabelBox {
  return {
    minX: center[0] - textHalfW,
    minY: center[1] - textHalfH,
    maxX: center[0] + textHalfW,
    maxY: center[1] + textHalfH,
  };
}

export function overlapArea(a: LabelBox, b: LabelBox): number {
  const x = Math.max(0, Math.min(a.maxX, b.maxX) - Math.max(a.minX, b.minX));
  const y = Math.max(0, Math.min(a.maxY, b.maxY) - Math.max(a.minY, b.minY));
  return x * y;
}

export function _boxDistance(a: LabelBox, b: LabelBox): number {
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return Math.hypot(dx, dy);
}

export function expandBox(box: LabelBox, pad: number): LabelBox {
  return {
    minX: box.minX - pad,
    minY: box.minY - pad,
    maxX: box.maxX + pad,
    maxY: box.maxY + pad,
  };
}

export function clampLabelCenter(center: Vec2, textHalfW: number, textHalfH: number, cell: { x: number; y: number; w: number; h: number }): Vec2 {
  const inset = 4;
  const minX = cell.x + inset + textHalfW;
  const maxX = cell.x + cell.w - inset - textHalfW;
  const minY = cell.y + inset + textHalfH;
  const maxY = cell.y + cell.h - inset - textHalfH;
  if (minX > maxX || minY > maxY) return [cell.x + cell.w * 0.5, cell.y + cell.h * 0.5];
  return [clamp(center[0], minX, maxX), clamp(center[1], minY, maxY)];
}

export function closestPointOnBox(box: LabelBox, point: Vec2): Vec2 {
  return [clamp(point[0], box.minX, box.maxX), clamp(point[1], box.minY, box.maxY)];
}

export function pointInBox(point: Vec2, box: LabelBox): boolean {
  return point[0] >= box.minX && point[0] <= box.maxX && point[1] >= box.minY && point[1] <= box.maxY;
}

export function orientation2(a: Vec2, b: Vec2, c: Vec2): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

export function onSegment2(a: Vec2, b: Vec2, p: Vec2): boolean {
  return (
    p[0] >= Math.min(a[0], b[0]) - 1e-6 &&
    p[0] <= Math.max(a[0], b[0]) + 1e-6 &&
    p[1] >= Math.min(a[1], b[1]) - 1e-6 &&
    p[1] <= Math.max(a[1], b[1]) + 1e-6
  );
}

export function segmentsIntersect2(a1: Vec2, a2: Vec2, b1: Vec2, b2: Vec2): boolean {
  const o1 = orientation2(a1, a2, b1);
  const o2 = orientation2(a1, a2, b2);
  const o3 = orientation2(b1, b2, a1);
  const o4 = orientation2(b1, b2, a2);

  if (o1 > 0 !== o2 > 0 && o3 > 0 !== o4 > 0) return true;
  if (Math.abs(o1) <= 1e-6 && onSegment2(a1, a2, b1)) return true;
  if (Math.abs(o2) <= 1e-6 && onSegment2(a1, a2, b2)) return true;
  if (Math.abs(o3) <= 1e-6 && onSegment2(b1, b2, a1)) return true;
  if (Math.abs(o4) <= 1e-6 && onSegment2(b1, b2, a2)) return true;
  return false;
}

export function pointToSegmentDistance(point: Vec2, seg: Segment2): number {
  const vx = seg.b[0] - seg.a[0];
  const vy = seg.b[1] - seg.a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 < 1e-8) return Math.hypot(point[0] - seg.a[0], point[1] - seg.a[1]);
  const t = clamp(((point[0] - seg.a[0]) * vx + (point[1] - seg.a[1]) * vy) / len2, 0, 1);
  const px = seg.a[0] + vx * t;
  const py = seg.a[1] + vy * t;
  return Math.hypot(point[0] - px, point[1] - py);
}

export function pointToBoxDistance(point: Vec2, box: LabelBox): number {
  const dx = Math.max(box.minX - point[0], 0, point[0] - box.maxX);
  const dy = Math.max(box.minY - point[1], 0, point[1] - box.maxY);
  return Math.hypot(dx, dy);
}

export function segmentIntersectsBox(seg: Segment2, box: LabelBox): boolean {
  if (pointInBox(seg.a, box) || pointInBox(seg.b, box)) return true;
  const edges: Segment2[] = [
    { a: [box.minX, box.minY], b: [box.maxX, box.minY] },
    { a: [box.maxX, box.minY], b: [box.maxX, box.maxY] },
    { a: [box.maxX, box.maxY], b: [box.minX, box.maxY] },
    { a: [box.minX, box.maxY], b: [box.minX, box.minY] },
  ];
  return edges.some((edge) => segmentsIntersect2(seg.a, seg.b, edge.a, edge.b));
}

export function segmentToBoxDistance(seg: Segment2, box: LabelBox): number {
  if (segmentIntersectsBox(seg, box)) return 0;
  const corners: Vec2[] = [
    [box.minX, box.minY],
    [box.maxX, box.minY],
    [box.maxX, box.maxY],
    [box.minX, box.maxY],
  ];
  let best = Infinity;
  best = Math.min(best, pointToBoxDistance(seg.a, box));
  best = Math.min(best, pointToBoxDistance(seg.b, box));
  corners.forEach((corner) => {
    best = Math.min(best, pointToSegmentDistance(corner, seg));
  });
  return best;
}

export function sampleSegments(segments: Segment2[], maxCount: number): Segment2[] {
  if (!Number.isFinite(maxCount) || maxCount <= 0 || segments.length <= maxCount) return segments;
  const out: Segment2[] = [];
  const step = segments.length / maxCount;
  for (let i = 0; i < maxCount; i += 1) {
    out.push(segments[Math.floor(i * step)]);
  }
  return out;
}

export function pointInBounds2(p: Vec2, b: Bounds2): boolean {
  return p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY;
}

export function segmentIntersectsBounds2(a: Vec2, b: Vec2, bounds: Bounds2): boolean {
  if (pointInBounds2(a, bounds) || pointInBounds2(b, bounds)) return true;
  const corners: Vec2[] = [
    [bounds.minX, bounds.minY],
    [bounds.maxX, bounds.minY],
    [bounds.maxX, bounds.maxY],
    [bounds.minX, bounds.maxY],
  ];
  const edges: Segment2[] = [
    { a: corners[0], b: corners[1] },
    { a: corners[1], b: corners[2] },
    { a: corners[2], b: corners[3] },
    { a: corners[3], b: corners[0] },
  ];
  return edges.some((edge) => segmentsIntersect2(a, b, edge.a, edge.b));
}

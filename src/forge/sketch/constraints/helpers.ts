/**
 * TS-only geometry helpers for constraint metadata and UI.
 *
 * No solving lives here; Rust owns constraint math.
 */
import type { LineId, PointId, SketchLine, SketchPoint, SketchShape } from './types';

export const toRad = (deg: number): number => (deg * Math.PI) / 180;

export const distance = (a: SketchPoint, b: SketchPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const midpoint = (a: SketchPoint, b: SketchPoint): [number, number] => [(a.x + b.x) / 2, (a.y + b.y) / 2];

/** Midpoint of a→b offset by `dist` units in the CCW-perpendicular direction. */
export const midpointPerp = (a: SketchPoint, b: SketchPoint, dist: number): [number, number] => {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  if (len < 1e-9) return [mx + dist, my];
  return [mx - ((b.y - a.y) / len) * dist, my + ((b.x - a.x) / len) * dist];
};

export const lineDirection = (a: SketchPoint, b: SketchPoint): [number, number] => {
  const len = distance(a, b) || 1;
  return [(b.x - a.x) / len, (b.y - a.y) / len];
};

export const angleOfLine = (a: SketchPoint, b: SketchPoint): number => Math.atan2(b.y - a.y, b.x - a.x);

export const normalizeAngle = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export const projectPointToLine = (pt: SketchPoint, a: SketchPoint, b: SketchPoint): [number, number] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [a.x, a.y];
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
  return [a.x + t * dx, a.y + t * dy];
};

// ─── Shape helpers ────────────────────────────────────────────────────────────

/** Return all unique points that make up a shape's lines. */
export const shapeVertices = (shape: SketchShape, lines: Map<LineId, SketchLine>, points: Map<PointId, SketchPoint>): SketchPoint[] => {
  const seen = new Set<PointId>();
  const result: SketchPoint[] = [];
  for (const lineId of shape.lines) {
    const line = lines.get(lineId);
    if (!line) continue;
    for (const ptId of [line.a, line.b]) {
      if (!seen.has(ptId)) {
        seen.add(ptId);
        const pt = points.get(ptId);
        if (pt) result.push(pt);
      }
    }
  }
  return result;
};

/** Arithmetic centroid of a set of points. */
export const shapeCentroid = (pts: SketchPoint[]): [number, number] => {
  if (pts.length === 0) return [0, 0];
  let sx = 0;
  let sy = 0;
  for (const p of pts) {
    sx += p.x;
    sy += p.y;
  }
  return [sx / pts.length, sy / pts.length];
};

export interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
  cx: number;
  cy: number;
}

/** Axis-aligned bounding box of a set of points. */
export const shapeBoundingBox = (pts: SketchPoint[]): BoundingBox => {
  if (pts.length === 0) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };
  let minX = pts[0].x;
  let maxX = pts[0].x;
  let minY = pts[0].y;
  let maxY = pts[0].y;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
};

/**
 * Traverse the chain of lines to get an ordered vertex list.
 * Assumes lines form a proper closed polygon (each pair of adjacent lines shares exactly one endpoint).
 * Returns null if the lines don't form a valid closed chain.
 */
export const traverseShapeVertices = (
  shape: SketchShape,
  lines: Map<LineId, SketchLine>,
  points: Map<PointId, SketchPoint>,
): SketchPoint[] | null => {
  if (shape.lines.length === 0) return null;
  // Build adjacency: pointId -> list of [otherPointId]
  const adj = new Map<PointId, PointId[]>();
  for (const lineId of shape.lines) {
    const l = lines.get(lineId);
    if (!l) return null;
    if (!adj.has(l.a)) adj.set(l.a, []);
    if (!adj.has(l.b)) adj.set(l.b, []);
    adj.get(l.a)!.push(l.b);
    adj.get(l.b)!.push(l.a);
  }
  const firstLine = lines.get(shape.lines[0]);
  if (!firstLine) return null;
  const result: SketchPoint[] = [];
  let current = firstLine.a;
  let prev: PointId | null = null;
  for (let i = 0; i < shape.lines.length; i += 1) {
    const pt = points.get(current);
    if (!pt) return null;
    result.push(pt);
    const neighbors = adj.get(current) ?? [];
    const next = neighbors.find((n) => n !== prev);
    if (next === undefined) break;
    prev = current;
    current = next;
  }
  return result.length === shape.lines.length ? result : null;
};

/** Signed polygon area via the shoelace formula. Positive = counter-clockwise. */
export const polygonSignedArea = (pts: SketchPoint[]): number => {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return area / 2;
};

// ─── Arc helpers ──────────────────────────────────────────────────────────────

/**
 * Sweep angle (in radians) from `startAngle` to `endAngle` along the given
 * direction.  Always returns a value in (0, 2π] — a zero-length arc is treated
 * as a full circle so constraints don't degenerate.
 */
export const arcSweep = (startAngle: number, endAngle: number, clockwise: boolean): number => {
  const sweep = clockwise ? (startAngle - endAngle + 2 * Math.PI) % (2 * Math.PI) : (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
  return sweep < 1e-9 ? 2 * Math.PI : sweep;
};

export const reflectPointAcrossLine = (pt: SketchPoint, a: SketchPoint, b: SketchPoint): [number, number] => {
  const proj = projectPointToLine(pt, a, b);
  return [2 * proj[0] - pt.x, 2 * proj[1] - pt.y];
};

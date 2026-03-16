import type { SketchPoint } from './types';

export const toRad = (deg: number): number => (deg * Math.PI) / 180;

export const distance = (a: SketchPoint, b: SketchPoint): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
};

export const midpoint = (a: SketchPoint, b: SketchPoint): [number, number] => [
  (a.x + b.x) / 2,
  (a.y + b.y) / 2,
];

export const lineDirection = (a: SketchPoint, b: SketchPoint): [number, number] => {
  const len = distance(a, b) || 1;
  return [(b.x - a.x) / len, (b.y - a.y) / len];
};

export const angleOfLine = (a: SketchPoint, b: SketchPoint): number =>
  Math.atan2(b.y - a.y, b.x - a.x);

export const normalizeAngle = (angle: number): number => {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};

export const projectPointToLine = (
  pt: SketchPoint,
  a: SketchPoint,
  b: SketchPoint,
): [number, number] => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return [a.x, a.y];
  const t = ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / len2;
  return [a.x + t * dx, a.y + t * dy];
};

export const reflectPointAcrossLine = (
  pt: SketchPoint,
  a: SketchPoint,
  b: SketchPoint,
): [number, number] => {
  const proj = projectPointToLine(pt, a, b);
  return [2 * proj[0] - pt.x, 2 * proj[1] - pt.y];
};

import type { SketchConstraintMeta } from '@forge/sketch/constraints/types';
import { distToSegment2D, pointInPolygon } from './geometryUtils';

export type SketchHoveredEntity =
  | { kind: 'line'; id: string; a: [number, number]; b: [number, number] }
  | { kind: 'circle'; id: string; center: [number, number]; radius: number }
  | {
      kind: 'arc';
      id: string;
      center: [number, number];
      start: [number, number];
      end: [number, number];
      radius: number;
      clockwise: boolean;
    }
  | { kind: 'point'; id: string; position: [number, number] };

export interface SketchEntityInfoPanel {
  entity: SketchHoveredEntity;
  x: number;
  y: number;
}

export function findHoveredSurface(x: number, y: number, meta: SketchConstraintMeta): number | null {
  // Check surfaces from smallest to largest so inner regions take priority
  for (let i = meta.surfaces.length - 1; i >= 0; i--) {
    const s = meta.surfaces[i];
    // Quick bounding box check
    if (x < s.bounds.min[0] || x > s.bounds.max[0] || y < s.bounds.min[1] || y > s.bounds.max[1]) continue;
    if (pointInPolygon(x, y, s.polygon)) return s.index;
  }
  return null;
}

export function findNearestSketchEntity(x: number, y: number, meta: SketchConstraintMeta, threshold: number): SketchHoveredEntity | null {
  let bestDist = threshold;
  let best: SketchHoveredEntity | null = null;
  for (const line of meta.edges.lines) {
    const d = distToSegment2D(x, y, line.a[0], line.a[1], line.b[0], line.b[1]);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'line', id: line.id, a: line.a, b: line.b };
    }
  }
  for (const circle of meta.edges.circles) {
    const d = Math.abs(Math.hypot(x - circle.center[0], y - circle.center[1]) - circle.radius);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'circle', id: circle.id, center: circle.center, radius: circle.radius };
    }
  }
  for (const arc of meta.edges.arcs) {
    const d = Math.abs(Math.hypot(x - arc.center[0], y - arc.center[1]) - arc.radius);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'arc', id: arc.id, center: arc.center, start: arc.start, end: arc.end, radius: arc.radius, clockwise: arc.clockwise };
    }
  }
  for (const pt of meta.edges.points) {
    const d = Math.hypot(x - pt.pos[0], y - pt.pos[1]);
    if (d < bestDist) {
      bestDist = d;
      best = { kind: 'point', id: pt.id, position: [pt.pos[0], pt.pos[1]] };
    }
  }
  return best;
}

import { Sketch } from '../core';
import { polygon } from '../primitives';
import { union2d } from '../booleans';
import { getWasm } from '../../kernel';
import type {
  ConstraintDefinition,
  SketchConstraintMeta,
  SolverContext,
  SketchPoint,
  SolveOptions,
} from './types';
import {
  DEFAULT_TOLERANCE,
  buildConstraintDisplays,
  computeStatus,
  findRedundantConstraints,
  getConstraintDef,
  setConstraintValue,
} from './registry';
import { decomposeAndSolve } from './decompose';
import { computeFacesFromSegments, pointInPolygon } from '../arrangement-core';
import type { SurfaceDisplay } from './types';

// ─── Arc tessellation ──────────────────────────────────────────────────────────

/**
 * Tessellate an arc into a polyline.
 * Returns `segments` points from (exclusive) startAngle toward endAngle.
 * The start point itself is NOT included; the caller must prepend it.
 */
const tessellateArc = (
  cx: number, cy: number, radius: number,
  startAngle: number, endAngle: number,
  clockwise: boolean, segments: number,
): [number, number][] => {
  let sweep = clockwise
    ? (startAngle - endAngle + 2 * Math.PI) % (2 * Math.PI)
    : (endAngle - startAngle + 2 * Math.PI) % (2 * Math.PI);
  if (sweep < 1e-9) sweep = 2 * Math.PI; // full circle fallback
  const dir = clockwise ? -1 : 1;
  const pts: [number, number][] = [];
  for (let k = 1; k <= segments; k++) {
    const t = (k / segments) * sweep;
    const a = startAngle + dir * t;
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return pts;
};

// ─── Geometry builders ─────────────────────────────────────────────────────────

export const cloneDefinition = (def: ConstraintDefinition): ConstraintDefinition => ({
  points: def.points.map((p) => ({ ...p })),
  lines: def.lines.map((l) => ({ ...l })),
  circles: def.circles.map((c) => ({ ...c })),
  arcs: (def.arcs ?? []).map((a) => ({ ...a })),
  shapes: (def.shapes ?? []).map((s) => ({ ...s, lines: [...s.lines] })),
  loops: def.loops.map((loop) => {
    if (loop.type === 'poly') return { type: 'poly', points: [...loop.points] };
    if (loop.type === 'circle') return { type: 'circle', circle: loop.circle };
    return { type: 'profile', segments: loop.segments.map((s) => ({ ...s })) };
  }),
  constraints: def.constraints.map((c) => ({ ...c } as typeof c)),
  rejectedConstraints: def.rejectedConstraints.map((c) => ({ ...c } as typeof c)),
  rejectionReasons: def.rejectionReasons ? new Map(def.rejectionReasons) : undefined,
});

export const buildSketchFromDefinition = (def: ConstraintDefinition): Sketch => {
  const loops: Sketch[] = [];
  const ptMap = new Map(def.points.map((p) => [p.id, p] as const));
  const lineMap = new Map(def.lines.map((l) => [l.id, l] as const));
  const arcMap = new Map((def.arcs ?? []).map((a) => [a.id, a] as const));
  const ARC_SEGMENTS = 32;

  def.loops.forEach((loop) => {
    if (loop.type === 'poly') {
      const pts: [number, number][] = loop.points.map((id) => {
        const pt = ptMap.get(id);
        if (!pt) throw new Error(`Missing point ${id}`);
        return [pt.x, pt.y];
      });
      if (pts.length >= 3) loops.push(polygon(pts));
    } else if (loop.type === 'circle') {
      const circleDef = def.circles.find((c) => c.id === loop.circle);
      if (!circleDef) throw new Error(`Missing circle ${loop.circle}`);
      const center = ptMap.get(circleDef.center);
      if (!center) throw new Error(`Missing center ${circleDef.center}`);
      const circle = new Sketch(getWasm().CrossSection.circle(circleDef.radius, circleDef.segments));
      loops.push(circle.translate(center.x, center.y));
    } else if (loop.type === 'profile') {
      // Build a polyline by concatenating line endpoints and arc tessellations.
      const pts: [number, number][] = [];
      for (const seg of loop.segments) {
        if (seg.kind === 'line') {
          const l = lineMap.get(seg.line);
          if (!l) continue;
          // On the very first segment, also push the start point.
          if (pts.length === 0) {
            const a = ptMap.get(l.a);
            if (a) pts.push([a.x, a.y]);
          }
          const b = ptMap.get(l.b);
          if (b) pts.push([b.x, b.y]);
        } else if (seg.kind === 'arc') {
          const arc = arcMap.get(seg.arc);
          if (!arc) continue;
          const center = ptMap.get(arc.center);
          const start = ptMap.get(arc.start);
          const end = ptMap.get(arc.end);
          if (!center || !start || !end) continue;
          if (pts.length === 0) pts.push([start.x, start.y]);
          const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
          const endAngle = Math.atan2(end.y - center.y, end.x - center.x);
          const arcPts = tessellateArc(center.x, center.y, arc.radius, startAngle, endAngle, arc.clockwise, ARC_SEGMENTS);
          pts.push(...arcPts);
        }
      }
      if (pts.length >= 3) loops.push(polygon(pts));
    }
  });

  if (loops.length === 0) {
    const unit = getWasm().CrossSection.square([1, 1], false);
    return new Sketch(getWasm().CrossSection.difference([unit, unit]));
  }

  return union2d(...loops);
};

export const buildConstructionGeometry = (
  def: ConstraintDefinition,
): SketchConstraintMeta['construction'] => {
  const pointMap = new Map(def.points.map((p) => [p.id, p] as const));
  const lines = def.lines
    .filter((line) => line.construction)
    .map((line) => {
      const a = pointMap.get(line.a);
      const b = pointMap.get(line.b);
      if (!a || !b) return null;
      return { id: line.id, a: [a.x, a.y] as [number, number], b: [b.x, b.y] as [number, number] };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);

  const circles = def.circles
    .filter((circle) => circle.construction)
    .map((circle) => {
      const center = pointMap.get(circle.center);
      if (!center) return null;
      return { id: circle.id, center: [center.x, center.y] as [number, number], radius: circle.radius };
    })
    .filter((circle): circle is NonNullable<typeof circle> => circle !== null);

  const arcs = (def.arcs ?? [])
    .filter((arc) => arc.construction)
    .map((arc) => {
      const center = pointMap.get(arc.center);
      const start = pointMap.get(arc.start);
      const end = pointMap.get(arc.end);
      if (!center || !start || !end) return null;
      return {
        id: arc.id,
        center: [center.x, center.y] as [number, number],
        start: [start.x, start.y] as [number, number],
        end: [end.x, end.y] as [number, number],
        radius: arc.radius,
        clockwise: arc.clockwise,
      };
    })
    .filter((arc): arc is NonNullable<typeof arc> => arc !== null);

  return { lines, circles, arcs };
};

export const buildEdgeGeometry = (def: ConstraintDefinition): SketchConstraintMeta['edges'] => {
  const pointMap = new Map(def.points.map((p) => [p.id, p] as const));
  const lines = def.lines
    .filter((line) => !line.construction)
    .map((line) => {
      const a = pointMap.get(line.a);
      const b = pointMap.get(line.b);
      if (!a || !b) return null;
      return { id: line.id, a: [a.x, a.y] as [number, number], b: [b.x, b.y] as [number, number] };
    })
    .filter((line): line is NonNullable<typeof line> => line !== null);

  const circles = def.circles
    .filter((circle) => !circle.construction)
    .map((circle) => {
      const center = pointMap.get(circle.center);
      if (!center) return null;
      return { id: circle.id, center: [center.x, center.y] as [number, number], radius: circle.radius };
    })
    .filter((circle): circle is NonNullable<typeof circle> => circle !== null);

  const arcs = (def.arcs ?? [])
    .filter((arc) => !arc.construction)
    .map((arc) => {
      const center = pointMap.get(arc.center);
      const start = pointMap.get(arc.start);
      const end = pointMap.get(arc.end);
      if (!center || !start || !end) return null;
      return {
        id: arc.id,
        center: [center.x, center.y] as [number, number],
        start: [start.x, start.y] as [number, number],
        end: [end.x, end.y] as [number, number],
        radius: arc.radius,
        clockwise: arc.clockwise,
      };
    })
    .filter((arc): arc is NonNullable<typeof arc> => arc !== null);

  const points = def.points.map((p) => ({ id: p.id, pos: [p.x, p.y] as [number, number] }));

  return { lines, circles, arcs, points };
};

// ─── Surface detection ──────────────────────────────────────────────────────

const buildSurfaceDisplays = (def: ConstraintDefinition): SurfaceDisplay[] => {
  const pointMap = new Map(def.points.map((p) => [p.id, p] as const));
  const segs: { a: [number, number]; b: [number, number] }[] = [];
  for (const l of def.lines) {
    if (l.construction) continue;
    const a = pointMap.get(l.a);
    const b = pointMap.get(l.b);
    if (a && b) segs.push({ a: [a.x, a.y], b: [b.x, b.y] });
  }
  const faces = computeFacesFromSegments(segs);

  // First pass: compute geometry for each face
  const rawSurfaces = faces
    .map((pts) => {
      let area = 0;
      let cx = 0;
      let cy = 0;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (let j = 0; j < pts.length; j++) {
        const [x1, y1] = pts[j];
        const [x2, y2] = pts[(j + 1) % pts.length];
        const cross = x1 * y2 - x2 * y1;
        area += cross;
        cx += (x1 + x2) * cross;
        cy += (y1 + y2) * cross;
        if (x1 < minX) minX = x1;
        if (y1 < minY) minY = y1;
        if (x1 > maxX) maxX = x1;
        if (y1 > maxY) maxY = y1;
      }
      area *= 0.5;
      if (Math.abs(area) < 1e-9) return null;
      cx /= (6 * area);
      cy /= (6 * area);
      return {
        area: Math.abs(area),
        centroid: [cx, cy] as [number, number],
        bounds: { min: [minX, minY] as [number, number], max: [maxX, maxY] as [number, number] },
        polygon: pts as [number, number][],
      };
    })
    .filter((s): s is NonNullable<typeof s> => s !== null)
    .filter((s) => s.area >= 0.1);  // Skip degenerate near-zero-area faces

  // Sort by area descending
  rawSurfaces.sort((a, b) => b.area - a.area);

  // Second pass: compute unique seed points.
  // A seed must be inside its own polygon but NOT inside any smaller polygon.
  // This handles frame/ring regions where the centroid falls inside a nested region.
  return rawSurfaces.map((s, i) => {
    const otherPolygons = rawSurfaces.filter((_, j) => j !== i).map((o) => o.polygon);
    const isUniqueInside = (p: [number, number]) =>
      pointInPolygon(p, s.polygon) && !otherPolygons.some((op) => pointInPolygon(p, op));

    // Try centroid first
    let seed: [number, number] = s.centroid;
    if (!isUniqueInside(seed)) {
      // Try edge midpoints nudged slightly inward (right-hand perpendicular for CCW polygon)
      for (let j = 0; j < s.polygon.length; j++) {
        const [x1, y1] = s.polygon[j];
        const [x2, y2] = s.polygon[(j + 1) % s.polygon.length];
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        // Left-hand perpendicular (inward for CCW winding)
        const edx = x2 - x1;
        const edy = y2 - y1;
        const eLen = Math.sqrt(edx * edx + edy * edy) || 1;
        // Inward normal for CCW: rotate edge direction 90° CCW → (-dy, dx) normalized
        const nudge = Math.min(1.0, eLen * 0.01);
        const candidate: [number, number] = [mx - (edy / eLen) * nudge, my + (edx / eLen) * nudge];
        if (isUniqueInside(candidate)) {
          seed = candidate;
          break;
        }
      }
    }
    return {
      index: i,
      area: s.area,
      centroid: s.centroid,
      bounds: s.bounds,
      seed,
      polygon: s.polygon,
    };
    })
    .filter((s): s is SurfaceDisplay => s !== null)
    .sort((a, b) => b.area - a.area)
    .map((s, i) => ({ ...s, index: i }));  // re-index after sort
};

// ─── ConstraintSketch ─────────────────────────────────────────────────────────

export class ConstraintSketch extends Sketch {
  constructor(
    cross: Sketch['cross'],
    public readonly constraintMeta: SketchConstraintMeta,
    public readonly definition: ConstraintDefinition,
  ) {
    super(cross);
  }

  /**
   * Enumerate all bounded regions formed by the line arrangement of this sketch.
   * Construction lines are excluded. Regions are returned largest-first by area.
   */
  detectArrangement(): Sketch[] { throw new Error('Not implemented'); }

  /**
   * Select the single arrangement region that contains the given seed point.
   * Throws if no region contains the seed.
   */
  detectArrangementRegion(seed: [number, number]): Sketch { throw new Error('Not implemented'); }

  withUpdatedConstraint(constraintId: string, value: number): ConstraintSketch {
    const next = cloneDefinition(this.definition);
    const target = next.constraints.find((c) => c.id === constraintId);
    if (!target) return this;
    setConstraintValue(target, value);
    return solveConstraintDefinition(next);
  }

  /**
   * Return a human-readable diagnostic string of the solved state.
   */
  inspect(): string {
    const meta = this.constraintMeta;
    const def = this.definition;
    const lines: string[] = [];

    lines.push(`status: ${meta.status}  maxError: ${meta.maxError.toFixed(6)}`);

    if (meta.rejected.length > 0) {
      lines.push(`REJECTED (${meta.rejected.length}):`);
      meta.rejected.forEach((r) => {
        const reason = r.rejectionReason ? ` — ${r.rejectionReason}` : '';
        lines.push(`  ${r.type} ${r.label} (${r.id})${reason}`);
      });
    }

    lines.push('points:');
    def.points.forEach((p) => {
      lines.push(`  ${p.id}: (${p.x.toFixed(3)}, ${p.y.toFixed(3)})${p.fixed ? ' FIXED' : ''}`);
    });

    lines.push('lines:');
    const ptMap = new Map(def.points.map((p) => [p.id, p] as const));
    def.lines.forEach((l) => {
      const a = ptMap.get(l.a);
      const b = ptMap.get(l.b);
      if (!a || !b) return;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
      const len = Math.sqrt(dx * dx + dy * dy);
      lines.push(
        `  ${l.id}: ${l.a}\u2192${l.b}  angle=${ang.toFixed(1)}\u00B0  len=${len.toFixed(3)}${l.construction ? ' (construction)' : ''}`,
      );
    });

    lines.push('loops:');
    def.loops.forEach((loop, i) => {
      if (loop.type === 'poly') {
        const coords = loop.points.map((id) => ptMap.get(id)).filter(Boolean) as import('./types').SketchPoint[];
        let area = 0;
        for (let j = 0; j < coords.length; j += 1) {
          const k = (j + 1) % coords.length;
          area += coords[j].x * coords[k].y - coords[k].x * coords[j].y;
        }
        area /= 2;
        lines.push(`  [${i}]: ${coords.length}-gon  area=${area.toFixed(1)}`);
      } else if (loop.type === 'circle') {
        const c = def.circles.find((cc) => cc.id === loop.circle);
        const cen = c ? ptMap.get(c.center) : null;
        lines.push(
          `  [${i}]: circle r=${c ? c.radius.toFixed(2) : '?'} at (${cen ? cen.x.toFixed(1) : '?'},${cen ? cen.y.toFixed(1) : '?'})`,
        );
      } else {
        lines.push(`  [${i}]: profile (${loop.segments.length} segments)`);
      }
    });

    return lines.join('\n');
  }
}

export const isConstraintSketch = (sketch: Sketch | null | undefined): sketch is ConstraintSketch =>
  sketch instanceof ConstraintSketch;

// ─── solveConstraintDefinition ────────────────────────────────────────────────

export const solveConstraintDefinition = (
  def: ConstraintDefinition,
  options: SolveOptions = {},
): ConstraintSketch => {
  const working = cloneDefinition(def);
  const tolerance = options.tolerance ?? DEFAULT_TOLERANCE;
  const { maxError } = decomposeAndSolve(working, options);
  const { status, dof } = computeStatus(working, maxError, tolerance);
  // Conflicting = solver couldn't converge (genuinely incompatible constraints).
  const conflicts = new Set<string>(
    maxError > tolerance * 5 ? working.constraints.map((c) => c.id) : [],
  );
  // Redundant = solver converged but DOF is negative.
  // Use Jacobian rank analysis to identify which constraint equations are linearly
  // dependent at the solved state. This is O(m·n·min(m,n)) — sub-millisecond —
  // versus the old approach of re-solving n times.
  const redundant = dof < 0 && maxError <= tolerance * 5
    ? findRedundantConstraints(working, -dof)
    : new Set<string>();
  const constraints = buildConstraintDisplays(working, conflicts, redundant);
  const rejected = buildConstraintDisplays(
    { ...working, constraints: working.rejectedConstraints, rejectedConstraints: [] },
    new Set(working.rejectedConstraints.map((c) => c.id)),
    new Set(),
    working.rejectionReasons,
  );
  const sketch = buildSketchFromDefinition(working);
  const construction = buildConstructionGeometry(working);
  const edges = buildEdgeGeometry(working);
  const surfaces = buildSurfaceDisplays(working);
  return new ConstraintSketch(
    sketch.cross,
    { status, dof, maxError, constraints, rejected, surfaces, construction, edges },
    working,
  );
};

export const updateConstraintValue = (
  sketch: ConstraintSketch,
  constraintId: string,
  value: number,
): ConstraintSketch => {
  const next = cloneDefinition(sketch.definition);
  const target = next.constraints.find((c) => c.id === constraintId);
  if (!target) return sketch;
  setConstraintValue(target, value);
  return solveConstraintDefinition(next);
};

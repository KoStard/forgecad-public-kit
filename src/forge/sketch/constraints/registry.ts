import type {
  ConstraintDef,
  ConstraintDefinition,
  ConstraintDisplay,
  ConstraintType,
  DofContext,
  DisplayContext,
  PointId,
  SketchConstraint,
  SolveOptions,
  SolverMetadata,
} from './types';
import { solveConstraintsWasm } from './solver-wasm';

// ─── Registry ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ConstraintDef<string, any>>();

export function registerConstraint<TType extends string, TData extends object>(
  def: ConstraintDef<TType, TData>,
): void {
  registry.set(def.type, def as unknown as ConstraintDef<string, object>);
}

export function getConstraintDef(type: string): ConstraintDef | undefined {
  return registry.get(type);
}

// ─── Builder method installation ──────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installBuilderMethod(type: string, fn: (...args: any[]) => any): void {
  // Deferred — applied by builder.ts after class definition.
  // builder.ts calls applyBuilderMethods(); each def file calls installBuilderMethod()
  // which stores the fn here, and builder picks them up.
  pendingBuilderMethods.set(type, fn);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pendingBuilderMethods = new Map<string, (...args: any[]) => any>();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getPendingBuilderMethods(): Map<string, (...args: any[]) => any> {
  return pendingBuilderMethods;
}

// ─── Registry-derived helpers ──────────────────────────────────────────────────

export const buildLabel = (type: ConstraintType | string): string =>
  registry.get(type)?.label ?? 'C';

export const isDimensionConstraint = (type: ConstraintType | string): boolean =>
  registry.get(type)?.isDimension ?? false;

export const getConstraintValue = (constraint: SketchConstraint): number | undefined => {
  const def = registry.get(constraint.type);
  if (!def?.isDimension) return undefined;
  return (constraint as unknown as { value?: number }).value;
};

export const setConstraintValue = (constraint: SketchConstraint, value: number): void => {
  const def = registry.get(constraint.type);
  if (!def?.isDimension) return;
  (constraint as unknown as { value: number }).value = value;
};

// ─── Solver ────────────────────────────────────────────────────────────────────
//
// The numerical solver now lives in Rust/WASM. This file keeps only:
// - constraint registration
// - thin solve/profiling glue
// - display helpers used by the UI

export const DEFAULT_TOLERANCE = 1e-3;

/** Detailed solver timing breakdown — populated per solveConstraints call. */
export let lastSolverProfile: Record<string, number> | null = null;
let _totalLmTime = 0;
let _totalLmCalls = 0;
let _totalLinearizations = 0;
let _totalLmIterations = 0;
export const getSolverStats = () => ({ totalLmTime: _totalLmTime, totalLmCalls: _totalLmCalls, totalLinearizations: _totalLinearizations, totalLmIterations: _totalLmIterations });
export const resetSolverStats = () => { _totalLmTime = 0; _totalLmCalls = 0; _totalLinearizations = 0; _totalLmIterations = 0; };

export const solveConstraints = (
  def: ConstraintDefinition,
  options: SolveOptions,
): { maxError: number; metadata: SolverMetadata | null } => {
  const _st0 = performance.now();
  const { maxError, metadata } = solveConstraintsWasm(def, options);
  const _st1 = performance.now();
  _totalLmTime += _st1 - _st0;
  _totalLmCalls++;

  lastSolverProfile = {
    solve: _st1 - _st0,
    total: _st1 - _st0,
    constraints: def.constraints.length,
    freePoints: def.points.filter(p => !p.fixed).length,
  };

  return { maxError, metadata };
};

// ─── Display ───────────────────────────────────────────────────────────────────

export const buildConstraintDisplays = (
  def: ConstraintDefinition,
  conflictingIds: Set<string>,
  redundantIds: Set<string> = new Set(),
  rejectionReasons?: Map<string, string>,
  residualById?: Map<string, number>,
): ConstraintDisplay[] => {
  const ctx: DisplayContext = {
    points: new Map(def.points.map((p) => [p.id, p] as const)),
    lines: new Map(def.lines.map((l) => [l.id, l] as const)),
    circles: new Map(def.circles.map((c) => [c.id, c] as const)),
    arcs: new Map((def.arcs ?? []).map((a) => [a.id, a] as const)),
    shapes: new Map((def.shapes ?? []).map((s) => [s.id, s] as const)),
  };

  const displays = def.constraints.map((constraint) => {
    const constraintDef = registry.get(constraint.type);
    const position: [number, number] = constraintDef
      ? constraintDef.displayPosition(constraint as never, ctx)
      : [0, 0];

    // Extract entity IDs from constraint fields.
    const entityIds: string[] = [];
    for (const [key, val] of Object.entries(constraint)) {
      if (key === 'id' || key === 'type') continue;
      if (typeof val === 'string') entityIds.push(val);
      else if (Array.isArray(val)) {
        for (const v of val) { if (typeof v === 'string') entityIds.push(v); }
      }
    }

    const residual = residualById?.get(constraint.id) ?? 0;

    // Build annotations if the constraint defines them, otherwise fall back to text.
    const value = getConstraintValue(constraint);
    const label = buildLabel(constraint.type);
    const isDimension = isDimensionConstraint(constraint.type);
    let annotations: import('./types').AnnotationElement[] = [];
    if (constraintDef?.displayAnnotations) {
      annotations = constraintDef.displayAnnotations(constraint as never, ctx);
    }
    if (annotations.length === 0) {
      // Fallback: legacy text label at the computed position.
      const text = isDimension && value !== undefined ? `${label}${value}` : label;
      annotations = [{ kind: 'text', position, text }];
    }

    return {
      id: constraint.id,
      type: constraint.type,
      label,
      position,
      value,
      isDimension,
      isConflicting: conflictingIds.has(constraint.id),
      isRedundant: redundantIds.has(constraint.id),
      rejectionReason: rejectionReasons?.get(constraint.id),
      entityIds,
      residual,
      annotations,
    };
  });

  // ─── Force-directed label placement ───────────────────────────────────────
  // Replaces naive point-based pairwise repulsion with a geometry-aware,
  // text-width-aware force-directed layout.

  const FONT_SIZE = 2;
  const CHAR_WIDTH = FONT_SIZE * 0.6;
  const TEXT_HEIGHT = FONT_SIZE * 1.2;
  const LABEL_PAD = 1.0; // extra padding around text bbox

  // Compute text bounding box dimensions for each label.
  // Dimension constraints render as "symbol + value" (e.g., "⟨22"), others just the symbol.
  const labelTexts = displays.map(
    (d) => d.isDimension && d.value !== undefined ? `${d.label}${d.value}` : d.label,
  );
  const halfWidths = labelTexts.map((t) => (t.length * CHAR_WIDTH) / 2 + LABEL_PAD);
  const halfHeight = TEXT_HEIGHT / 2 + LABEL_PAD;

  // Collect edge segments from the definition's lines (for geometry avoidance).
  const edgeSegs: { x1: number; y1: number; x2: number; y2: number }[] = [];
  for (const line of def.lines) {
    if (line.construction) continue;
    const a = ctx.points.get(line.a);
    const b = ctx.points.get(line.b);
    if (a && b) edgeSegs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  // Compute entity centroid for each label (tether anchor).
  const anchors: ([number, number] | null)[] = displays.map((d) => {
    const pts: [number, number][] = [];
    for (const eid of d.entityIds) {
      const pt = ctx.points.get(eid);
      if (pt) { pts.push([pt.x, pt.y]); continue; }
      const ln = ctx.lines.get(eid);
      if (ln) {
        const a = ctx.points.get(ln.a);
        const b = ctx.points.get(ln.b);
        if (a && b) pts.push([(a.x + b.x) / 2, (a.y + b.y) / 2]);
        continue;
      }
      const ci = ctx.circles.get(eid);
      if (ci) {
        const c = ctx.points.get(ci.center);
        if (c) pts.push([c.x, c.y]);
      }
    }
    if (pts.length === 0) return null;
    return [
      pts.reduce((s, p) => s + p[0], 0) / pts.length,
      pts.reduce((s, p) => s + p[1], 0) / pts.length,
    ] as [number, number];
  });

  // Seed force layout from the annotation's own natural position, not displayPosition().
  // displayAnnotations() and displayPosition() often compute different positions (e.g. midpoint
  // vs midpointPerp), causing the delta to be applied on the wrong baseline.
  const origPos = displays.map((d): [number, number] => {
    for (const ann of d.annotations) {
      if (ann.kind === 'symbol' || ann.kind === 'text') {
        return [ann.position[0], ann.position[1]];
      }
      if (ann.kind === 'dimension') {
        // Midpoint of the offset dimension line = where the label naturally appears.
        const [ax, ay] = ann.from, [bx, by] = ann.to;
        const dx = bx - ax, dy = by - ay;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len * ann.offset, ny = dx / len * ann.offset;
        return [(ax + bx) / 2 + nx, (ay + by) / 2 + ny];
      }
    }
    return [d.position[0], d.position[1]];
  });
  const pos = origPos.map((p) => [p[0], p[1]] as [number, number]);
  const n = pos.length;

  // Force simulation parameters.
  const MAX_ITERS = 80;
  const DAMPING = 0.4;
  const LABEL_REPULSION = 2.0;   // strength of label-label repulsion
  const EDGE_REPULSION = 1.0;    // strength of edge repulsion
  const EDGE_INFLUENCE = 4.0;    // max distance at which edges repel
  const TETHER_STRENGTH = 0.12;  // spring pull back toward entity (stronger — symbols are small)
  const MAX_TETHER_DIST = 12;    // tighter leash — compact symbols stay near entities

  for (let iter = 0; iter < MAX_ITERS; iter++) {
    let maxForce = 0;
    const forces: [number, number][] = pos.map(() => [0, 0]);

    // 1. Label-label repulsion (bbox-aware).
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const overlapX = (halfWidths[i] + halfWidths[j]) - Math.abs(pos[j][0] - pos[i][0]);
        const overlapY = (halfHeight + halfHeight) - Math.abs(pos[j][1] - pos[i][1]);
        if (overlapX > 0 && overlapY > 0) {
          // Labels overlap — push apart along the axis of least overlap.
          let dx = pos[j][0] - pos[i][0];
          let dy = pos[j][1] - pos[i][1];
          const d = Math.hypot(dx, dy);
          if (d < 0.01) {
            // Exact overlap — use index-based angle to break symmetry.
            const a = (i * Math.PI * 2) / Math.max(n, 2);
            dx = Math.cos(a); dy = Math.sin(a);
          } else {
            dx /= d; dy /= d;
          }
          const push = Math.min(overlapX, overlapY) * LABEL_REPULSION;
          forces[i][0] -= dx * push; forces[i][1] -= dy * push;
          forces[j][0] += dx * push; forces[j][1] += dy * push;
        }
      }
    }

    // 2. Edge repulsion — push labels away from nearby edge segments.
    //    Uses label bounding box extent to determine effective repulsion radius.
    for (let i = 0; i < n; i++) {
      const hw = halfWidths[i];
      const hh = halfHeight;
      for (const seg of edgeSegs) {
        // Find closest point on segment to label center.
        const ex = seg.x2 - seg.x1;
        const ey = seg.y2 - seg.y1;
        const len2 = ex * ex + ey * ey;
        let t = 0;
        if (len2 > 1e-9) {
          t = Math.max(0, Math.min(1, ((pos[i][0] - seg.x1) * ex + (pos[i][1] - seg.y1) * ey) / len2));
        }
        const cx = seg.x1 + t * ex;
        const cy = seg.y1 + t * ey;
        let dx = pos[i][0] - cx;
        let dy = pos[i][1] - cy;
        const d = Math.hypot(dx, dy);
        // Scale influence by label size — larger labels need more clearance.
        const effectiveInfluence = EDGE_INFLUENCE + Math.max(hw, hh) * 0.5;
        if (d < effectiveInfluence && d > 0.01) {
          const strength = EDGE_REPULSION * (1 - d / effectiveInfluence);
          dx /= d; dy /= d;
          forces[i][0] += dx * strength;
          forces[i][1] += dy * strength;
        }
      }
    }

    // 3. Entity tether — spring force pulling label toward its anchor.
    for (let i = 0; i < n; i++) {
      const anchor = anchors[i];
      if (!anchor) continue;
      const dx = anchor[0] - pos[i][0];
      const dy = anchor[1] - pos[i][1];
      const d = Math.hypot(dx, dy);
      if (d > 0.1) {
        forces[i][0] += dx * TETHER_STRENGTH;
        forces[i][1] += dy * TETHER_STRENGTH;
      }
    }

    // Apply forces with damping.
    for (let i = 0; i < n; i++) {
      const fx = forces[i][0] * DAMPING;
      const fy = forces[i][1] * DAMPING;
      pos[i][0] += fx;
      pos[i][1] += fy;
      maxForce = Math.max(maxForce, Math.abs(fx), Math.abs(fy));
    }

    // Clamp max distance from anchor.
    for (let i = 0; i < n; i++) {
      const anchor = anchors[i];
      if (!anchor) continue;
      const dx = pos[i][0] - anchor[0];
      const dy = pos[i][1] - anchor[1];
      const d = Math.hypot(dx, dy);
      if (d > MAX_TETHER_DIST) {
        pos[i][0] = anchor[0] + (dx / d) * MAX_TETHER_DIST;
        pos[i][1] = anchor[1] + (dy / d) * MAX_TETHER_DIST;
      }
    }

    // Early exit when forces are negligible.
    if (maxForce < 0.01) break;
  }

  return displays.map((d, i) => {
    const dx = pos[i][0] - origPos[i][0];
    const dy = pos[i][1] - origPos[i][1];
    // Shift annotation positions by the same delta the force layout applied.
    const annotations = (dx === 0 && dy === 0) ? d.annotations : d.annotations.map((ann) => {
      if (ann.kind === 'symbol' || ann.kind === 'text') {
        return { ...ann, position: [ann.position[0] + dx, ann.position[1] + dy] as [number, number] };
      }
      if (ann.kind === 'dimension') {
        // Don't shift from/to — they are entity endpoints that must stay anchored to geometry.
        return ann;
      }
      if (ann.kind === 'angle-arc') {
        // Don't shift center — it is the vertex of the angle and must stay on the entity.
        return ann;
      }
      return ann;
    });
    return { ...d, position: pos[i], annotations };
  });
};

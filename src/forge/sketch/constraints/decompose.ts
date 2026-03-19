/**
 * Graph-based constraint decomposition with constructive solve planning.
 *
 * Builds a connectivity graph (Union-Find) over all geometric entities and
 * partitions the constraint system into independent connected components.
 * Each component is solved separately, reducing the Jacobian size from O(n²)
 * to O((n/k)²) per component and eliminating cross-component basin-of-attraction
 * conflicts.
 *
 * Constructive solve plan (new):
 *   - Components are topologically sorted: those with more fixed points
 *     (anchors) are solved first.
 *   - Within each component, the analytical solver runs first to place points
 *     via closed-form geometry, reducing the numerical problem size.
 *
 * Connectivity rules:
 *   - Lines implicitly couple their two endpoints.
 *   - Circles implicitly couple their center point.
 *   - Arcs implicitly couple center, start, and end points.
 *   - Shapes implicitly couple all their lines (and transitively, points).
 *   - Each constraint couples all entities it references.
 *
 * When there is only one component the solver is called directly (zero overhead).
 */

import type { ConstraintDefinition, SketchConstraint, SolveOptions } from './types';
import { solveConstraints } from './registry';

// ─── Union-Find ─────────────────────────────────────────────────────────────────

class UnionFind {
  private parent = new Map<string, string>();
  private rank = new Map<string, number>();

  add(x: string): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: string): string {
    this.add(x);
    let r = x;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    // Path compression
    let c = x;
    while (c !== r) {
      const next = this.parent.get(c)!;
      this.parent.set(c, r);
      c = next;
    }
    return r;
  }

  union(x: string, y: string): void {
    const rx = this.find(x);
    const ry = this.find(y);
    if (rx === ry) return;
    const rankX = this.rank.get(rx)!;
    const rankY = this.rank.get(ry)!;
    if (rankX < rankY) this.parent.set(rx, ry);
    else if (rankX > rankY) this.parent.set(ry, rx);
    else { this.parent.set(ry, rx); this.rank.set(rx, rankX + 1); }
  }
}

// ─── Entity-ID extraction ───────────────────────────────────────────────────────

/**
 * Extract all entity IDs referenced by a constraint via generic field scan.
 * Picks up every string-valued field (except `id` and `type`) and every string
 * element inside array fields (e.g. `ccw.points`).  This is robust against
 * future constraint types — no per-type switch required.
 */
const extractEntityIds = (constraint: SketchConstraint): string[] => {
  const ids: string[] = [];
  for (const [key, val] of Object.entries(constraint)) {
    if (key === 'id' || key === 'type') continue;
    if (typeof val === 'string') ids.push(val);
    else if (Array.isArray(val)) {
      for (const v of val) { if (typeof v === 'string') ids.push(v); }
    }
  }
  return ids;
};

// ─── Solve Plan ─────────────────────────────────────────────────────────────────

/** A component in the constructive solve plan. */
export interface SolvePlanComponent {
  root: string;
  points: ConstraintDefinition['points'];
  lines: ConstraintDefinition['lines'];
  circles: ConstraintDefinition['circles'];
  arcs: ConstraintDefinition['arcs'];
  shapes: ConstraintDefinition['shapes'];
  constraints: SketchConstraint[];
  /** Number of fixed (anchor) points in this component. Higher = solve first. */
  anchorCount: number;
  /** Total free DOF in this component. */
  freeDof: number;
}

/**
 * Build a constructive solve plan: topologically ordered list of components.
 * Components with more anchor points are solved first because they are more
 * constrained and likely to converge quickly, producing determined positions
 * that downstream components can use.
 */
function buildSolvePlan(
  def: ConstraintDefinition,
): SolvePlanComponent[] | null {
  if (def.constraints.length <= 1) return null; // use fast path

  const uf = new UnionFind();

  // Register all entities.
  for (const p of def.points) uf.add(p.id);
  for (const l of def.lines) uf.add(l.id);
  for (const c of def.circles) uf.add(c.id);
  for (const a of def.arcs ?? []) uf.add(a.id);
  for (const s of def.shapes ?? []) uf.add(s.id);

  // Structural edges.
  for (const l of def.lines) { uf.union(l.id, l.a); uf.union(l.id, l.b); }
  for (const c of def.circles) { uf.union(c.id, c.center); }
  for (const a of def.arcs ?? []) {
    uf.union(a.id, a.center);
    uf.union(a.id, a.start);
    uf.union(a.id, a.end);
  }
  for (const s of def.shapes ?? []) {
    for (const lineId of s.lines) uf.union(s.id, lineId);
  }

  // Constraint edges.
  for (const constraint of def.constraints) {
    const ids = extractEntityIds(constraint);
    for (let i = 1; i < ids.length; i++) uf.union(ids[0], ids[i]);
  }

  // Group entity IDs by component root.
  const componentOf = new Map<string, string>();
  const roots = new Set<string>();
  const allIds = [
    ...def.points.map(p => p.id),
    ...def.lines.map(l => l.id),
    ...def.circles.map(c => c.id),
    ...(def.arcs ?? []).map(a => a.id),
    ...(def.shapes ?? []).map(s => s.id),
  ];
  for (const id of allIds) {
    const root = uf.find(id);
    componentOf.set(id, root);
    roots.add(root);
  }

  if (roots.size <= 1) return null; // single component

  const components: SolvePlanComponent[] = [];

  for (const root of roots) {
    const inComponent = (id: string) => componentOf.get(id) === root;

    const subPoints = def.points.filter(p => inComponent(p.id));
    const subLines = def.lines.filter(l => inComponent(l.id));
    const subCircles = def.circles.filter(c => inComponent(c.id));
    const subArcs = (def.arcs ?? []).filter(a => inComponent(a.id));
    const subShapes = (def.shapes ?? []).filter(s => inComponent(s.id));
    const subConstraints = def.constraints.filter(c => {
      const ids = extractEntityIds(c);
      return ids.length > 0 && inComponent(ids[0]);
    });

    if (subConstraints.length === 0) continue;

    const anchorCount = subPoints.filter(p => p.fixed).length;
    const freeDof = subPoints.filter(p => !p.fixed).length * 2 +
      subCircles.filter(c => !c.fixedRadius).length +
      subArcs.length; // arc radius DOF

    components.push({
      root,
      points: subPoints,
      lines: subLines,
      circles: subCircles,
      arcs: subArcs,
      shapes: subShapes,
      constraints: subConstraints,
      anchorCount,
      freeDof,
    });
  }

  // Sort: components with more anchor points first (more constrained → solve first).
  // Secondary sort: fewer free DOF first (simpler → faster convergence).
  components.sort((a, b) => {
    if (b.anchorCount !== a.anchorCount) return b.anchorCount - a.anchorCount;
    return a.freeDof - b.freeDof;
  });

  return components;
}

// ─── Decompose & Solve ──────────────────────────────────────────────────────────

export const decomposeAndSolve = (
  def: ConstraintDefinition,
  options: SolveOptions,
): { maxError: number } => {
  // Fast path: trivial systems don't benefit from decomposition.
  if (def.constraints.length <= 1) return solveConstraints(def, options);

  const plan = buildSolvePlan(def);

  // Single component → solve directly, no decomposition overhead.
  if (!plan) return solveConstraints(def, options);

  // Solve each component independently in topological order.
  // Sub-definitions share the same entity object references as the original,
  // so solver mutations (point.x, etc.) propagate back automatically.
  let maxError = 0;
  for (const comp of plan) {
    const result = solveConstraints({
      points: comp.points,
      lines: comp.lines,
      circles: comp.circles,
      arcs: comp.arcs,
      shapes: comp.shapes,
      loops: [],
      constraints: comp.constraints,
      rejectedConstraints: [],
    }, options);
    maxError = Math.max(maxError, result.maxError);
  }

  return { maxError };
};

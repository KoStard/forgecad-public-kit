/**
 * Structural rigidity analysis using Laman's theorem and the pebble game.
 *
 * Laman's theorem (2D): A constraint graph on n vertices with m edges is
 * generically rigid iff:
 *   - m = 2n - 3  (exactly constrained)
 *   - Every subset of k vertices spans at most 2k - 3 edges
 *
 * The pebble game algorithm efficiently checks the Laman condition:
 *   1. Start with 2 pebbles per vertex (representing 2 DOF)
 *   2. For each edge (constraint), try to collect 3 pebbles from endpoints via DFS
 *   3. If successful, the edge is independent (lock one pebble)
 *   4. If not, the edge is redundant → part of an over-constrained subgraph
 *
 * This module reports which constraints form over-constrained subgraphs BEFORE
 * solving, giving precise "this group conflicts" messages.
 */

import type {
  ConstraintDefinition,
  PointId,
  SketchConstraint,
  SketchLine,
} from './types';
import { getConstraintDef } from './registry';

// ─── Types ──────────────────────────────────────────────────────────────────────

export interface RigidityResult {
  /** Total DOF of the system (2n - m for n free points, m constraint equations). */
  totalDof: number;
  /** IDs of constraints that are structurally redundant (over-constrained). */
  redundantConstraintIds: Set<string>;
  /** IDs of constraints that are independent (needed for rigidity). */
  independentConstraintIds: Set<string>;
  /** True if the system is generically rigid (no under-determined subset). */
  isRigid: boolean;
}

// ─── Constraint to edge conversion ──────────────────────────────────────────────

interface ConstraintEdge {
  constraintId: string;
  /** Point IDs at the two ends of this constraint edge. */
  vertices: [PointId, PointId];
}

/**
 * Convert constraints into graph edges for the pebble game.
 *
 * Each constraint equation is one edge. Constraints with 2 equations
 * (like coincident) produce 2 edges. We model edges between the point
 * pairs that the constraint couples.
 */
function constraintsToEdges(
  def: ConstraintDefinition,
): ConstraintEdge[] {
  const lineMap = new Map(def.lines.map(l => [l.id, l]));
  const shapeLineMap = new Map(
    (def.shapes ?? []).flatMap(s => s.lines.map(lid => [s.id, lid] as const)),
  );
  const edges: ConstraintEdge[] = [];

  for (const c of def.constraints) {
    const cdef = getConstraintDef(c.type);
    if (!cdef) continue;
    const eqCount = cdef.equations ?? 0;
    if (eqCount === 0) continue; // 'fixed' — DOF removed by pinning, not an edge

    // Extract all point IDs this constraint touches.
    const pointIds = getConstraintPointIds(c, def, lineMap);
    if (pointIds.length < 2) {
      // Single-point constraint (e.g., a distance from a fixed point
      // that only affects one free point). Model as self-loops — each
      // consumes 1 DOF from that point.
      for (let e = 0; e < eqCount; e++) {
        if (pointIds.length === 1) {
          edges.push({ constraintId: c.id, vertices: [pointIds[0], pointIds[0]] });
        }
      }
      continue;
    }

    // For multi-point constraints, create edges between consecutive pairs.
    // For 2-equation constraints (coincident), create 2 edges.
    for (let e = 0; e < eqCount; e++) {
      const i = e % (pointIds.length - 1);
      edges.push({
        constraintId: c.id,
        vertices: [pointIds[i], pointIds[i + 1 < pointIds.length ? i + 1 : 0]],
      });
    }
  }

  return edges;
}

/** Get all free point IDs referenced by a constraint. */
function getConstraintPointIds(
  c: SketchConstraint,
  def: ConstraintDefinition,
  lineMap: Map<string, SketchLine>,
): PointId[] {
  const fixedSet = new Set(def.points.filter(p => p.fixed).map(p => p.id));
  const allPointIds = new Set<PointId>();

  for (const [key, val] of Object.entries(c)) {
    if (key === 'id' || key === 'type') continue;
    if (typeof val === 'string') {
      // Could be a point, line, circle, arc, or shape ID.
      if (def.points.some(p => p.id === val)) {
        allPointIds.add(val);
      }
      const line = lineMap.get(val);
      if (line) {
        allPointIds.add(line.a);
        allPointIds.add(line.b);
      }
      const circle = def.circles.find(cc => cc.id === val);
      if (circle) {
        allPointIds.add(circle.center);
      }
      for (const arc of def.arcs ?? []) {
        if (arc.id === val) {
          allPointIds.add(arc.center);
          allPointIds.add(arc.start);
          allPointIds.add(arc.end);
        }
      }
      for (const shape of def.shapes ?? []) {
        if (shape.id === val) {
          for (const lid of shape.lines) {
            const sl = lineMap.get(lid);
            if (sl) { allPointIds.add(sl.a); allPointIds.add(sl.b); }
          }
        }
      }
    } else if (Array.isArray(val)) {
      for (const v of val) {
        if (typeof v === 'string' && def.points.some(p => p.id === v)) {
          allPointIds.add(v);
        }
      }
    }
  }

  // Only return free points (fixed points don't have DOF to constrain).
  return [...allPointIds].filter(id => !fixedSet.has(id));
}

// ─── Pebble Game ────────────────────────────────────────────────────────────────

/**
 * The pebble game for 2D rigidity (Laman check).
 *
 * Each vertex starts with 2 pebbles. For each edge, we try to gather 3
 * pebbles across its two endpoints. If we can, the edge is independent
 * and we lock one pebble. Otherwise the edge is redundant.
 */
class PebbleGame {
  /** Number of free pebbles at each vertex. */
  private pebbles = new Map<string, number>();
  /** Directed edge structure: vertex → list of neighbor vertices that "own" a pebble. */
  private reach = new Map<string, Set<string>>();

  constructor(vertices: string[]) {
    for (const v of vertices) {
      this.pebbles.set(v, 2);
      this.reach.set(v, new Set());
    }
  }

  /**
   * Try to add an edge (u, v). Returns true if the edge is independent
   * (Laman-independent), false if redundant.
   */
  addEdge(u: string, v: string): boolean {
    // Self-loop: need to find 1 pebble at u (since both endpoints are the same).
    // Actually for self-loops in 2D rigidity: a self-loop on vertex v needs
    // to find at least 1 free pebble (for 1-DOF constraints on a single point).
    if (u === v) {
      return this.tryCollectPebble(u);
    }

    // Try to collect 3 free pebbles from u and v combined.
    const collected = this.countFreePebbles(u) + this.countFreePebbles(v);
    if (collected >= 3) {
      this.lockPebble(u);
      return true;
    }

    // Try to redistribute pebbles via DFS.
    const needed = 3 - collected;
    let found = 0;
    for (let i = 0; i < needed; i++) {
      if (this.searchAndRedirect(u, v)) {
        found++;
      } else if (this.searchAndRedirect(v, u)) {
        found++;
      } else {
        break;
      }
    }

    if (collected + found >= 3) {
      this.lockPebble(u);
      return true;
    }

    return false;
  }

  private countFreePebbles(v: string): number {
    return this.pebbles.get(v) ?? 0;
  }

  private tryCollectPebble(v: string): boolean {
    const free = this.pebbles.get(v) ?? 0;
    if (free > 0) {
      this.pebbles.set(v, free - 1);
      return true;
    }
    // Try DFS to find a pebble
    return this.searchAndRedirect(v, '');
  }

  private lockPebble(v: string): void {
    const free = this.pebbles.get(v) ?? 0;
    if (free > 0) {
      this.pebbles.set(v, free - 1);
    }
  }

  /**
   * DFS from `start`, trying to find a vertex with a free pebble and redirect
   * edges to bring it to `start`. `exclude` is the other endpoint of the edge
   * being tested (don't use its pebbles).
   */
  private searchAndRedirect(start: string, exclude: string): boolean {
    const visited = new Set<string>();
    return this.dfs(start, exclude, visited);
  }

  private dfs(v: string, exclude: string, visited: Set<string>): boolean {
    if (visited.has(v)) return false;
    visited.add(v);

    // Check if this vertex has a free pebble (and it's not the excluded vertex).
    if (v !== exclude) {
      const free = this.pebbles.get(v) ?? 0;
      if (free > 0) {
        this.pebbles.set(v, free - 1);
        return true;
      }
    }

    // Try neighbors
    const neighbors = this.reach.get(v);
    if (!neighbors) return false;

    for (const w of neighbors) {
      if (this.dfs(w, exclude, visited)) {
        // Redirect: move pebble from w to v, reverse the edge direction.
        neighbors.delete(w);
        const wReach = this.reach.get(w)!;
        wReach.add(v);
        this.pebbles.set(v, (this.pebbles.get(v) ?? 0) + 1);
        return true;
      }
    }

    return false;
  }
}

// ─── Main Entry Point ───────────────────────────────────────────────────────────

/**
 * Analyze the rigidity of a constraint system using the pebble game algorithm.
 *
 * Returns per-constraint redundancy information, the total DOF, and whether
 * the system is generically rigid.
 */
export function analyzeRigidity(def: ConstraintDefinition): RigidityResult {
  const freePoints = def.points.filter(p => !p.fixed);
  const freePointIds = freePoints.map(p => p.id);
  const totalFreeVars = freePoints.length * 2 +
    def.circles.filter(c => !c.fixedRadius).length +
    (def.arcs ?? []).length; // arc radius DOF

  // Count total constraint equations.
  let totalEquations = 0;
  for (const c of def.constraints) {
    const cdef = getConstraintDef(c.type);
    totalEquations += cdef?.equations ?? 0;
  }
  // Add arc consistency equations.
  totalEquations += (def.arcs ?? []).length * 2;

  const totalDof = totalFreeVars - totalEquations;

  const edges = constraintsToEdges(def);

  // Run pebble game on the free point vertices.
  const game = new PebbleGame(freePointIds);
  const redundantConstraintIds = new Set<string>();
  const independentConstraintIds = new Set<string>();
  const processedConstraintEdges = new Map<string, boolean>(); // constraintId → first edge result

  for (const edge of edges) {
    // Skip edges with vertices not in our free point set.
    if (!freePointIds.includes(edge.vertices[0]) && edge.vertices[0] !== edge.vertices[1]) continue;
    if (!freePointIds.includes(edge.vertices[1]) && edge.vertices[0] !== edge.vertices[1]) continue;

    const independent = game.addEdge(edge.vertices[0], edge.vertices[1]);

    // A constraint is redundant if ANY of its edges is redundant.
    const prev = processedConstraintEdges.get(edge.constraintId);
    if (prev === undefined) {
      processedConstraintEdges.set(edge.constraintId, independent);
    } else if (!independent) {
      processedConstraintEdges.set(edge.constraintId, false);
    }
  }

  for (const [cid, independent] of processedConstraintEdges) {
    if (independent) {
      independentConstraintIds.add(cid);
    } else {
      redundantConstraintIds.add(cid);
    }
  }

  return {
    totalDof,
    redundantConstraintIds,
    independentConstraintIds,
    isRigid: totalDof <= 0 && redundantConstraintIds.size === 0,
  };
}

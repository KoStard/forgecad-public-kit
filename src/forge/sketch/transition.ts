/**
 * Edge Transition Curves — smooth connections between two edges.
 *
 * Creates G1-continuous (tangent-matching) transition curves and surfaces
 * between edges of arbitrary shape. Works with both Manifold and OCCT backends
 * by generating polyline paths fed through existing sweep/loft infrastructure.
 *
 * Weight parameters control how much influence each edge has on the transition
 * shape — higher weight means the curve follows that edge longer before turning.
 */

import { HermiteCurve3D, hermiteTransition, type EdgeEndpoint } from './hermiteCurve';
import { sweep, type SweepOptions } from './curves';
import { circle2d, rect } from './primitives';
import type { Sketch } from './core';
import type { Shape } from '../kernel';
import type { EdgeRef } from './topology';
import type { EdgeSegment } from '../mesh/meshEdgeExtraction';

type Vec3 = [number, number, number];

// ── Vector helpers ──────────────────────────────────────────────────

function v3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function v3Len(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function v3Norm(v: Vec3): Vec3 {
  const len = v3Len(v);
  if (len < 1e-12) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

// ── Transition Curve Options ────────────────────────────────────────

export interface TransitionCurveOptions {
  /**
   * Weight for the start edge. Controls tangent magnitude at the start.
   * - 1.0 (default): balanced transition
   * - > 1.0: curve follows start edge longer before turning
   * - < 1.0: curve turns sooner at the start
   */
  weightA?: number;

  /**
   * Weight for the end edge. Controls tangent magnitude at the end.
   * - 1.0 (default): balanced transition
   * - > 1.0: curve follows end edge longer before turning
   * - < 1.0: curve turns sooner at the end
   */
  weightB?: number;

  /**
   * Number of sample points for the output polyline. Default 64.
   * Higher values give smoother curves at the cost of more geometry.
   */
  samples?: number;
}

export interface TransitionSurfaceOptions extends TransitionCurveOptions {
  /**
   * Cross-section profile to sweep along the transition curve.
   * If omitted, a circular profile with `radius` is used.
   */
  profile?: Sketch;

  /**
   * Radius of circular cross-section (used when `profile` is omitted).
   * Default: 5% of chord length.
   */
  radius?: number;

  /**
   * Width and height for rectangular cross-section.
   * Alternative to `radius` when `profile` is omitted.
   */
  rectangleSection?: { width: number; height: number };

  /**
   * Preferred up vector for the sweep frame. Default: auto-detected.
   */
  up?: Vec3;

  /** Edge length for level-set meshing. Smaller = finer. */
  edgeLength?: number;

  /** Extra bounds padding for level-set meshing. */
  boundsPadding?: number;
}

// ── Edge Specification ──────────────────────────────────────────────

export interface TransitionEdge {
  /**
   * Connection point on the edge.
   * Can be any point along the edge where the transition should connect.
   */
  point: Vec3;

  /**
   * Tangent direction at the connection point.
   * This is the direction the curve should initially follow when leaving this edge.
   * For a straight edge, this is typically the edge direction pointing "outward"
   * (away from the body of the edge, toward the other edge).
   */
  tangent: Vec3;

  /**
   * Surface normal at the connection point (optional).
   * Used as a hint for the sweep frame's up vector.
   */
  normal?: Vec3;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Create a smooth transition curve between two edges.
 *
 * Returns a `HermiteCurve3D` that starts at `edgeA.point` tangent to
 * `edgeA.tangent` and ends at `edgeB.point` tangent to `edgeB.tangent`.
 *
 * The curve maintains G1 continuity (matching tangent direction) at both
 * endpoints. Weight parameters control the shape of the transition.
 *
 * @example
 * ```js
 * // Connect two edges with a balanced transition
 * const curve = transitionCurve(
 *   { point: [0, 0, 0], tangent: [1, 0, 0] },
 *   { point: [10, 5, 0], tangent: [1, 0, 0] },
 * );
 *
 * // Weighted: curve hugs edge A longer
 * const weighted = transitionCurve(
 *   { point: [0, 0, 0], tangent: [1, 0, 0] },
 *   { point: [10, 5, 0], tangent: [1, 0, 0] },
 *   { weightA: 2.0, weightB: 0.5 },
 * );
 * ```
 */
export function transitionCurve(edgeA: TransitionEdge, edgeB: TransitionEdge, options: TransitionCurveOptions = {}): HermiteCurve3D {
  const a: EdgeEndpoint = {
    point: edgeA.point,
    tangent: edgeA.tangent,
    normal: edgeA.normal,
    weight: options.weightA,
  };
  const b: EdgeEndpoint = {
    point: edgeB.point,
    tangent: edgeB.tangent,
    normal: edgeB.normal,
    weight: options.weightB,
  };
  return hermiteTransition(a, b);
}

/**
 * Create a solid transition surface between two edges by sweeping a profile
 * along a Hermite transition curve.
 *
 * This produces a watertight solid that smoothly connects the two edges.
 * Works with both Manifold and OCCT backends.
 *
 * @example
 * ```js
 * // Circular tube connecting two edges
 * const tube = transitionSurface(
 *   { point: [0, 0, 0], tangent: [1, 0, 0] },
 *   { point: [10, 5, 3], tangent: [0, 1, 0] },
 *   { radius: 0.5 },
 * );
 *
 * // Custom profile with weights
 * const custom = transitionSurface(
 *   { point: [0, 0, 0], tangent: [1, 0, 0] },
 *   { point: [10, 5, 3], tangent: [0, 1, 0] },
 *   { profile: mySketch, weightA: 1.5, weightB: 0.8 },
 * );
 * ```
 */
export function transitionSurface(edgeA: TransitionEdge, edgeB: TransitionEdge, options: TransitionSurfaceOptions = {}): Shape {
  const curve = transitionCurve(edgeA, edgeB, options);
  const samples = options.samples ?? 64;
  const pathPoints = curve.toPolyline(samples);

  // Build cross-section profile
  let profile: Sketch;
  if (options.profile) {
    profile = options.profile;
  } else if (options.rectangleSection) {
    const { width, height } = options.rectangleSection;
    profile = rect(width, height);
  } else {
    const radius = options.radius ?? curve.chordLength * 0.05;
    profile = circle2d(radius);
  }

  // Determine up vector
  let up: Vec3 = options.up ?? [0, 0, 1];
  // If a normal is provided on either edge, use it as the up hint
  if (edgeA.normal) {
    up = edgeA.normal;
  }

  const sweepOpts: SweepOptions = {
    samples,
    up,
  };
  if (options.edgeLength != null) sweepOpts.edgeLength = options.edgeLength;
  if (options.boundsPadding != null) sweepOpts.boundsPadding = options.boundsPadding;

  return sweep(profile, pathPoints, sweepOpts);
}

/**
 * Convenience: create a transition curve from raw coordinate data.
 *
 * Useful when you have endpoints and directions as plain arrays
 * without constructing TransitionEdge objects.
 */
export function transitionCurveFromPoints(
  startPoint: Vec3,
  startTangent: Vec3,
  endPoint: Vec3,
  endTangent: Vec3,
  options: TransitionCurveOptions = {},
): HermiteCurve3D {
  return transitionCurve({ point: startPoint, tangent: startTangent }, { point: endPoint, tangent: endTangent }, options);
}

// ── Edge Selection Helpers ──────────────────────────────────────────

/** Which end of the edge to connect from. */
export type EdgeEnd = 'start' | 'end' | 'mid';

/**
 * Direction mode for the tangent at the connection point.
 *
 * - `'along'`: tangent follows the edge direction (start→end or end→start)
 * - `'outward'`: tangent points away from the edge along the surface normal
 * - `'auto'`: tangent points toward the other edge (requires the other edge's point)
 */
export type TangentMode = 'along' | 'outward' | 'auto';

export interface EdgePickOptions {
  /** Which end of the edge to connect. Default: 'start'. */
  end?: EdgeEnd;
  /**
   * How to determine the tangent direction. Default: 'along'.
   * - 'along': tangent follows the edge direction
   * - 'outward': tangent points along surface normal (requires EdgeSegment)
   * - 'auto': automatically computed (toward the other edge)
   */
  tangentMode?: TangentMode;
  /** Explicit tangent override (ignores tangentMode). */
  tangent?: Vec3;
  /** Flip the computed tangent direction (useful for 'along' mode). */
  flip?: boolean;
}

function v3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function v3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function v3Avg(a: Vec3, b: Vec3): Vec3 {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

/**
 * Pick a connection point from an EdgeRef (tracked topology edge).
 *
 * EdgeRef has `start` and `end` positions. The tangent is inferred
 * from the edge direction.
 *
 * @example
 * ```js
 * const box1 = rect(10, 10).extrude(10);
 * const topEdge = box1.edge('top-front');
 *
 * // Connect from the start of the top-front edge, tangent along the edge
 * const edgeA = pickEdge(topEdge, { end: 'start' });
 *
 * // Connect from the end, with flipped tangent
 * const edgeB = pickEdge(topEdge, { end: 'end', flip: true });
 * ```
 */
export function pickEdge(edge: EdgeRef, options: EdgePickOptions = {}): TransitionEdge {
  const which = options.end ?? 'start';
  const flip = options.flip ?? false;

  let point: Vec3;
  let tangent: Vec3;

  const dir = v3Norm(v3Sub(edge.end, edge.start));

  switch (which) {
    case 'start':
      point = [...edge.start];
      tangent = flip ? (v3Scale(dir, -1) as Vec3) : dir;
      break;
    case 'end':
      point = [...edge.end];
      tangent = flip ? dir : (v3Scale(dir, -1) as Vec3);
      break;
    case 'mid':
      point = v3Avg(edge.start, edge.end);
      tangent = flip ? (v3Scale(dir, -1) as Vec3) : dir;
      break;
  }

  if (options.tangent) {
    tangent = v3Norm(options.tangent);
  }

  return { point, tangent };
}

/**
 * Pick a connection point from an EdgeSegment (from selectEdge/selectEdges).
 *
 * EdgeSegment has richer data including surface normals on both sides,
 * enabling 'outward' tangent mode for transitions that leave the surface.
 *
 * @example
 * ```js
 * const myBox = box(20, 20, 20);
 * const topEdge = selectEdge(myBox, { atZ: 20, parallel: [1, 0, 0] });
 *
 * // Connect from edge start, tangent along the edge direction
 * const edgeA = pickEdgeSegment(topEdge, { end: 'start' });
 *
 * // Connect from midpoint, tangent pointing outward (away from surface)
 * const edgeB = pickEdgeSegment(topEdge, { end: 'mid', tangentMode: 'outward' });
 * ```
 */
export function pickEdgeSegment(edge: EdgeSegment, options: EdgePickOptions = {}): TransitionEdge {
  const which = options.end ?? 'start';
  const mode = options.tangentMode ?? 'along';
  const flip = options.flip ?? false;

  let point: Vec3;
  switch (which) {
    case 'start':
      point = [edge.start[0], edge.start[1], edge.start[2]];
      break;
    case 'end':
      point = [edge.end[0], edge.end[1], edge.end[2]];
      break;
    case 'mid':
      point = [edge.midpoint[0], edge.midpoint[1], edge.midpoint[2]];
      break;
  }

  let tangent: Vec3;
  if (options.tangent) {
    tangent = v3Norm(options.tangent);
  } else if (mode === 'outward') {
    // Average the two face normals to get the "outward" direction
    const avgNormal = v3Norm(v3Add(edge.normalA, edge.normalB));
    tangent = flip ? (v3Scale(avgNormal, -1) as Vec3) : avgNormal;
  } else {
    // 'along' mode: use edge direction
    const dir = edge.direction;
    if (which === 'end') {
      tangent = flip ? [dir[0], dir[1], dir[2]] : (v3Scale(dir, -1) as Vec3);
    } else {
      tangent = flip ? (v3Scale(dir, -1) as Vec3) : [dir[0], dir[1], dir[2]];
    }
  }

  // Include the average surface normal for sweep frame hints
  const normal = v3Norm(v3Add(edge.normalA, edge.normalB));

  return { point, tangent, normal };
}

/**
 * Convenience: connect two edge segments with a transition surface.
 *
 * This combines `pickEdgeSegment` + `transitionSurface` into a single call
 * for the common case of connecting two edges from selectEdge().
 *
 * @example
 * ```js
 * const part = box(30, 20, 15);
 *
 * const topEdge = selectEdge(part, { atZ: 15, parallel: [1, 0, 0] });
 * const frontEdge = selectEdge(part, { near: [15, 10, 7.5], parallel: [0, 0, 1] });
 *
 * const bridge = connectEdges(topEdge, frontEdge, {
 *   endA: 'start',
 *   endB: 'end',
 *   radius: 1.5,
 *   weightA: 1.2,
 *   weightB: 0.8,
 * });
 * ```
 */
export interface ConnectEdgesOptions extends TransitionSurfaceOptions {
  /** Which end of edge A to connect. Default: 'start'. */
  endA?: EdgeEnd;
  /** Which end of edge B to connect. Default: 'start'. */
  endB?: EdgeEnd;
  /** Tangent mode for edge A. Default: 'along'. */
  tangentModeA?: TangentMode;
  /** Tangent mode for edge B. Default: 'along'. */
  tangentModeB?: TangentMode;
  /** Explicit tangent for edge A. */
  tangentA?: Vec3;
  /** Explicit tangent for edge B. */
  tangentB?: Vec3;
  /** Flip tangent A. */
  flipA?: boolean;
  /** Flip tangent B. */
  flipB?: boolean;
}

export function connectEdges(edgeA: EdgeSegment, edgeB: EdgeSegment, options: ConnectEdgesOptions = {}): Shape {
  const a = pickEdgeSegment(edgeA, {
    end: options.endA,
    tangentMode: options.tangentModeA,
    tangent: options.tangentA,
    flip: options.flipA,
  });
  const b = pickEdgeSegment(edgeB, {
    end: options.endB,
    tangentMode: options.tangentModeB,
    tangent: options.tangentB,
    flip: options.flipB,
  });
  return transitionSurface(a, b, options);
}

/**
 * SDF UV Parametrization — maps world-space (x,y,z) to surface-local (u,v) in millimeters.
 *
 * Analyzes an SDF node tree to find the base primitive (sphere, cylinder, torus)
 * and computes analytic UV coordinates from the closest-point projection onto that
 * primitive. Transforms (translate, rotate, scale) are accumulated and inverted so
 * the UV function works in world space.
 *
 * When no recognizable primitive is found, falls back to triplanar mapping.
 *
 * UV coordinates are in **surface millimeters** — real distances on the surface.
 * This means `spacing: 3` in a pattern always means 3mm between features,
 * regardless of the shape's size.
 */

import type { SdfNode, Vec3 } from './sdfNode';

const { abs, atan2, acos, cos, sin, sqrt, PI } = Math;
const DEG = PI / 180;

// ─── UV modes ───────────────────────────────────────────────────────────────

export type UVMode = 'sphere' | 'cylinder' | 'torus' | 'triplanar';

export interface UVAnalysis {
  mode: UVMode;
  /** Transform world point to primitive's local frame. Identity if no transforms. */
  toLocal: (p: Vec3) => Vec3;
  /** Sphere/cylinder radius, or torus minor radius. */
  radius?: number;
  /** Cylinder height (for bounds, not UV). */
  height?: number;
  /** Torus major radius. */
  majorRadius?: number;
}

// ─── Tree analysis ──────────────────────────────────────────────────────────

const IDENTITY: (p: Vec3) => Vec3 = (p) => p;

/**
 * Walk an SDF node tree and determine the best UV parametrization strategy.
 * Traces through transforms (accumulating inverse), shell, and CSG to find
 * the innermost recognizable primitive.
 */
export function analyzeUV(node: SdfNode, override?: UVMode): UVAnalysis {
  if (override) {
    // User override — still need to find primitive params for metric UV
    const analysis = analyzeNodeUV(node, IDENTITY);
    if (override === 'triplanar') return { ...analysis, mode: 'triplanar' };
    return { ...analysis, mode: override };
  }
  return analyzeNodeUV(node, IDENTITY);
}

function analyzeNodeUV(node: SdfNode, toLocal: (p: Vec3) => Vec3): UVAnalysis {
  switch (node.kind) {
    // ── Primitives ──
    case 'sdf:sphere':
      return { mode: 'sphere', toLocal, radius: node.radius };

    case 'sdf:cylinder':
      return { mode: 'cylinder', toLocal, radius: node.radius, height: node.height };

    case 'sdf:torus':
      return { mode: 'torus', toLocal, radius: node.minorRadius, majorRadius: node.majorRadius };

    // ── Transforms — accumulate inverse ──
    case 'sdf:translate': {
      const [ox, oy, oz] = node.offset;
      const prev = toLocal;
      const next: (p: Vec3) => Vec3 = (p) => prev([p[0] - ox, p[1] - oy, p[2] - oz]);
      return analyzeNodeUV(node.child, next);
    }

    case 'sdf:rotate': {
      const [rx, ry, rz] = node.degrees.map((d) => d * DEG);
      const cx = cos(rx), sx = sin(rx);
      const cy = cos(ry), sy = sin(ry);
      const cz = cos(rz), sz = sin(rz);
      const prev = toLocal;
      // Inverse rotation (transpose of Rz * Ry * Rx)
      const next: (p: Vec3) => Vec3 = (p) => {
        const pp = prev(p);
        const [x, y, z] = pp;
        const x1 = cz * x + sz * y;
        const y1 = -sz * x + cz * y;
        const x2 = cy * x1 - sy * z;
        const z2 = sy * x1 + cy * z;
        const y2 = cx * y1 + sx * z2;
        const z3 = -sx * y1 + cx * z2;
        return [x2, y2, z3];
      };
      return analyzeNodeUV(node.child, next);
    }

    case 'sdf:scale': {
      const inv = 1 / node.factor;
      const prev = toLocal;
      const next: (p: Vec3) => Vec3 = (p) => {
        const pp = prev(p);
        return [pp[0] * inv, pp[1] * inv, pp[2] * inv];
      };
      const result = analyzeNodeUV(node.child, next);
      // Scale up radius to world units
      if (result.radius !== undefined) result.radius *= node.factor;
      if (result.majorRadius !== undefined) result.majorRadius *= node.factor;
      return result;
    }

    // ── Shell — UV comes from the inner shape ──
    case 'sdf:shell':
      return analyzeNodeUV(node.child, toLocal);

    // ── CSG — take UV from the first (primary) child ──
    case 'sdf:union':
    case 'sdf:smoothUnion':
    case 'sdf:intersection':
    case 'sdf:smoothIntersection':
    case 'sdf:difference':
    case 'sdf:smoothDifference':
      return analyzeNodeUV(node.children[0], toLocal);

    case 'sdf:morph':
      return analyzeNodeUV(node.a, toLocal);

    // ── Everything else: triplanar fallback ──
    default:
      return { mode: 'triplanar', toLocal };
  }
}

// ─── UV function compilation ────────────────────────────────────────────────

export type UVFn = (p: Vec3) => [u: number, v: number];

function clampUnit(v: number): number {
  return v < -1 ? -1 : v > 1 ? 1 : v;
}

/**
 * Compile a UV function from the analysis results.
 * Returns null for triplanar mode (handled differently in the evaluator).
 *
 * UV coordinates are in surface millimeters:
 * - Sphere: u = θ·R (circumference), v = φ·R (latitude arc)
 * - Cylinder: u = θ·r (circumference), v = z (height)
 * - Torus: u = θ·R (around ring), v = φ·r (around tube)
 */
export function compileUVFunction(analysis: UVAnalysis): UVFn | null {
  if (analysis.mode === 'triplanar') return null;

  const toLocal = analysis.toLocal;

  switch (analysis.mode) {
    case 'sphere': {
      const R = analysis.radius!;
      return (p) => {
        const lp = toLocal(p);
        const u = atan2(lp[1], lp[0]) * R;
        const len = sqrt(lp[0] * lp[0] + lp[1] * lp[1] + lp[2] * lp[2]);
        const v = acos(clampUnit(lp[2] / (len || 1))) * R;
        return [u, v];
      };
    }

    case 'cylinder': {
      const r = analysis.radius!;
      return (p) => {
        const lp = toLocal(p);
        const u = atan2(lp[1], lp[0]) * r;
        const v = lp[2];
        return [u, v];
      };
    }

    case 'torus': {
      const R = analysis.majorRadius!;
      const r = analysis.radius!;
      return (p) => {
        const lp = toLocal(p);
        const u = atan2(lp[1], lp[0]) * R;
        const xyDist = sqrt(lp[0] * lp[0] + lp[1] * lp[1]) - R;
        const v = atan2(lp[2], xyDist) * r;
        return [u, v];
      };
    }
  }
}

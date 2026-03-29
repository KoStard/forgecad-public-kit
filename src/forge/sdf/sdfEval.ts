/**
 * SDF Evaluator — compiles an SdfNode tree into a (Vec3) => number function.
 *
 * All distance functions follow Inigo Quilez's exact SDF formulas.
 * Convention: negative = inside, positive = outside (standard math SDF).
 *
 * IMPORTANT: Manifold.levelSet() uses the OPPOSITE convention (positive = inside).
 * The negation happens at the lowering boundary in manifold/lower.ts, NOT here.
 * This module stays in standard SDF convention so formulas match reference material.
 */

import type { SdfNode, Vec3 } from './sdfNode';
import { simplex3, seededSimplex3 } from './noise';
import { gyroid, schwarzP, diamond, lidinoid } from './tpms';
import { worley3, seededWorley3, worley3Surface, seededWorley3Surface } from './voronoi';

const { abs, cos, max, min, sin, sqrt, PI } = Math;
const TAU = 2 * PI;
const DEG = PI / 180;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function length2(x: number, y: number): number {
  return sqrt(x * x + y * y);
}

function length3(x: number, y: number, z: number): number {
  return sqrt(x * x + y * y + z * z);
}

// ─── Primitive evaluators ────────────────────────────────────────────────────

function sdSphere(px: number, py: number, pz: number, r: number): number {
  return length3(px, py, pz) - r;
}

function sdBox(px: number, py: number, pz: number, hx: number, hy: number, hz: number): number {
  const dx = abs(px) - hx;
  const dy = abs(py) - hy;
  const dz = abs(pz) - hz;
  return length3(max(dx, 0), max(dy, 0), max(dz, 0)) + min(max(dx, dy, dz), 0);
}

function sdCylinder(px: number, py: number, pz: number, h: number, r: number): number {
  // Cylinder centered at origin, axis along Y, height h
  const dx = length2(px, pz) - r;
  const dy = abs(py) - h * 0.5;
  return length2(max(dx, 0), max(dy, 0)) + min(max(dx, dy), 0);
}

function sdTorus(px: number, py: number, pz: number, R: number, r: number): number {
  // Torus centered at origin, lying in XZ plane
  const qx = length2(px, pz) - R;
  return length2(qx, py) - r;
}

function sdCapsule(px: number, py: number, pz: number, h: number, r: number): number {
  // Capsule along Y axis, total height h (between sphere centers)
  const halfH = h * 0.5;
  const cy = clamp(py, -halfH, halfH);
  return length3(px, py - cy, pz) - r;
}

function sdCone(px: number, py: number, pz: number, h: number, r: number): number {
  // Cone with tip at top (y = h), base at y = 0, base radius r
  const q = length2(px, pz);
  // Normalize cone surface direction
  const cLen = length2(h, r);
  const nx = h / cLen;
  const ny = -r / cLen;
  const d = max(nx * q + ny * (py - h), -py, py - h);
  return d;
}

// ─── Smooth min/max (Quilez polynomial) ──────────────────────────────────────

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return min(a, b);
  const h = max(k - abs(a - b), 0) / k;
  return min(a, b) - h * h * h * k * (1 / 6);
}

function smax(a: number, b: number, k: number): number {
  return -smin(-a, -b, k);
}

// ─── Tree compiler ───────────────────────────────────────────────────────────

export type SdfEvalFn = (p: Vec3) => number;

/**
 * Compile an SDF node tree into an efficient evaluator function.
 * Each node compiles recursively; the result is a closure tree.
 */
export function compileSdfNode(node: SdfNode): SdfEvalFn {
  switch (node.kind) {
    // ── Primitives ──
    case 'sdf:sphere': {
      const r = node.radius;
      return (p) => sdSphere(p[0], p[1], p[2], r);
    }
    case 'sdf:box': {
      const [hx, hy, hz] = node.halfExtents;
      return (p) => sdBox(p[0], p[1], p[2], hx, hy, hz);
    }
    case 'sdf:cylinder': {
      const { height: h, radius: r } = node;
      return (p) => sdCylinder(p[0], p[1], p[2], h, r);
    }
    case 'sdf:torus': {
      const { majorRadius: R, minorRadius: r } = node;
      return (p) => sdTorus(p[0], p[1], p[2], R, r);
    }
    case 'sdf:capsule': {
      const { height: h, radius: r } = node;
      return (p) => sdCapsule(p[0], p[1], p[2], h, r);
    }
    case 'sdf:cone': {
      const { height: h, radius: r } = node;
      return (p) => sdCone(p[0], p[1], p[2], h, r);
    }

    // ── Combinators ──
    case 'sdf:union': {
      const fns = node.children.map(compileSdfNode);
      return (p) => {
        let d = fns[0](p);
        for (let i = 1; i < fns.length; i++) d = min(d, fns[i](p));
        return d;
      };
    }
    case 'sdf:difference': {
      const fns = node.children.map(compileSdfNode);
      return (p) => {
        let d = fns[0](p);
        for (let i = 1; i < fns.length; i++) d = max(d, -fns[i](p));
        return d;
      };
    }
    case 'sdf:intersection': {
      const fns = node.children.map(compileSdfNode);
      return (p) => {
        let d = fns[0](p);
        for (let i = 1; i < fns.length; i++) d = max(d, fns[i](p));
        return d;
      };
    }
    case 'sdf:smoothUnion': {
      const fns = node.children.map(compileSdfNode);
      const k = node.radius;
      return (p) => {
        let d = fns[0](p);
        for (let i = 1; i < fns.length; i++) d = smin(d, fns[i](p), k);
        return d;
      };
    }
    case 'sdf:smoothDifference': {
      const fns = node.children.map(compileSdfNode);
      const k = node.radius;
      return (p) => {
        let d = fns[0](p);
        for (let i = 1; i < fns.length; i++) d = smax(d, -fns[i](p), k);
        return d;
      };
    }
    case 'sdf:smoothIntersection': {
      const fns = node.children.map(compileSdfNode);
      const k = node.radius;
      return (p) => {
        let d = fns[0](p);
        for (let i = 1; i < fns.length; i++) d = smax(d, fns[i](p), k);
        return d;
      };
    }
    case 'sdf:morph': {
      const fa = compileSdfNode(node.a);
      const fb = compileSdfNode(node.b);
      const t = node.t;
      const s = 1 - t;
      return (p) => fa(p) * s + fb(p) * t;
    }

    // ── Domain operations ──
    case 'sdf:translate': {
      const fn = compileSdfNode(node.child);
      const [ox, oy, oz] = node.offset;
      return (p) => fn([p[0] - ox, p[1] - oy, p[2] - oz]);
    }
    case 'sdf:rotate': {
      const fn = compileSdfNode(node.child);
      const [rx, ry, rz] = node.degrees.map((d) => d * DEG);
      const cx = cos(rx),
        sx = sin(rx);
      const cy = cos(ry),
        sy = sin(ry);
      const cz = cos(rz),
        sz = sin(rz);
      // Inverse rotation matrix (transpose of Rz * Ry * Rx)
      return (p) => {
        const [x, y, z] = p;
        // Rz^-1
        const x1 = cz * x + sz * y;
        const y1 = -sz * x + cz * y;
        // Ry^-1
        const x2 = cy * x1 - sy * z;
        const z2 = sy * x1 + cy * z;
        // Rx^-1
        const y2 = cx * y1 + sx * z2;
        const z3 = -sx * y1 + cx * z2;
        return fn([x2, y2, z3]);
      };
    }
    case 'sdf:scale': {
      const fn = compileSdfNode(node.child);
      const s = node.factor;
      const inv = 1 / s;
      return (p) => fn([p[0] * inv, p[1] * inv, p[2] * inv]) * s;
    }
    case 'sdf:twist': {
      const fn = compileSdfNode(node.child);
      const k = node.degreesPerUnit * DEG;
      return (p) => {
        const angle = k * p[1]; // twist around Y axis
        const c = cos(angle),
          s = sin(angle);
        return fn([c * p[0] - s * p[2], p[1], s * p[0] + c * p[2]]);
      };
    }
    case 'sdf:bend': {
      const fn = compileSdfNode(node.child);
      const r = node.radius;
      return (p) => {
        // Bend around Z axis: X curves into an arc of radius r
        const angle = p[0] / r;
        const c = cos(angle),
          s = sin(angle);
        const nx = (r + p[1]) * s;
        const ny = (r + p[1]) * c - r;
        return fn([nx, ny, p[2]]);
      };
    }
    case 'sdf:repeat': {
      const fn = compileSdfNode(node.child);
      const [sx, sy, sz] = node.spacing;
      const [cx, cy, cz] = node.count;
      return (p) => {
        let rx = p[0],
          ry = p[1],
          rz = p[2];
        if (sx > 0) {
          rx = rx - sx * Math.round(rx / sx);
          if (cx > 0) rx = clamp(rx, -sx * 0.5, sx * 0.5); // bounded by count via clamping
        }
        if (sy > 0) {
          ry = ry - sy * Math.round(ry / sy);
          if (cy > 0) ry = clamp(ry, -sy * 0.5, sy * 0.5);
        }
        if (sz > 0) {
          rz = rz - sz * Math.round(rz / sz);
          if (cz > 0) rz = clamp(rz, -sz * 0.5, sz * 0.5);
        }
        return fn([rx, ry, rz]);
      };
    }
    case 'sdf:shell': {
      const fn = compileSdfNode(node.child);
      const t = node.thickness * 0.5;
      return (p) => abs(fn(p)) - t;
    }
    case 'sdf:displace': {
      const fn = compileSdfNode(node.child);
      const constEntries = Object.entries(node.constants ?? {});
      const constNames = constEntries.map(([k]) => k);
      const constValues = constEntries.map(([, v]) => v);
      // eslint-disable-next-line no-new-func
      const displaceFn = new Function('x', 'y', 'z', ...constNames, `return (${node.functionBody});`) as Function;
      return (p) => fn(p) + (displaceFn as any)(p[0], p[1], p[2], ...constValues);
    }
    case 'sdf:onion': {
      const fn = compileSdfNode(node.child);
      const { layers, thickness: t } = node;
      return (p) => {
        let d = fn(p);
        for (let i = 0; i < layers; i++) d = abs(d) - t;
        return d;
      };
    }

    // ── TPMS ──
    case 'sdf:gyroid': {
      const { cellSize, thickness } = node;
      return (p) => gyroid(p[0], p[1], p[2], cellSize, thickness);
    }
    case 'sdf:schwarzP': {
      const { cellSize, thickness } = node;
      return (p) => schwarzP(p[0], p[1], p[2], cellSize, thickness);
    }
    case 'sdf:diamond': {
      const { cellSize, thickness } = node;
      return (p) => diamond(p[0], p[1], p[2], cellSize, thickness);
    }
    case 'sdf:lidinoid': {
      const { cellSize, thickness } = node;
      return (p) => lidinoid(p[0], p[1], p[2], cellSize, thickness);
    }

    // ── Spatial blend ──
    case 'sdf:spatialBlend': {
      const fnA = compileSdfNode(node.a);
      const fnB = compileSdfNode(node.b);
      const constEntries = Object.entries(node.constants ?? {});
      const constNames = constEntries.map(([k]) => k);
      const constValues = constEntries.map(([, v]) => v);
      // eslint-disable-next-line no-new-func
      const blendFn = new Function('x', 'y', 'z', ...constNames, `return (${node.functionBody});`) as Function;
      return (p) => {
        const t = clamp(blendFn(p[0], p[1], p[2], ...constValues) as number, 0, 1);
        return fnA(p) * (1 - t) + fnB(p) * t;
      };
    }

    // ── Noise / patterns ──
    case 'sdf:noise': {
      const { scale: sc, amplitude: amp, octaves, seed } = node;
      const noiseFn = seed !== 0 ? seededSimplex3(seed) : simplex3;
      return (p) => {
        let value = 0;
        let freq = sc;
        let a = amp;
        for (let o = 0; o < octaves; o++) {
          value += a * noiseFn(p[0] * freq, p[1] * freq, p[2] * freq);
          freq *= 2;
          a *= 0.5;
        }
        return value;
      };
    }
    case 'sdf:voronoi': {
      const { cellSize, wallThickness, seed, surfaceChild, suppressionThreshold } = node;
      const invCell = 1 / cellSize;
      const halfWall = wallThickness * 0.5;
      const threshold = suppressionThreshold ?? 0.7;

      if (surfaceChild) {
        // Surface-aware mode: projected-distance (F2-F1)/2.
        // Computes Voronoi distances in the tangent plane perpendicular to
        // the surface normal, preventing walls from forming parallel to the surface.
        //
        // For gradient estimation, if the surfaceChild is a shell node, use the
        // inner shape (before abs()) for a smoother gradient without the kink
        // at the shell midline.
        const gradNode = surfaceChild.kind === 'sdf:shell' ? surfaceChild.child : surfaceChild;
        const gradFn = compileSdfNode(gradNode);
        const wFn = seed !== 0 ? seededWorley3Surface(seed) : worley3Surface;
        const eps = cellSize * 0.05;

        return (p) => {
          // Estimate surface normal via central-difference gradient
          const gx = gradFn([p[0] + eps, p[1], p[2]]) - gradFn([p[0] - eps, p[1], p[2]]);
          const gy = gradFn([p[0], p[1] + eps, p[2]]) - gradFn([p[0], p[1] - eps, p[2]]);
          const gz = gradFn([p[0], p[1], p[2] + eps]) - gradFn([p[0], p[1], p[2] - eps]);
          const glen = sqrt(gx * gx + gy * gy + gz * gz);
          let nx = 0, ny = 0, nz = 0;
          if (glen > 1e-10) {
            const invG = 1 / glen;
            nx = gx * invG;
            ny = gy * invG;
            nz = gz * invG;
          }

          const wallDist = wFn(
            p[0] * invCell, p[1] * invCell, p[2] * invCell,
            nx, ny, nz, threshold,
          );
          return wallDist * cellSize - halfWall;
        };
      }

      // Standard mode: F2-F1 wall distance (may have membranes in 3D)
      const wFn = seed !== 0 ? seededWorley3(seed) : worley3;
      return (p) => {
        const [f1, f2] = wFn(p[0] * invCell, p[1] * invCell, p[2] * invCell);
        const wallDist = (f2 - f1) * 0.5 * cellSize;
        return wallDist - halfWall;
      };
    }

    // ── Custom ──
    case 'sdf:custom': {
      const constEntries = Object.entries(node.constants ?? {});
      const constNames = constEntries.map(([k]) => k);
      const constValues = constEntries.map(([, v]) => v);
      // eslint-disable-next-line no-new-func
      const customFn = new Function('x', 'y', 'z', ...constNames, `return (${node.functionBody});`) as Function;
      return (p) => (customFn as any)(p[0], p[1], p[2], ...constValues);
    }
  }
}

// ─── Bounds computation ──────────────────────────────────────────────────────

export interface SdfBounds {
  min: Vec3;
  max: Vec3;
}

/**
 * Estimate axis-aligned bounding box for an SDF node.
 * Conservative — may overestimate to ensure the level set captures all geometry.
 */
export function estimateSdfBounds(node: SdfNode): SdfBounds {
  switch (node.kind) {
    case 'sdf:sphere': {
      const r = node.radius;
      return { min: [-r, -r, -r], max: [r, r, r] };
    }
    case 'sdf:box': {
      const [hx, hy, hz] = node.halfExtents;
      return { min: [-hx, -hy, -hz], max: [hx, hy, hz] };
    }
    case 'sdf:cylinder': {
      const { height: h, radius: r } = node;
      const hh = h * 0.5;
      return { min: [-r, -hh, -r], max: [r, hh, r] };
    }
    case 'sdf:torus': {
      const R = node.majorRadius + node.minorRadius;
      const r = node.minorRadius;
      return { min: [-R, -r, -R], max: [R, r, R] };
    }
    case 'sdf:capsule': {
      const { height: h, radius: r } = node;
      const hh = h * 0.5 + r;
      return { min: [-r, -hh, -r], max: [r, hh, r] };
    }
    case 'sdf:cone': {
      const { height: h, radius: r } = node;
      return { min: [-r, 0, -r], max: [r, h, r] };
    }

    // Combinators — union of child bounds
    case 'sdf:union':
    case 'sdf:smoothUnion':
    case 'sdf:difference':
    case 'sdf:smoothDifference': {
      const childBounds = node.children.map(estimateSdfBounds);
      const pad = 'radius' in node ? node.radius : 0;
      return unionBounds(childBounds, pad);
    }
    case 'sdf:intersection':
    case 'sdf:smoothIntersection': {
      // Intersection result is bounded by the overlap of child bounds
      const childBounds = node.children.map(estimateSdfBounds);
      const pad = 'radius' in node ? node.radius : 0;
      return intersectBounds(childBounds, pad);
    }
    case 'sdf:morph': {
      return unionBounds([estimateSdfBounds(node.a), estimateSdfBounds(node.b)], 0);
    }

    // Domain ops
    case 'sdf:translate': {
      const b = estimateSdfBounds(node.child);
      const [ox, oy, oz] = node.offset;
      return { min: [b.min[0] + ox, b.min[1] + oy, b.min[2] + oz], max: [b.max[0] + ox, b.max[1] + oy, b.max[2] + oz] };
    }
    case 'sdf:rotate': {
      // Conservative: use bounding sphere of child bounds
      const b = estimateSdfBounds(node.child);
      const r = length3(max(abs(b.min[0]), abs(b.max[0])), max(abs(b.min[1]), abs(b.max[1])), max(abs(b.min[2]), abs(b.max[2])));
      return { min: [-r, -r, -r], max: [r, r, r] };
    }
    case 'sdf:scale': {
      const b = estimateSdfBounds(node.child);
      const s = node.factor;
      return {
        min: [b.min[0] * s, b.min[1] * s, b.min[2] * s],
        max: [b.max[0] * s, b.max[1] * s, b.max[2] * s],
      };
    }
    case 'sdf:twist':
    case 'sdf:bend': {
      // Conservative: use bounding sphere of child
      const b = estimateSdfBounds(node.child);
      const r = length3(max(abs(b.min[0]), abs(b.max[0])), max(abs(b.min[1]), abs(b.max[1])), max(abs(b.min[2]), abs(b.max[2]))) * 1.5;
      return { min: [-r, -r, -r], max: [r, r, r] };
    }
    case 'sdf:repeat': {
      const b = estimateSdfBounds(node.child);
      const [sx, sy, sz] = node.spacing;
      const [cx, cy, cz] = node.count;
      // If infinite (count=0), use a large but finite default
      const expand = (spacing: number, count: number, childMin: number, childMax: number): [number, number] => {
        if (spacing <= 0) return [childMin, childMax];
        const n = count > 0 ? count : 10; // default to 10 reps per side for infinite
        return [childMin - spacing * n, childMax + spacing * n];
      };
      const [xMin, xMax] = expand(sx, cx, b.min[0], b.max[0]);
      const [yMin, yMax] = expand(sy, cy, b.min[1], b.max[1]);
      const [zMin, zMax] = expand(sz, cz, b.min[2], b.max[2]);
      return { min: [xMin, yMin, zMin], max: [xMax, yMax, zMax] };
    }
    case 'sdf:shell': {
      const b = estimateSdfBounds(node.child);
      const t = node.thickness * 0.5;
      return padBounds(b, t);
    }
    case 'sdf:displace': {
      // Can't know displacement amplitude — add generous padding
      const b = estimateSdfBounds(node.child);
      return padBounds(b, 5);
    }
    case 'sdf:onion': {
      const b = estimateSdfBounds(node.child);
      return padBounds(b, node.layers * node.thickness);
    }

    // TPMS — need explicit bounds from user; use a sensible default
    case 'sdf:gyroid':
    case 'sdf:schwarzP':
    case 'sdf:diamond':
    case 'sdf:lidinoid': {
      const s = node.cellSize * 3; // 3 cells in each direction
      return { min: [-s, -s, -s], max: [s, s, s] };
    }

    case 'sdf:spatialBlend': {
      return unionBounds([estimateSdfBounds(node.a), estimateSdfBounds(node.b)], 0);
    }

    // Noise / patterns — infinite fields, use a sensible default
    case 'sdf:noise': {
      // Noise is an infinite field; default to ~6 wavelengths
      const extent = 6 / node.scale;
      return { min: [-extent, -extent, -extent], max: [extent, extent, extent] };
    }
    case 'sdf:voronoi': {
      const s = node.cellSize * 5; // 5 cells in each direction
      return { min: [-s, -s, -s], max: [s, s, s] };
    }

    case 'sdf:custom':
      return { min: [...node.bounds.min], max: [...node.bounds.max] };
  }
}

function unionBounds(bounds: SdfBounds[], pad: number): SdfBounds {
  const result: SdfBounds = {
    min: [Infinity, Infinity, Infinity],
    max: [-Infinity, -Infinity, -Infinity],
  };
  for (const b of bounds) {
    for (let i = 0; i < 3; i++) {
      result.min[i] = min(result.min[i], b.min[i]);
      result.max[i] = max(result.max[i], b.max[i]);
    }
  }
  if (pad > 0) return padBounds(result, pad);
  return result;
}

function intersectBounds(bounds: SdfBounds[], pad: number): SdfBounds {
  const result: SdfBounds = {
    min: [-Infinity, -Infinity, -Infinity],
    max: [Infinity, Infinity, Infinity],
  };
  for (const b of bounds) {
    for (let i = 0; i < 3; i++) {
      result.min[i] = max(result.min[i], b.min[i]);
      result.max[i] = min(result.max[i], b.max[i]);
    }
  }
  // Ensure valid bounds (min < max); if degenerate, fall back to union
  for (let i = 0; i < 3; i++) {
    if (result.min[i] >= result.max[i]) return unionBounds(bounds, pad);
  }
  if (pad > 0) return padBounds(result, pad);
  return result;
}

function padBounds(b: SdfBounds, pad: number): SdfBounds {
  return {
    min: [b.min[0] - pad, b.min[1] - pad, b.min[2] - pad],
    max: [b.max[0] + pad, b.max[1] + pad, b.max[2] + pad],
  };
}

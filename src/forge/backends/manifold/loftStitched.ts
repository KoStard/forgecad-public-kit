import type { Manifold, ManifoldToplevel } from 'manifold-3d';
import { resamplePolygon } from '../../sketch/polygonSampling';

type Vec2 = [number, number];
type Vec3 = [number, number, number];

/**
 * Stitch multiple profiles together using a mesh-solid path.
 *
 * Preconditions (checked before calling this):
 * - profiles.length >= 2
 * - all profiles[k] have the same number of loops
 */
export function loftStitched(profiles: Vec2[][][], heights: number[], wasm: ManifoldToplevel): Manifold | null {
  if (profiles.length < 2) return null;
  const loopCount = profiles[0].length;
  if (loopCount === 0) return null;

  for (let i = 1; i < profiles.length; i++) {
    if (profiles[i].length !== loopCount) return null;
  }

  const manifolds: Manifold[] = [];
  for (let loopIdx = 0; loopIdx < loopCount; loopIdx++) {
    const loopManifold = stitchSingleLoopLoft(
      profiles.map((p) => p[loopIdx]),
      heights,
      wasm,
    );
    if (loopManifold) {
      manifolds.push(loopManifold);
    } else {
      for (const m of manifolds) m.delete();
      return null;
    }
  }

  if (manifolds.length === 0) return null;
  if (manifolds.length === 1) return manifolds[0];

  const combined = wasm.Manifold.union(manifolds);
  for (const m of manifolds) m.delete();
  return combined;
}

function signedArea(loop: Vec2[]): number {
  let area = 0;
  for (let i = 0; i < loop.length; i++) {
    const p1 = loop[i];
    const p2 = loop[(i + 1) % loop.length];
    area += p1[0] * p2[1] - p2[0] * p1[1];
  }
  return area * 0.5;
}

function stitchSingleLoopLoft(loops: Vec2[][], heights: number[], wasm: ManifoldToplevel): Manifold | null {
  // Ensure all loops are CCW
  const normalizedLoops = loops.map((loop) => {
    const area = signedArea(loop);
    return area < 0 ? [...loop].reverse() : loop;
  });

  // 1. Resample all loops to shared vertex count
  let maxPoints = 0;
  for (const loop of normalizedLoops) {
    maxPoints = Math.max(maxPoints, loop.length);
  }
  // Use a reasonable minimum for curves, but respect the input if high.
  const N = Math.max(maxPoints, 24);

  const resampled: Vec3[][] = normalizedLoops.map((loop, i) => {
    const pts2d = resamplePolygon(loop, N);
    const z = heights[i];
    return pts2d.map(([x, y]) => [x, y, z] as Vec3);
  });

  // 2. Build vertices and triangles
  const vertices: number[] = [];
  const triangles: number[] = [];

  // Add all vertices
  for (const layer of resampled) {
    for (const [x, y, z] of layer) {
      vertices.push(x, y, z);
    }
  }

  // Side triangles
  for (let i = 0; i < resampled.length - 1; i++) {
    const baseIdx = i * N;
    const nextIdx = (i + 1) * N;
    for (let j = 0; j < N; j++) {
      const j1 = (j + 1) % N;
      const v0 = baseIdx + j;
      const v1 = nextIdx + j;
      const v2 = nextIdx + j1;
      const v3 = baseIdx + j1;

      // Triangle 1: v0 -> v3 -> v2
      triangles.push(v0, v3, v2);
      // Triangle 2: v0 -> v2 -> v1
      triangles.push(v0, v2, v1);
    }
  }

  // Top/Bottom caps
  // We use wasm.triangulate to handle concave loops safely.

  // Triangulate bottom (flipped normal)
  const bottomResampled2D = resampled[0].map(([x, y]) => [x, y] as Vec2);
  const bottomTrisResampled = wasm.triangulate([bottomResampled2D]);
  for (const tri of bottomTrisResampled) {
    const [v0, v1, v2] = Array.isArray(tri) ? tri : [tri[0], tri[1], tri[2]];
    // CW for facing down (-Z)
    triangles.push(v0, v2, v1);
  }

  // Triangulate top
  const topResampled2D = resampled[resampled.length - 1].map(([x, y]) => [x, y] as Vec2);
  const topTrisResampled = wasm.triangulate([topResampled2D]);
  const topStartIdx = (resampled.length - 1) * N;
  for (const tri of topTrisResampled) {
    const [v0, v1, v2] = Array.isArray(tri) ? tri : [tri[0], tri[1], tri[2]];
    // CCW for facing up (+Z)
    triangles.push(topStartIdx + v0, topStartIdx + v1, topStartIdx + v2);
  }

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(vertices),
    triVerts: new Uint32Array(triangles),
  });

  try {
    const manifold = new wasm.Manifold(mesh);
    return manifold;
  } catch (_e) {
    // Fallback if not manifold (e.g. self-intersections)
    return null;
  }
}

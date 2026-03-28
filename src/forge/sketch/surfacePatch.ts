import { getActiveBackend, getWasm, Shape, setShapeCompilePlan } from '../kernel';
import type { ShapeCompilePlan } from '../compilePlan';
import { wrapManifoldShapeBackend } from '../backends/manifold/shapeBackend';
import { Curve3D } from './curves';

type Vec3 = [number, number, number];

export interface SurfacePatchOptions {
  /** Number of samples along each direction. Default 24. */
  resolution?: number;
  /** Thickness of the generated solid. Default 0.5. */
  thickness?: number;
}

function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function vec3Scale(v: Vec3, s: number): Vec3 {
  return [v[0] * s, v[1] * s, v[2] * s];
}

function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function vec3Len(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function vec3Norm(v: Vec3): Vec3 {
  const len = vec3Len(v);
  if (len < 1e-9) return [0, 0, 1];
  return [v[0] / len, v[1] / len, v[2] / len];
}

/**
 * Sample a point array at a normalized parameter t in [0, 1].
 */
function sampleCurveAtT(points: Vec3[], t: number): Vec3 {
  if (points.length === 0) throw new Error('Empty curve');
  if (points.length === 1) return points[0];

  const tt = Math.max(0, Math.min(1, t));
  const idx = tt * (points.length - 1);
  const i0 = Math.floor(idx);
  const i1 = Math.min(points.length - 1, i0 + 1);
  const f = idx - i0;
  return vec3Add(vec3Scale(points[i0], 1 - f), vec3Scale(points[i1], f));
}

/**
 * Resample a curve to a fixed number of evenly spaced points.
 */
function resampleCurve(input: Curve3D | Vec3[], count: number): Vec3[] {
  const points = input instanceof Curve3D ? input.sample(count) : input;
  if (points.length === count) return points;

  const result: Vec3[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    result.push(sampleCurveAtT(points, t));
  }
  return result;
}

/**
 * Create a smooth surface patch from 4 boundary curves (Coons patch).
 *
 * The four curves form the boundary of a quadrilateral patch:
 * - bottom: u=0..1 at v=0 (from corner00 to corner10)
 * - top: u=0..1 at v=1 (from corner01 to corner11)
 * - left: v=0..1 at u=0 (from corner00 to corner01)
 * - right: v=0..1 at u=1 (from corner10 to corner11)
 *
 * The interior is filled using bilinear Coons patch interpolation:
 * P(u,v) = Lc(u,v) + Ld(u,v) - B(u,v)
 *
 * The result is a thin solid created by offsetting the surface mesh
 * along its normals by the specified thickness.
 *
 * Note: curves should meet at corners. Small gaps are tolerated.
 */
export function surfacePatch(
  curves: {
    bottom: Curve3D | Vec3[];
    top: Curve3D | Vec3[];
    left: Curve3D | Vec3[];
    right: Curve3D | Vec3[];
  },
  options: SurfacePatchOptions = {},
): Shape {
  const resolution = Math.max(3, options.resolution ?? 24);
  const thickness = options.thickness ?? 0.5;

  if (getActiveBackend() === 'occt') {
    throw new Error('surfacePatch() is not yet supported with the OCCT backend. Use the default Manifold backend.');
  }

  // Resample all 4 curves to uniform resolution
  const bottom = resampleCurve(curves.bottom, resolution);
  const top = resampleCurve(curves.top, resolution);
  const left = resampleCurve(curves.left, resolution);
  const right = resampleCurve(curves.right, resolution);

  // Corner points
  const c00 = bottom[0];
  const c10 = bottom[bottom.length - 1];
  const c01 = top[0];
  const c11 = top[top.length - 1];

  // Generate interior points using Coons patch
  const grid: Vec3[][] = [];
  for (let vi = 0; vi < resolution; vi++) {
    const v = vi / (resolution - 1);
    const row: Vec3[] = [];
    for (let ui = 0; ui < resolution; ui++) {
      const u = ui / (resolution - 1);

      // Lc: linear interpolation of bottom and top curves
      const bottomPt = sampleCurveAtT(bottom, u);
      const topPt = sampleCurveAtT(top, u);
      const lc = vec3Add(vec3Scale(bottomPt, 1 - v), vec3Scale(topPt, v));

      // Ld: linear interpolation of left and right curves
      const leftPt = sampleCurveAtT(left, v);
      const rightPt = sampleCurveAtT(right, v);
      const ld = vec3Add(vec3Scale(leftPt, 1 - u), vec3Scale(rightPt, u));

      // B: bilinear interpolation of 4 corners
      const b = vec3Add(
        vec3Add(vec3Scale(c00, (1 - u) * (1 - v)), vec3Scale(c10, u * (1 - v))),
        vec3Add(vec3Scale(c01, (1 - u) * v), vec3Scale(c11, u * v)),
      );

      // Coons patch: P = Lc + Ld - B
      row.push(vec3Sub(vec3Add(lc, ld), b));
    }
    grid.push(row);
  }

  // Compute normals at each grid point
  const gridNormals: Vec3[][] = [];
  for (let vi = 0; vi < resolution; vi++) {
    const normalRow: Vec3[] = [];
    for (let ui = 0; ui < resolution; ui++) {
      const ui0 = Math.max(0, ui - 1);
      const ui1 = Math.min(resolution - 1, ui + 1);
      const vi0 = Math.max(0, vi - 1);
      const vi1 = Math.min(resolution - 1, vi + 1);

      const du = vec3Sub(grid[vi][ui1], grid[vi][ui0]);
      const dv = vec3Sub(grid[vi1][ui], grid[vi0][ui]);
      const n = vec3Norm(vec3Cross(du, dv));
      normalRow.push(n);
    }
    gridNormals.push(normalRow);
  }

  // Build a watertight solid: front face, back face, and side walls
  const vertPositions: number[] = [];
  const triIndices: number[] = [];

  let vertCount = 0;
  function addVert(p: Vec3): number {
    vertPositions.push(p[0], p[1], p[2]);
    return vertCount++;
  }

  // Front face vertices
  const frontVerts: number[][] = [];
  for (let vi = 0; vi < resolution; vi++) {
    const row: number[] = [];
    for (let ui = 0; ui < resolution; ui++) {
      const offset = vec3Scale(gridNormals[vi][ui], thickness / 2);
      row.push(addVert(vec3Add(grid[vi][ui], offset)));
    }
    frontVerts.push(row);
  }

  // Back face vertices
  const backVerts: number[][] = [];
  for (let vi = 0; vi < resolution; vi++) {
    const row: number[] = [];
    for (let ui = 0; ui < resolution; ui++) {
      const offset = vec3Scale(gridNormals[vi][ui], -thickness / 2);
      row.push(addVert(vec3Add(grid[vi][ui], offset)));
    }
    backVerts.push(row);
  }

  // Triangulate front face
  for (let vi = 0; vi < resolution - 1; vi++) {
    for (let ui = 0; ui < resolution - 1; ui++) {
      const a = frontVerts[vi][ui];
      const b = frontVerts[vi][ui + 1];
      const c = frontVerts[vi + 1][ui + 1];
      const d = frontVerts[vi + 1][ui];
      triIndices.push(a, b, c);
      triIndices.push(a, c, d);
    }
  }

  // Triangulate back face (reversed winding)
  for (let vi = 0; vi < resolution - 1; vi++) {
    for (let ui = 0; ui < resolution - 1; ui++) {
      const a = backVerts[vi][ui];
      const b = backVerts[vi][ui + 1];
      const c = backVerts[vi + 1][ui + 1];
      const d = backVerts[vi + 1][ui];
      triIndices.push(a, c, b);
      triIndices.push(a, d, c);
    }
  }

  // Side walls
  // Bottom edge (vi=0)
  for (let ui = 0; ui < resolution - 1; ui++) {
    triIndices.push(frontVerts[0][ui], backVerts[0][ui], backVerts[0][ui + 1]);
    triIndices.push(frontVerts[0][ui], backVerts[0][ui + 1], frontVerts[0][ui + 1]);
  }
  // Top edge (vi=resolution-1)
  for (let ui = 0; ui < resolution - 1; ui++) {
    const vi = resolution - 1;
    triIndices.push(frontVerts[vi][ui], frontVerts[vi][ui + 1], backVerts[vi][ui + 1]);
    triIndices.push(frontVerts[vi][ui], backVerts[vi][ui + 1], backVerts[vi][ui]);
  }
  // Left edge (ui=0)
  for (let vi = 0; vi < resolution - 1; vi++) {
    triIndices.push(frontVerts[vi][0], frontVerts[vi + 1][0], backVerts[vi + 1][0]);
    triIndices.push(frontVerts[vi][0], backVerts[vi + 1][0], backVerts[vi][0]);
  }
  // Right edge (ui=resolution-1)
  for (let vi = 0; vi < resolution - 1; vi++) {
    const ui = resolution - 1;
    triIndices.push(frontVerts[vi][ui], backVerts[vi][ui], backVerts[vi + 1][ui]);
    triIndices.push(frontVerts[vi][ui], backVerts[vi + 1][ui], frontVerts[vi + 1][ui]);
  }

  const wasm = getWasm();

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(vertPositions),
    triVerts: new Uint32Array(triIndices),
  });

  const manifold = new wasm.Manifold(mesh);
  const backend = wrapManifoldShapeBackend(manifold);

  // surfacePatch builds mesh directly — we use importedMesh plan as a sentinel
  // since there's no parametric plan for procedural mesh construction.
  const sentinelPlan: ShapeCompilePlan = {
    kind: 'importedMesh',
    filePath: '<surfacePatch>',
    format: 'stl',
    fileData: new ArrayBuffer(0),
  };

  const shape = new Shape(backend, undefined, {
    fidelity: 'sampled',
    sources: ['surface-patch'],
  });
  setShapeCompilePlan(shape, sentinelPlan);
  return shape;
}

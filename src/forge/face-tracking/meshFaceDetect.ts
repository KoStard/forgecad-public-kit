/**
 * Mesh-based face detection — fallback for shapes without compile-plan face tracking.
 *
 * After boolean ops (`shape.subtract(other)` etc.) the compile plan's face propagation
 * may not cover all canonical face names.  This module detects faces directly from
 * the triangle mesh by clustering coplanar triangles and matching them to canonical
 * names (top / bottom / front / back / left / right) via their normals.
 *
 * It works on any planar-faced mesh — rectilinear solids, extruded profiles, etc.
 * Curved surfaces (sphere, cylinder) are not matched by this fallback; those shapes
 * always have compile plans, so the fallback is not reached for them.
 */

import type { Shape } from '../kernel';
import type { FaceRef } from '../sketch/topology';
import type { Vec3 } from '../transform';

// ─── Math helpers ─────────────────────────────────────────────────────────────

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function normVec3(v: Vec3): Vec3 | null {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-10) return null;
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Compute a tangent frame (u, v) perpendicular to `normal`. */
function tangentFrame(normal: Vec3): { u: Vec3; v: Vec3 } {
  // Choose a reference vector that is not (near-)parallel to normal.
  const ref: Vec3 = Math.abs(normal[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
  const v = normVec3(cross(normal, ref))!;
  const u = normVec3(cross(v, normal))!;
  return { u, v };
}

// ─── Coplanar clustering ───────────────────────────────────────────────────────

/** Tolerance: dot(n1, n2) must exceed this for normals to be considered parallel. */
const NORMAL_COS_EPS = 0.9998; // ≈ 1° angular tolerance
/** Tolerance for plane-offset matching in model units (mm). */
const PLANE_OFFSET_EPS = 0.05;

interface FaceCluster {
  normal: Vec3;
  planeOffset: number;
  centroidSum: Vec3;
  count: number;
}

function clusterMeshFaces(shape: Shape): FaceCluster[] {
  const mesh = shape.getMesh();
  const { triVerts, vertProperties, numProp } = mesh;
  const numTri = triVerts.length / 3;
  const clusters: FaceCluster[] = [];

  for (let i = 0; i < numTri; i++) {
    const i0 = triVerts[i * 3];
    const i1 = triVerts[i * 3 + 1];
    const i2 = triVerts[i * 3 + 2];

    const v0: Vec3 = [vertProperties[i0 * numProp], vertProperties[i0 * numProp + 1], vertProperties[i0 * numProp + 2]];
    const v1: Vec3 = [vertProperties[i1 * numProp], vertProperties[i1 * numProp + 1], vertProperties[i1 * numProp + 2]];
    const v2: Vec3 = [vertProperties[i2 * numProp], vertProperties[i2 * numProp + 1], vertProperties[i2 * numProp + 2]];

    const e1: Vec3 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
    const e2: Vec3 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
    const normal = normVec3(cross(e1, e2));
    if (!normal) continue; // degenerate triangle — skip

    const planeOffset = dot(normal, v0);
    const triCentroid: Vec3 = [(v0[0] + v1[0] + v2[0]) / 3, (v0[1] + v1[1] + v2[1]) / 3, (v0[2] + v1[2] + v2[2]) / 3];

    let merged = false;
    for (const c of clusters) {
      if (dot(c.normal, normal) > NORMAL_COS_EPS && Math.abs(c.planeOffset - planeOffset) < PLANE_OFFSET_EPS) {
        c.centroidSum[0] += triCentroid[0];
        c.centroidSum[1] += triCentroid[1];
        c.centroidSum[2] += triCentroid[2];
        c.count++;
        merged = true;
        break;
      }
    }

    if (!merged) {
      clusters.push({
        normal,
        planeOffset,
        centroidSum: [triCentroid[0], triCentroid[1], triCentroid[2]],
        count: 1,
      });
    }
  }

  return clusters;
}

// ─── Canonical name matching ───────────────────────────────────────────────────

interface CanonicalFaceSpec {
  normal: Vec3;
  /** Which axis centroid to use when multiple matching clusters exist. */
  axis: 0 | 1 | 2;
  /** Whether to pick the cluster with the highest (max) or lowest (min) centroid on that axis. */
  pick: 'max' | 'min';
}

const CANONICAL: Record<string, CanonicalFaceSpec> = {
  top: { normal: [0, 0, 1], axis: 2, pick: 'max' },
  bottom: { normal: [0, 0, -1], axis: 2, pick: 'min' },
  front: { normal: [0, -1, 0], axis: 1, pick: 'min' },
  back: { normal: [0, 1, 0], axis: 1, pick: 'max' },
  left: { normal: [-1, 0, 0], axis: 0, pick: 'min' },
  right: { normal: [1, 0, 0], axis: 0, pick: 'max' },
};

/**
 * Detect a canonical face (top / bottom / front / back / left / right) from
 * a Shape's mesh geometry.  Returns `null` if no matching planar face is found.
 *
 * This is used as a fallback in `Shape.face()` when compile-plan face tracking
 * is unavailable — e.g. on shapes produced by raw boolean ops.
 */
export function detectFaceByName(shape: Shape, name: string): FaceRef | null {
  const spec = CANONICAL[name];
  if (!spec) return null;

  const clusters = clusterMeshFaces(shape);

  // Filter: normal must point within ~1° of the expected direction.
  const matching = clusters.filter((c) => dot(c.normal, spec.normal) > NORMAL_COS_EPS);
  if (matching.length === 0) return null;

  // When multiple matching clusters exist (e.g. two horizontal planes at different Z),
  // pick by centroid position along the relevant axis.
  const best = matching.reduce((prev, curr) => {
    const pa = prev.centroidSum[spec.axis] / prev.count;
    const ca = curr.centroidSum[spec.axis] / curr.count;
    return spec.pick === 'max' ? (ca > pa ? curr : prev) : ca < pa ? curr : prev;
  });

  const center: Vec3 = [best.centroidSum[0] / best.count, best.centroidSum[1] / best.count, best.centroidSum[2] / best.count];

  const { u, v } = tangentFrame(best.normal);

  return {
    name,
    normal: best.normal,
    center,
    planar: true,
    uAxis: u,
    vAxis: v,
  };
}

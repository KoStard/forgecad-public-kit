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
import type { FaceQuery } from './faceQuery';
import { canonicalQuery } from './faceQuery';

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
  area: number;
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
    const rawCross = cross(e1, e2);
    const normal = normVec3(rawCross);
    if (!normal) continue; // degenerate triangle — skip

    // Triangle area = magnitude of cross product / 2
    const crossLen = Math.sqrt(rawCross[0] * rawCross[0] + rawCross[1] * rawCross[1] + rawCross[2] * rawCross[2]);
    const triArea = crossLen / 2;

    const planeOffset = dot(normal, v0);
    const triCentroid: Vec3 = [(v0[0] + v1[0] + v2[0]) / 3, (v0[1] + v1[1] + v2[1]) / 3, (v0[2] + v1[2] + v2[2]) / 3];

    let merged = false;
    for (const c of clusters) {
      if (dot(c.normal, normal) > NORMAL_COS_EPS && Math.abs(c.planeOffset - planeOffset) < PLANE_OFFSET_EPS) {
        c.centroidSum[0] += triCentroid[0];
        c.centroidSum[1] += triCentroid[1];
        c.centroidSum[2] += triCentroid[2];
        c.count++;
        c.area += triArea;
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
        area: triArea,
      });
    }
  }

  return clusters;
}

// ─── Cluster → FaceRef conversion ─────────────────────────────────────────────

function clusterToFaceRef(cluster: FaceCluster, name = ''): FaceRef {
  const center: Vec3 = [
    cluster.centroidSum[0] / cluster.count,
    cluster.centroidSum[1] / cluster.count,
    cluster.centroidSum[2] / cluster.count,
  ];
  const { u, v } = tangentFrame(cluster.normal);
  return {
    name,
    normal: cluster.normal,
    center,
    planar: true,
    uAxis: u,
    vAxis: v,
  };
}

// ─── Query evaluation ─────────────────────────────────────────────────────────

/**
 * Return all faces of `shape` that match the given `FaceQuery`.
 * Each surviving cluster is converted to a `FaceRef`.
 */
export function queryMeshFaces(shape: Shape, query: FaceQuery): FaceRef[] {
  let clusters = clusterMeshFaces(shape);

  // Filter by normal direction
  if (query.normal) {
    const qn = query.normal;
    clusters = clusters.filter((c) => dot(c.normal, qn) > NORMAL_COS_EPS);
  }

  // Filter by planar (all mesh clusters are planar — this is for future-proofing)
  if (query.planar !== false) {
    clusters = clusters.filter((c) => c.normal !== null);
  }

  // Filter by area range
  if (query.area) {
    const { min, max } = query.area;
    if (min !== undefined) clusters = clusters.filter((c) => c.area >= min);
    if (max !== undefined) clusters = clusters.filter((c) => c.area <= max);
  }

  return clusters.map((c) => clusterToFaceRef(c));
}

/**
 * Return the single best face of `shape` matching the given `FaceQuery`,
 * or `null` if no match is found.
 */
export function queryMeshFace(shape: Shape, query: FaceQuery): FaceRef | null {
  let clusters = clusterMeshFaces(shape);

  // Filter by normal direction
  if (query.normal) {
    const qn = query.normal;
    clusters = clusters.filter((c) => dot(c.normal, qn) > NORMAL_COS_EPS);
  }

  // Filter by planar
  if (query.planar !== false) {
    clusters = clusters.filter((c) => c.normal !== null);
  }

  // Filter by area range
  if (query.area) {
    const { min, max } = query.area;
    if (min !== undefined) clusters = clusters.filter((c) => c.area >= min);
    if (max !== undefined) clusters = clusters.filter((c) => c.area <= max);
  }

  if (clusters.length === 0) return null;
  if (clusters.length === 1) return clusterToFaceRef(clusters[0]);

  // Disambiguate via query.pick
  if (query.pick) {
    const pick = query.pick;
    if (pick === 'largest') {
      clusters.sort((a, b) => b.area - a.area);
      return clusterToFaceRef(clusters[0]);
    }
    if (pick === 'smallest') {
      clusters.sort((a, b) => a.area - b.area);
      return clusterToFaceRef(clusters[0]);
    }
    // Axis-based picks: 'max-x' | 'min-x' | 'max-y' | 'min-y' | 'max-z' | 'min-z'
    const axisMap: Record<string, { axis: 0 | 1 | 2; dir: 1 | -1 }> = {
      'max-x': { axis: 0, dir: -1 },
      'min-x': { axis: 0, dir: 1 },
      'max-y': { axis: 1, dir: -1 },
      'min-y': { axis: 1, dir: 1 },
      'max-z': { axis: 2, dir: -1 },
      'min-z': { axis: 2, dir: 1 },
    };
    const spec = axisMap[pick];
    if (spec) {
      clusters.sort((a, b) => {
        const ca = a.centroidSum[spec.axis] / a.count;
        const cb = b.centroidSum[spec.axis] / b.count;
        return spec.dir * (ca - cb);
      });
      return clusterToFaceRef(clusters[0]);
    }
  }

  // Disambiguate via query.nearest (centroid distance)
  if (query.nearest) {
    const pt = query.nearest;
    const is2D = pt.length === 2;
    clusters.sort((a, b) => {
      const ax = a.centroidSum[0] / a.count;
      const ay = a.centroidSum[1] / a.count;
      const az = a.centroidSum[2] / a.count;
      const bx = b.centroidSum[0] / b.count;
      const by = b.centroidSum[1] / b.count;
      const bz = b.centroidSum[2] / b.count;
      const dx_a = ax - pt[0];
      const dy_a = ay - pt[1];
      const dx_b = bx - pt[0];
      const dy_b = by - pt[1];
      const distA = is2D ? dx_a * dx_a + dy_a * dy_a : dx_a * dx_a + dy_a * dy_a + (az - (pt as [number, number, number])[2]) ** 2;
      const distB = is2D ? dx_b * dx_b + dy_b * dy_b : dx_b * dx_b + dy_b * dy_b + (bz - (pt as [number, number, number])[2]) ** 2;
      return distA - distB;
    });
    return clusterToFaceRef(clusters[0]);
  }

  // Disambiguate via query.at (centroid distance, same as nearest for now)
  if (query.at) {
    const pt = query.at;
    clusters.sort((a, b) => {
      const ax = a.centroidSum[0] / a.count - pt[0];
      const ay = a.centroidSum[1] / a.count - pt[1];
      const az = a.centroidSum[2] / a.count - pt[2];
      const bx = b.centroidSum[0] / b.count - pt[0];
      const by = b.centroidSum[1] / b.count - pt[1];
      const bz = b.centroidSum[2] / b.count - pt[2];
      return ax * ax + ay * ay + az * az - (bx * bx + by * by + bz * bz);
    });
    return clusterToFaceRef(clusters[0]);
  }

  // No disambiguation specified — return first by area desc
  clusters.sort((a, b) => b.area - a.area);
  return clusterToFaceRef(clusters[0]);
}

// ─── Canonical name matching ───────────────────────────────────────────────────

/**
 * Detect a canonical face (top / bottom / front / back / left / right) from
 * a Shape's mesh geometry.  Returns `null` if no matching planar face is found.
 *
 * This is used as a fallback in `Shape.face()` when compile-plan face tracking
 * is unavailable — e.g. on shapes produced by raw boolean ops.
 */
export function detectFaceByName(shape: Shape, name: string): FaceRef | null {
  const query = canonicalQuery(name);
  if (!query) return null;
  return queryMeshFace(shape, query);
}

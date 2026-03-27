/**
 * ForgeCAD — Edge Query API
 *
 * Select edges from any Shape by geometric and topological properties.
 * Returns EdgeSegment objects that can be passed to filletEdgeSegment / chamferEdgeSegment.
 */

import { Shape } from '../kernel';
import { type EdgeSegment, extractEdgeSegments, type MeshData } from '../mesh/meshEdgeExtraction';
import { TrackedShape } from '../sketch/topology';
import type { Vec3 } from '../transform';

export type { EdgeSegment } from '../mesh/meshEdgeExtraction';

export interface BoundingRegion {
  xMin?: number;
  xMax?: number;
  yMin?: number;
  yMax?: number;
  zMin?: number;
  zMax?: number;
}

export interface EdgeQuery {
  /** Sort by proximity to this point (closest first). */
  near?: Vec3;
  /** Filter: edge direction approximately parallel to this vector. */
  parallel?: Vec3;
  /** Filter: edge direction approximately perpendicular to this vector. */
  perpendicular?: Vec3;
  /** Filter: only convex (outside corner) edges. */
  convex?: boolean;
  /** Filter: only concave (inside corner) edges. */
  concave?: boolean;
  /** Filter: minimum dihedral angle in degrees. */
  minAngle?: number;
  /** Filter: maximum dihedral angle in degrees. */
  maxAngle?: number;
  /** Filter: minimum edge length. */
  minLength?: number;
  /** Filter: maximum edge length. */
  maxLength?: number;
  /** Filter: edge midpoint must be within this bounding region. */
  within?: BoundingRegion;
  /** Shorthand: edge midpoint Z ≈ this value (within tolerance). */
  atZ?: number;
  /** Tolerance for approximate matches (default: 1.0). */
  tolerance?: number;
  /** Angular tolerance in degrees for parallel/perpendicular (default: 10). */
  angleTolerance?: number;
}

const DEFAULT_TOLERANCE = 1.0;
const DEFAULT_ANGLE_TOLERANCE = 10; // degrees

function unwrapShape(value: Shape | TrackedShape): Shape {
  return value instanceof TrackedShape ? value.toShape() : value;
}

function distSq(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0],
    dy = a[1] - b[1],
    dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

function vecLength(v: Vec3): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

function normalize(v: Vec3): Vec3 {
  const len = vecLength(v);
  if (len < 1e-12) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function absDot(a: Vec3, b: Vec3): number {
  return Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);
}

function getMeshFromShape(shape: Shape): MeshData {
  const mesh = shape.getMesh();
  return {
    numProp: mesh.numProp,
    numTri: mesh.numTri,
    triVerts: mesh.triVerts,
    vertProperties: mesh.vertProperties,
    mergeFromVert: mesh.mergeFromVert,
    mergeToVert: mesh.mergeToVert,
  };
}

function applyFilters(edges: EdgeSegment[], query: EdgeQuery): EdgeSegment[] {
  const tol = query.tolerance ?? DEFAULT_TOLERANCE;
  const angleTol = query.angleTolerance ?? DEFAULT_ANGLE_TOLERANCE;
  const cosAngleTol = Math.cos((angleTol * Math.PI) / 180);

  let result = edges;

  if (query.convex === true) {
    result = result.filter((e) => e.convex);
  }
  if (query.concave === true) {
    result = result.filter((e) => !e.convex);
  }

  if (query.minAngle != null) {
    const min = query.minAngle;
    result = result.filter((e) => e.dihedralAngle >= min);
  }
  if (query.maxAngle != null) {
    const max = query.maxAngle;
    result = result.filter((e) => e.dihedralAngle <= max);
  }

  if (query.minLength != null) {
    const min = query.minLength;
    result = result.filter((e) => e.length >= min);
  }
  if (query.maxLength != null) {
    const max = query.maxLength;
    result = result.filter((e) => e.length <= max);
  }

  if (query.parallel) {
    const dir = normalize(query.parallel);
    result = result.filter((e) => absDot(e.direction, dir) >= cosAngleTol);
  }

  if (query.perpendicular) {
    const dir = normalize(query.perpendicular);
    // Perpendicular means dot ≈ 0, so absDot should be ≤ sin(angleTol)
    const sinAngleTol = Math.sin((angleTol * Math.PI) / 180);
    result = result.filter((e) => absDot(e.direction, dir) <= sinAngleTol);
  }

  if (query.atZ != null) {
    const z = query.atZ;
    result = result.filter((e) => Math.abs(e.midpoint[2] - z) <= tol);
  }

  if (query.within) {
    const b = query.within;
    result = result.filter((e) => {
      const [mx, my, mz] = e.midpoint;
      if (b.xMin != null && mx < b.xMin) return false;
      if (b.xMax != null && mx > b.xMax) return false;
      if (b.yMin != null && my < b.yMin) return false;
      if (b.yMax != null && my > b.yMax) return false;
      if (b.zMin != null && mz < b.zMin) return false;
      if (b.zMax != null && mz > b.zMax) return false;
      return true;
    });
  }

  // Sort by proximity if `near` is specified
  if (query.near) {
    const pt = query.near;
    result = result.slice().sort((a, b) => distSq(a.midpoint, pt) - distSq(b.midpoint, pt));
  }

  return result;
}

/**
 * Select all edges from a shape that match the given query.
 *
 * Extracts sharp edges from the mesh (dihedral angle > 1°), applies filters,
 * and returns the matching EdgeSegment array.
 */
export function selectEdges(shape: Shape | TrackedShape, query: EdgeQuery = {}): EdgeSegment[] {
  const s = unwrapShape(shape);
  const mesh = getMeshFromShape(s);
  const allEdges = extractEdgeSegments(mesh);
  return applyFilters(allEdges, query);
}

/**
 * Select the single best-matching edge from a shape.
 *
 * When `near` is specified, returns the closest matching edge.
 * Otherwise returns the first matching edge (by mesh order).
 * Throws if no edges match.
 */
export function selectEdge(shape: Shape | TrackedShape, query: EdgeQuery = {}): EdgeSegment {
  const edges = selectEdges(shape, query);
  if (edges.length === 0) {
    throw new Error('selectEdge(): no edges match the query.');
  }
  return edges[0];
}

/**
 * Coalesce collinear edge segments into longer logical edges.
 *
 * Multiple short mesh segments along the same line (e.g. from tessellation)
 * are merged into a single EdgeSegment spanning the full extent.
 * The `tolerance` controls how far endpoints can deviate from collinearity.
 */
export function coalesceEdges(segments: EdgeSegment[], tolerance = 0.01): EdgeSegment[] {
  if (segments.length <= 1) return segments;

  // Group by direction (parallel segments within tolerance)
  const used = new Uint8Array(segments.length);
  const result: EdgeSegment[] = [];
  let nextIndex = 0;

  for (let i = 0; i < segments.length; i++) {
    if (used[i]) continue;

    const group = [segments[i]];
    used[i] = 1;
    const dir = segments[i].direction;

    for (let j = i + 1; j < segments.length; j++) {
      if (used[j]) continue;
      // Must be parallel
      if (absDot(dir, segments[j].direction) < 0.999) continue;

      // Must be collinear: the vector from one midpoint to the other
      // must be parallel to the direction
      const dx = segments[j].midpoint[0] - segments[i].midpoint[0];
      const dy = segments[j].midpoint[1] - segments[i].midpoint[1];
      const dz = segments[j].midpoint[2] - segments[i].midpoint[2];
      const dLen = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dLen > 1e-12) {
        const perpDist = Math.sqrt(dLen * dLen - (dx * dir[0] + dy * dir[1] + dz * dir[2]) ** 2);
        if (perpDist > tolerance) continue;
      }

      // Must be adjacent: gap between endpoint of one and start of other ≤ tolerance
      const gap = minEndpointGap(segments[i], segments[j]);
      if (gap > tolerance) {
        // Not directly adjacent, but check if adjacent via existing group members
        let adjToGroup = false;
        for (const g of group) {
          if (minEndpointGap(g, segments[j]) <= tolerance) {
            adjToGroup = true;
            break;
          }
        }
        if (!adjToGroup) continue;
      }

      group.push(segments[j]);
      used[j] = 1;
    }

    if (group.length === 1) {
      result.push(segments[i]);
    } else {
      // Merge: find the two most distant endpoints
      result.push(mergeCollinearGroup(group, nextIndex++));
    }
  }

  return result;
}

function minEndpointGap(a: EdgeSegment, b: EdgeSegment): number {
  return Math.min(
    Math.sqrt(distSq(a.start, b.start)),
    Math.sqrt(distSq(a.start, b.end)),
    Math.sqrt(distSq(a.end, b.start)),
    Math.sqrt(distSq(a.end, b.end)),
  );
}

function mergeCollinearGroup(group: EdgeSegment[], index: number): EdgeSegment {
  // Project all endpoints onto the shared direction axis and find the extremes
  const dir = group[0].direction;
  let minProj = Infinity,
    maxProj = -Infinity;
  let minPt: Vec3 = group[0].start,
    maxPt: Vec3 = group[0].end;

  for (const seg of group) {
    for (const pt of [seg.start, seg.end]) {
      const proj = pt[0] * dir[0] + pt[1] * dir[1] + pt[2] * dir[2];
      if (proj < minProj) {
        minProj = proj;
        minPt = pt;
      }
      if (proj > maxProj) {
        maxProj = proj;
        maxPt = pt;
      }
    }
  }

  const dx = maxPt[0] - minPt[0],
    dy = maxPt[1] - minPt[1],
    dz = maxPt[2] - minPt[2];
  const length = Math.sqrt(dx * dx + dy * dy + dz * dz);
  const invLen = length > 1e-12 ? 1 / length : 0;

  // Average the dihedral angles and normals from the group
  let avgAngle = 0;
  let avgNAx = 0,
    avgNAy = 0,
    avgNAz = 0;
  let avgNBx = 0,
    avgNBy = 0,
    avgNBz = 0;
  let convexCount = 0;
  for (const seg of group) {
    avgAngle += seg.dihedralAngle;
    avgNAx += seg.normalA[0];
    avgNAy += seg.normalA[1];
    avgNAz += seg.normalA[2];
    avgNBx += seg.normalB[0];
    avgNBy += seg.normalB[1];
    avgNBz += seg.normalB[2];
    if (seg.convex) convexCount++;
  }
  const n = group.length;
  avgAngle /= n;

  const nALen = Math.sqrt(avgNAx * avgNAx + avgNAy * avgNAy + avgNAz * avgNAz) || 1;
  const nBLen = Math.sqrt(avgNBx * avgNBx + avgNBy * avgNBy + avgNBz * avgNBz) || 1;

  return {
    index,
    start: [minPt[0], minPt[1], minPt[2]],
    end: [maxPt[0], maxPt[1], maxPt[2]],
    midpoint: [(minPt[0] + maxPt[0]) * 0.5, (minPt[1] + maxPt[1]) * 0.5, (minPt[2] + maxPt[2]) * 0.5],
    direction: [dx * invLen, dy * invLen, dz * invLen],
    length,
    dihedralAngle: avgAngle,
    convex: convexCount > n / 2,
    normalA: [avgNAx / nALen, avgNAy / nALen, avgNAz / nALen],
    normalB: [avgNBx / nBLen, avgNBy / nBLen, avgNBz / nBLen],
    boundary: false,
  };
}

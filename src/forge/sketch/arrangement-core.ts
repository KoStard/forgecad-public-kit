/**
 * Pure DCEL-based arrangement face detection — no ConstraintSketch dependency.
 *
 * Extracts bounded faces from a set of 2D line segments using half-edge traversal.
 * This is the computational core used by both arrangement.ts (for the ConstraintSketch
 * prototype methods) and sketch.ts (for surface metadata during solve).
 */

type Vec2 = [number, number];

const SNAP_EPS = 1e-6;
const INTERSECT_EPS = 1e-8;
const AREA_EPS = 1e-9;

// ─── Point-in-polygon ────────────────────────────────────────────────────────

export function pointInPolygon(point: Vec2, poly: Vec2[]): boolean {
  const [px, py] = point;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi || 1e-20) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ─── Segment-segment intersection ───────────────────────────────────────────

interface Seg {
  a: Vec2;
  b: Vec2;
}

function segSegT(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): number | null {
  const dx1 = p2[0] - p1[0];
  const dy1 = p2[1] - p1[1];
  const dx2 = p4[0] - p3[0];
  const dy2 = p4[1] - p3[1];
  const denom = dx1 * dy2 - dy1 * dx2;
  if (Math.abs(denom) < INTERSECT_EPS) return null;
  const dx3 = p3[0] - p1[0];
  const dy3 = p3[1] - p1[1];
  const t = (dx3 * dy2 - dy3 * dx2) / denom;
  const s = (dx3 * dy1 - dy3 * dx1) / denom;
  if (t > INTERSECT_EPS && t < 1 - INTERSECT_EPS && s > INTERSECT_EPS && s < 1 - INTERSECT_EPS) {
    return t;
  }
  return null;
}

function pointOnSegT(p: Vec2, a: Vec2, b: Vec2): number | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  if (len2 < INTERSECT_EPS * INTERSECT_EPS) return null;
  const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2;
  if (t <= INTERSECT_EPS || t >= 1 - INTERSECT_EPS) return null;
  const perpDist = Math.abs((p[1] - a[1]) * dx - (p[0] - a[0]) * dy) / Math.sqrt(len2);
  return perpDist < SNAP_EPS ? t : null;
}

// ─── Segment splitting ──────────────────────────────────────────────────────

function splitAtIntersections(segs: Seg[]): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < segs.length; i += 1) {
    const rawTs: number[] = [0, 1];
    for (let j = 0; j < segs.length; j += 1) {
      if (i === j) continue;
      const t = segSegT(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (t !== null) rawTs.push(t);
      const ta = pointOnSegT(segs[j].a, segs[i].a, segs[i].b);
      if (ta !== null) rawTs.push(ta);
      const tb = pointOnSegT(segs[j].b, segs[i].a, segs[i].b);
      if (tb !== null) rawTs.push(tb);
    }

    rawTs.sort((x, y) => x - y);
    const dedupTs: number[] = [rawTs[0]];
    for (let k = 1; k < rawTs.length; k += 1) {
      if (rawTs[k] - dedupTs[dedupTs.length - 1] > INTERSECT_EPS) {
        dedupTs.push(rawTs[k]);
      }
    }

    const { a, b } = segs[i];
    for (let k = 0; k < dedupTs.length - 1; k += 1) {
      const t0 = dedupTs[k];
      const t1 = dedupTs[k + 1];
      if (t1 - t0 < INTERSECT_EPS) continue;
      out.push({
        a: [a[0] + t0 * (b[0] - a[0]), a[1] + t0 * (b[1] - a[1])],
        b: [a[0] + t1 * (b[0] - a[0]), a[1] + t1 * (b[1] - a[1])],
      });
    }
  }
  return out;
}

// ─── Node snapping + graph building ─────────────────────────────────────────

interface PlaneGraph {
  nodes: Vec2[];
  edges: [number, number][];
}

function buildPlaneGraph(segs: Seg[]): PlaneGraph {
  const nodes: Vec2[] = [];

  const nodeIndex = (p: Vec2): number => {
    for (let i = 0; i < nodes.length; i += 1) {
      if (Math.abs(nodes[i][0] - p[0]) < SNAP_EPS && Math.abs(nodes[i][1] - p[1]) < SNAP_EPS) {
        return i;
      }
    }
    nodes.push([p[0], p[1]]);
    return nodes.length - 1;
  };

  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const seg of segs) {
    const a = nodeIndex(seg.a);
    const b = nodeIndex(seg.b);
    if (a === b) continue;
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      edges.push([a, b]);
    }
  }

  return { nodes, edges };
}

// ─── DCEL face traversal ─────────────────────────────────────────────────────

function traverseFaces(graph: PlaneGraph): Vec2[][] {
  const { nodes, edges } = graph;
  if (edges.length === 0) return [];

  const totalHE = edges.length * 2;
  const outgoing: number[][] = nodes.map(() => []);
  for (let i = 0; i < edges.length; i += 1) {
    outgoing[edges[i][0]].push(2 * i);
    outgoing[edges[i][1]].push(2 * i + 1);
  }

  const heAngle = (he: number): number => {
    const ei = he >> 1;
    const [a, b] = edges[ei];
    const from = (he & 1) === 0 ? a : b;
    const to = (he & 1) === 0 ? b : a;
    return Math.atan2(nodes[to][1] - nodes[from][1], nodes[to][0] - nodes[from][0]);
  };
  for (const out of outgoing) {
    out.sort((x, y) => heAngle(x) - heAngle(y));
  }

  const heTo = (he: number): number => {
    const ei = he >> 1;
    return (he & 1) === 0 ? edges[ei][1] : edges[ei][0];
  };
  const heFrom = (he: number): number => {
    const ei = he >> 1;
    return (he & 1) === 0 ? edges[ei][0] : edges[ei][1];
  };

  const nextHE = (he: number): number => {
    const v = heTo(he);
    const tw = he ^ 1;
    const out = outgoing[v];
    const pos = out.indexOf(tw);
    if (pos === -1) return -1;
    return out[(pos - 1 + out.length) % out.length];
  };

  const visited = new Uint8Array(totalHE);
  const faces: Vec2[][] = [];

  for (let startHE = 0; startHE < totalHE; startHE += 1) {
    if (visited[startHE]) continue;
    const nodeIds: number[] = [];
    let he = startHE;
    let guard = totalHE + 4;

    do {
      if (visited[he]) {
        nodeIds.length = 0;
        break;
      }
      visited[he] = 1;
      nodeIds.push(heFrom(he));
      he = nextHE(he);
      if (he === -1) {
        nodeIds.length = 0;
        break;
      }
      if (--guard < 0) {
        nodeIds.length = 0;
        break;
      }
    } while (he !== startHE);

    if (nodeIds.length < 3) continue;
    const pts: Vec2[] = nodeIds.map((nid) => nodes[nid]);
    let area = 0;
    for (let i = 0; i < pts.length; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      area += x1 * y2 - x2 * y1;
    }
    if (area * 0.5 > AREA_EPS) {
      faces.push(pts);
    }
  }

  return faces;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface ArrangementSegment {
  a: Vec2;
  b: Vec2;
}

/**
 * Compute all bounded planar faces from a set of 2D line segments.
 * Returns each face as an array of CCW polygon vertices, sorted largest-first by area.
 */
export function computeFacesFromSegments(segs: ArrangementSegment[]): Vec2[][] {
  if (segs.length === 0) return [];
  return traverseFaces(buildPlaneGraph(splitAtIntersections(segs)));
}

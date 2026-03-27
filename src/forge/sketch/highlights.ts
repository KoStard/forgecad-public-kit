/**
 * Programmatic Highlight API for Debugging
 *
 * Allows users to highlight any geometry from their .forge.js code
 * for visual debugging. Highlighted entities render with distinctive styling
 * in the viewport.
 *
 * Usage:
 *   highlight('L0');                                      // sketch entity (backward compat)
 *   highlight([10, 20, 30]);                              // 3D point
 *   highlight([10, 20, 30], { label: 'anchor' });         // labeled point
 *   highlight([[0,0,0], [10,10,10]]);                     // edge (line segment)
 *   highlight({ normal: [0,0,1], offset: 5 });            // plane at z=5
 *   highlight(myShape, { color: 'red' });                 // entire 3D shape
 *   highlight(myTrackedShape);                            // tracked shape
 *   highlight(myTrackedShape.face('top'));                 // face reference
 *   highlight(myTrackedShape.edge('left'));                // edge reference
 */

// ─── 2D Sketch Entity Highlights (existing system) ──────────────────────────

export interface HighlightDef {
  /** Entity ID to highlight (edge, point, surface, circle, arc). */
  entityId: string;
  /** Override color (CSS color string). Default: '#ff00ff' (magenta). */
  color?: string;
  /** Optional label to display near the entity. */
  label?: string;
  /** When true, animate opacity between 0.5 and 1.0 for attention. */
  pulse?: boolean;
}

let collectedHighlights: HighlightDef[] = [];

export function resetHighlights(): void {
  collectedHighlights = [];
  collectedDebugHighlights3D = [];
}

export function getCollectedHighlights(): HighlightDef[] {
  return collectedHighlights;
}

// ─── 3D Debug Highlights (new universal system) ─────────────────────────────

export interface DebugHighlightPoint {
  kind: 'point';
  position: [number, number, number];
  color?: string;
  label?: string;
  pulse?: boolean;
  size?: number;
}

export interface DebugHighlightEdge {
  kind: 'edge';
  start: [number, number, number];
  end: [number, number, number];
  color?: string;
  label?: string;
  pulse?: boolean;
}

export interface DebugHighlightPlane {
  kind: 'plane';
  normal: [number, number, number];
  offset: number;
  color?: string;
  label?: string;
  size?: number;
}

export interface DebugHighlightShape {
  kind: 'shape';
  /** Index of the scene object this shape corresponds to (resolved at collection time). */
  shapeIndex: number;
  color?: string;
  label?: string;
  pulse?: boolean;
}

export type DebugHighlight3D = DebugHighlightPoint | DebugHighlightEdge | DebugHighlightPlane | DebugHighlightShape;

let collectedDebugHighlights3D: DebugHighlight3D[] = [];

/** Track shapes registered for highlight so we can assign indices later. */
let pendingShapeHighlights: { shape: unknown; color?: string; label?: string; pulse?: boolean }[] = [];

export function getCollectedDebugHighlights3D(): DebugHighlight3D[] {
  return collectedDebugHighlights3D;
}

export function getPendingShapeHighlights(): typeof pendingShapeHighlights {
  return pendingShapeHighlights;
}

export function resetPendingShapeHighlights(): void {
  pendingShapeHighlights = [];
}

// ─── Highlight Options ──────────────────────────────────────────────────────

export interface HighlightOptions {
  color?: string;
  label?: string;
  pulse?: boolean;
  /** Size hint for points (radius in mm) or planes (disc radius in mm). */
  size?: number;
}

// ─── Type guards ────────────────────────────────────────────────────────────

type Vec3 = [number, number, number];

function isVec3(v: unknown): v is Vec3 {
  return Array.isArray(v) && v.length === 3 && typeof v[0] === 'number' && typeof v[1] === 'number' && typeof v[2] === 'number';
}

function isEdgePair(v: unknown): v is [Vec3, Vec3] {
  return Array.isArray(v) && v.length === 2 && isVec3(v[0]) && isVec3(v[1]);
}

interface PlaneSpec {
  normal: Vec3;
  offset?: number;
  point?: Vec3;
}

function isPlaneSpec(v: unknown): v is PlaneSpec {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return isVec3(obj.normal) && (typeof obj.offset === 'number' || isVec3(obj.point));
}

interface FaceRefLike {
  normal: Vec3;
  center: Vec3;
  name?: string;
}

function isFaceRef(v: unknown): v is FaceRefLike {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return isVec3(obj.normal) && isVec3(obj.center) && typeof obj.name === 'string';
}

interface EdgeRefLike {
  start: Vec3;
  end: Vec3;
  name?: string;
}

function isEdgeRef(v: unknown): v is EdgeRefLike {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  return isVec3(obj.start) && isVec3(obj.end) && typeof obj.name === 'string';
}

function requireFiniteVec3(v: Vec3, name: string): void {
  for (let i = 0; i < 3; i++) {
    if (!Number.isFinite(v[i])) {
      throw new Error(`highlight(): ${name}[${i}] must be a finite number, got ${v[i]}`);
    }
  }
}

// ─── Shape detection (avoids circular imports) ──────────────────────────────

/** Duck-type check for Shape or TrackedShape instances. */
function isShapeLike(v: unknown): boolean {
  if (typeof v !== 'object' || v === null) return false;
  const obj = v as Record<string, unknown>;
  // Shape has getMesh(), TrackedShape has .shape property with getMesh()
  if (typeof obj.getMesh === 'function') return true;
  if (typeof obj.shape === 'object' && obj.shape !== null && typeof (obj.shape as any).getMesh === 'function') return true;
  return false;
}

// ─── Universal highlight() ──────────────────────────────────────────────────

/**
 * Highlight any geometry for visual debugging in the viewport.
 *
 * Supported inputs:
 * - `string` — sketch entity ID (e.g. `'L0'`, `'P0'`, `'C0'`)
 * - `[x, y, z]` — 3D point
 * - `[[x1,y1,z1], [x2,y2,z2]]` — edge (line segment)
 * - `{ normal: [x,y,z], offset: number }` — plane by normal + distance from origin
 * - `{ normal: [x,y,z], point: [x,y,z] }` — plane by normal + point on plane
 * - `Shape` or `TrackedShape` — highlight entire 3D shape
 * - `FaceRef` (from `shape.face('top')`) — highlight as plane at face center
 * - `EdgeRef` (from `shape.edge('left')`) — highlight as edge segment
 */
export function highlight(target: unknown, opts?: HighlightOptions): void {
  // 1. String → legacy sketch entity ID
  if (typeof target === 'string') {
    if (target.trim().length === 0) {
      throw new Error('highlight() requires a non-empty entity ID string');
    }
    collectedHighlights.push({
      entityId: target.trim(),
      color: opts?.color,
      label: opts?.label,
      pulse: opts?.pulse,
    });
    return;
  }

  // 2. [x, y, z] → 3D point
  if (isVec3(target)) {
    requireFiniteVec3(target, 'point');
    collectedDebugHighlights3D.push({
      kind: 'point',
      position: [target[0], target[1], target[2]],
      color: opts?.color,
      label: opts?.label,
      pulse: opts?.pulse,
      size: opts?.size,
    });
    return;
  }

  // 3. [[x1,y1,z1], [x2,y2,z2]] → edge
  if (isEdgePair(target)) {
    requireFiniteVec3(target[0], 'edge start');
    requireFiniteVec3(target[1], 'edge end');
    collectedDebugHighlights3D.push({
      kind: 'edge',
      start: [target[0][0], target[0][1], target[0][2]],
      end: [target[1][0], target[1][1], target[1][2]],
      color: opts?.color,
      label: opts?.label,
      pulse: opts?.pulse,
    });
    return;
  }

  // 4. EdgeRef → edge from topology
  if (isEdgeRef(target)) {
    requireFiniteVec3(target.start, 'edge start');
    requireFiniteVec3(target.end, 'edge end');
    collectedDebugHighlights3D.push({
      kind: 'edge',
      start: [target.start[0], target.start[1], target.start[2]],
      end: [target.end[0], target.end[1], target.end[2]],
      color: opts?.color,
      label: opts?.label ?? target.name,
      pulse: opts?.pulse,
    });
    return;
  }

  // 5. FaceRef → plane at face center (has both normal and center, plus name)
  if (isFaceRef(target)) {
    requireFiniteVec3(target.normal, 'face normal');
    requireFiniteVec3(target.center, 'face center');
    // Compute offset = dot(normal, center)
    const offset = target.normal[0] * target.center[0] + target.normal[1] * target.center[1] + target.normal[2] * target.center[2];
    collectedDebugHighlights3D.push({
      kind: 'plane',
      normal: [target.normal[0], target.normal[1], target.normal[2]],
      offset,
      color: opts?.color,
      label: opts?.label ?? target.name,
      size: opts?.size,
    });
    return;
  }

  // 6. Plane spec → { normal, offset } or { normal, point }
  if (isPlaneSpec(target)) {
    requireFiniteVec3(target.normal, 'plane normal');
    let offset: number;
    if (typeof target.offset === 'number') {
      if (!Number.isFinite(target.offset)) {
        throw new Error('highlight(): plane offset must be a finite number');
      }
      offset = target.offset;
    } else {
      requireFiniteVec3(target.point!, 'plane point');
      offset = target.normal[0] * target.point![0] + target.normal[1] * target.point![1] + target.normal[2] * target.point![2];
    }
    collectedDebugHighlights3D.push({
      kind: 'plane',
      normal: [target.normal[0], target.normal[1], target.normal[2]],
      offset,
      color: opts?.color,
      label: opts?.label,
      size: opts?.size,
    });
    return;
  }

  // 7. Shape or TrackedShape → highlight entire shape
  if (isShapeLike(target)) {
    pendingShapeHighlights.push({
      shape: target,
      color: opts?.color,
      label: opts?.label,
      pulse: opts?.pulse,
    });
    return;
  }

  throw new Error(
    'highlight() expects a string (sketch entity ID), [x,y,z] point, [[start],[end]] edge, ' +
      '{ normal, offset } plane, FaceRef, EdgeRef, or Shape/TrackedShape. ' +
      `Got: ${typeof target}`,
  );
}

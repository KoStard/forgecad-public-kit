/**
 * 3D Constraint Builder — Bridge to TrackedShape topology
 *
 * Converts TrackedShape face/edge topology into solver-ready RigidBody
 * representations. This is the glue between the existing ecosystem
 * (Assembly + TrackedShape + FaceRef) and the constraint solver.
 *
 * No parallel Assembly class — this builds RigidBodies from existing parts.
 */

import type { Vec3 } from '../transform';
import type { FaceRef } from '../sketch/topology';
import { TrackedShape } from '../sketch/topology';
import { Shape } from '../kernel';
import type { RigidBody, AxisRef3D, PointRef3D, Constraint3D, Constraint3DType, Solve3DOptions, Solve3DResult } from './types';
import { solve3D } from './solver';

// ─── TrackedShape → RigidBody bridge ────────────────────────────────────────

/**
 * Extract a RigidBody from a TrackedShape or Shape.
 * Uses the existing topology (faces, edges) — no duplication.
 */
export function bodyFromTrackedShape(
  id: string,
  shape: TrackedShape | Shape,
  options?: { grounded?: boolean; position?: Vec3; rotation?: Vec3 },
): RigidBody {
  const tracked = shape instanceof TrackedShape ? shape : null;
  const faces = new Map<string, FaceRef>();
  const axes = new Map<string, AxisRef3D>();
  const points = new Map<string, PointRef3D>();

  if (tracked) {
    // Pull faces directly from TrackedShape topology — no duplication
    const topo = tracked.topology;
    if (topo) {
      for (const [name, faceRef] of topo.faces) {
        faces.set(name, faceRef);

        // Auto-derive point from face center
        points.set(`${name}-center`, { position: faceRef.center as Vec3 });

        // Auto-derive axis for non-planar (cylindrical) faces
        // For planar faces, the normal IS the axis direction at the center
        if (faceRef.planar) {
          axes.set(`${name}-normal`, { origin: faceRef.center as Vec3, direction: faceRef.normal as Vec3 });
        }
      }

      // Derive edge midpoints as named points
      for (const [name, edgeRef] of topo.edges) {
        const mid: Vec3 = [
          (edgeRef.start[0] + edgeRef.end[0]) / 2,
          (edgeRef.start[1] + edgeRef.end[1]) / 2,
          (edgeRef.start[2] + edgeRef.end[2]) / 2,
        ];
        points.set(`${name}-mid`, { position: mid });
      }
    }
  }

  return {
    id,
    position: options?.position ? [...options.position] as Vec3 : [0, 0, 0],
    rotation: options?.rotation ? [...options.rotation] as Vec3 : [0, 0, 0],
    grounded: options?.grounded ?? false,
    faces,
    axes,
    points,
  };
}

/**
 * Build a RigidBody from explicit face/axis/point definitions.
 * For cases where you don't have a TrackedShape (test, manual setup).
 */
export function bodyFromRefs(
  id: string,
  refs: {
    faces?: Record<string, { normal: Vec3; center: Vec3 }>;
    axes?: Record<string, { origin: Vec3; direction: Vec3 }>;
    points?: Record<string, { position: Vec3 }>;
  },
  options?: { grounded?: boolean; position?: Vec3; rotation?: Vec3 },
): RigidBody {
  const faces = new Map<string, FaceRef>();
  if (refs.faces) {
    for (const [name, f] of Object.entries(refs.faces)) {
      faces.set(name, { name, normal: f.normal, center: f.center });
    }
  }

  const axes = new Map<string, AxisRef3D>();
  if (refs.axes) {
    for (const [name, a] of Object.entries(refs.axes)) {
      axes.set(name, a);
    }
  }

  const points = new Map<string, PointRef3D>();
  if (refs.points) {
    for (const [name, p] of Object.entries(refs.points)) {
      points.set(name, p);
    }
  }

  return {
    id,
    position: options?.position ? [...options.position] as Vec3 : [0, 0, 0],
    rotation: options?.rotation ? [...options.rotation] as Vec3 : [0, 0, 0],
    grounded: options?.grounded ?? false,
    faces,
    axes,
    points,
  };
}

// ─── Constraint reference parsing ───────────────────────────────────────────

function parseRef(ref: string): { bodyId: string; featureName: string } {
  const colonIdx = ref.indexOf(':');
  if (colonIdx < 0) throw new Error(`Invalid reference "${ref}" — expected "body:feature" format`);
  return {
    bodyId: ref.slice(0, colonIdx),
    featureName: ref.slice(colonIdx + 1),
  };
}

// ─── Constraint list builder ────────────────────────────────────────────────

/** Equation counts per constraint type. */
const CONSTRAINT_EQUATIONS: Record<Constraint3DType, number> = {
  flush: 3, align: 3, parallel: 2, faceDistance: 3,
  concentric: 4, axisParallel: 2, pointCoincident: 3,
  pointOnFace: 1, pointOnAxis: 2, angle: 1, fixed: 0,
};

/**
 * Lightweight constraint list builder.
 * Used by Assembly.mate() to collect constraints, then passed to solve3D().
 */
export class MateBuilder {
  readonly constraints: Constraint3D[] = [];
  private nextId = 1;

  private add(type: Constraint3DType, refA: string, refB: string, value?: number): string {
    const id = `mate_${this.nextId++}`;
    this.constraints.push({ id, type, refA: parseRef(refA), refB: parseRef(refB), value });
    return id;
  }

  flush(faceA: string, faceB: string): string { return this.add('flush', faceA, faceB); }
  align(faceA: string, faceB: string): string { return this.add('align', faceA, faceB); }
  parallel(faceA: string, faceB: string): string { return this.add('parallel', faceA, faceB); }
  faceDistance(faceA: string, faceB: string, distance: number): string { return this.add('faceDistance', faceA, faceB, distance); }
  concentric(axisA: string, axisB: string): string { return this.add('concentric', axisA, axisB); }
  axisParallel(axisA: string, axisB: string): string { return this.add('axisParallel', axisA, axisB); }
  pointCoincident(pointA: string, pointB: string): string { return this.add('pointCoincident', pointA, pointB); }
  pointOnFace(point: string, face: string): string { return this.add('pointOnFace', point, face); }
  pointOnAxis(point: string, axis: string): string { return this.add('pointOnAxis', point, axis); }
  angle(faceA: string, faceB: string, degrees: number): string { return this.add('angle', faceA, faceB, degrees); }

  /** Total constraint equations. */
  get totalEquations(): number {
    return this.constraints.reduce((sum, c) => sum + (CONSTRAINT_EQUATIONS[c.type] ?? 0), 0);
  }
}

// ─── Standalone constrain3d() ───────────────────────────────────────────────

/**
 * Position a moving shape relative to a fixed shape using constraints.
 * Returns the solved transform (position + rotation) for the moving shape.
 *
 * This is the simplest entry point — no Assembly needed.
 *
 * Usage:
 *   const result = constrain3d(
 *     { id: 'plate', body: bodyFromTrackedShape('plate', plate) },
 *     { id: 'bolt', body: bodyFromTrackedShape('bolt', bolt) },
 *     m => {
 *       m.flush('bolt:bottom', 'plate:top');
 *       m.concentric('bolt:center-normal', 'plate:top-normal');
 *     },
 *   );
 */
export function constrain3d(
  fixed: { id: string; body: RigidBody },
  moving: { id: string; body: RigidBody },
  buildConstraints: (m: MateBuilder) => void,
  options?: Solve3DOptions,
): Solve3DResult {
  fixed.body.grounded = true;
  moving.body.grounded = false;

  const bodies = new Map<string, RigidBody>([
    [fixed.id, fixed.body],
    [moving.id, moving.body],
  ]);

  const builder = new MateBuilder();
  buildConstraints(builder);

  return solve3D(bodies, builder.constraints, options);
}

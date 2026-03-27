/**
 * Face-based solid operations — pocket and boss.
 *
 * Both operations work by:
 *   1. Extracting the named face's 2D boundary profile (via intersectWithPlane).
 *   2. Optionally shrinking the profile by `inset` mm or scaling it.
 *   3. Extruding the profile and transforming it into world space aligned with the face.
 *   4. Subtracting (pocket) or adding (boss) the result from/to the base shape.
 *
 * The caller never needs to know about plane frames, worldToPlane matrices, or
 * manual `protrude` offsets — the geometry positions itself automatically.
 *
 * Exposed as methods on Shape and TrackedShape:
 *   shape.pocket('top', 8)
 *   shape.boss('top', 5, { scale: 0.6 })
 */

import { Shape } from './kernel';
import { planeFrameToWorldToPlaneMatrix, resolvePlaneFrame } from './planeFrame';
import { intersectWithPlane } from './section';
import type { Sketch } from './sketch';
import { sketchOffset } from './sketch/operations';
import type { FaceRef } from './sketch/topology';
import { TrackedShape } from './sketch/topology';
import { composeChain, Transform } from './transform';

/** Manifold returns an empty cross-section when sliced at the exact solid boundary.
 *  Slice this far inside the face to guarantee a non-empty profile. */
const FACE_SLICE_EPSILON = 0.001;

/** Extract the face's 2D boundary profile by slicing just inside the solid. */
function extractFaceProfile(rawShape: Shape, face: FaceRef): Sketch {
  const origin: [number, number, number] = [
    face.center[0] - face.normal[0] * FACE_SLICE_EPSILON,
    face.center[1] - face.normal[1] * FACE_SLICE_EPSILON,
    face.center[2] - face.normal[2] * FACE_SLICE_EPSILON,
  ];
  return intersectWithPlane(rawShape, { origin, normal: face.normal });
}

export interface PocketOptions {
  /**
   * Shrink the face boundary inward by this many mm before extruding.
   * Produces angled walls when combined with depth.  Default: 0 (full face).
   */
  inset?: number;
  /**
   * Scale the face profile uniformly (e.g. 0.8 = 80% of the face area).
   * Mutually exclusive with `inset`; `inset` takes precedence if both are set.
   */
  scale?: number;
  /** Corner join style when using `inset`.  Default: 'Round'. */
  join?: 'Square' | 'Round' | 'Miter';
}

export type BossOptions = PocketOptions;

/**
 * Cut a pocket into a solid through the named face.
 *
 * @param rawShape Base solid to cut into.
 * @param faceName Semantic face name, e.g. 'top', 'bottom', 'front'.
 * @param depth    How deep the pocket goes into the solid (mm).
 * @param opts     Optional inset / scale / join overrides.
 *
 * @example
 * // Rectangular pocket, full face width, 8 mm deep:
 * box(100, 100, 20).pocket('top', 8)
 *
 * // Pocket with 5 mm inset from edges:
 * box(100, 100, 20).pocket('top', 8, { inset: 5 })
 *
 * // Pocket at 80 % of face area:
 * box(100, 100, 20).pocket('top', 8, { scale: 0.8 })
 */
function shapePocket(rawShape: Shape, faceName: string, depth: number, opts?: PocketOptions): Shape {
  const faceRef = rawShape.face(faceName);
  const frame = resolvePlaneFrame({ face: faceRef });

  let profile = extractFaceProfile(rawShape, faceRef);
  if (opts?.inset) {
    profile = sketchOffset(profile, -opts.inset, opts.join ?? 'Round');
  } else if (opts?.scale != null && opts.scale !== 1) {
    profile = profile.scale(opts.scale);
  }

  // The extruded tool lives in plane space (face surface = Z=0, outward = +Z).
  // For a pocket we need the tool at Z=-depth to Z=0 (inside the solid).
  // composeChain(A, B) = apply A then B.
  const worldToPlane = planeFrameToWorldToPlaneMatrix(frame);
  const planeToWorld = Transform.from(worldToPlane).inverse();
  const inwardShift = Transform.translation(0, 0, -depth);
  const toolTransform = composeChain(inwardShift, planeToWorld).toArray();

  const tool = profile.extrude(depth).transform(toolTransform);
  return rawShape.subtract(tool);
}

/**
 * Add a boss (protrusion) from the named face.
 *
 * @param rawShape Base solid to protrude from.
 * @param faceName Semantic face name, e.g. 'top', 'bottom', 'front'.
 * @param height   Height of the protrusion above the face (mm).
 * @param opts     Optional inset / scale / join overrides.
 *
 * @example
 * // Full-face boss, 5 mm tall:
 * box(100, 100, 20).boss('top', 5)
 *
 * // Tapered post at 60 % of face area, 10 mm tall:
 * box(100, 100, 20).boss('top', 10, { scale: 0.6 })
 */
function shapeBoss(rawShape: Shape, faceName: string, height: number, opts?: BossOptions): Shape {
  const faceRef = rawShape.face(faceName);
  const frame = resolvePlaneFrame({ face: faceRef });

  let profile = extractFaceProfile(rawShape, faceRef);
  if (opts?.inset) {
    profile = sketchOffset(profile, -opts.inset, opts.join ?? 'Round');
  } else if (opts?.scale != null && opts.scale !== 1) {
    profile = profile.scale(opts.scale);
  }

  // Extrude in plane space: Z=0 (face surface) → Z=+height (outward).
  const worldToPlane = planeFrameToWorldToPlaneMatrix(frame);
  const planeToWorld = Transform.from(worldToPlane).inverse();

  const tool = profile.extrude(height).transform(planeToWorld.toArray());
  return rawShape.add(tool);
}

// ─── Prototype extensions ────────────────────────────────────────────────────

declare module './kernel' {
  interface Shape {
    pocket(faceName: string, depth: number, opts?: PocketOptions): Shape;
    boss(faceName: string, height: number, opts?: BossOptions): Shape;
  }
}

declare module './sketch/topology' {
  interface TrackedShape {
    pocket(faceName: string, depth: number, opts?: PocketOptions): Shape;
    boss(faceName: string, height: number, opts?: BossOptions): Shape;
  }
}

Shape.prototype.pocket = function pocket(faceName: string, depth: number, opts?: PocketOptions): Shape {
  return shapePocket(this, faceName, depth, opts);
};

Shape.prototype.boss = function boss(faceName: string, height: number, opts?: BossOptions): Shape {
  return shapeBoss(this, faceName, height, opts);
};

TrackedShape.prototype.pocket = function pocket(faceName: string, depth: number, opts?: PocketOptions): Shape {
  return shapePocket(this.toShape(), faceName, depth, opts);
};

TrackedShape.prototype.boss = function boss(faceName: string, height: number, opts?: BossOptions): Shape {
  return shapeBoss(this.toShape(), faceName, height, opts);
};

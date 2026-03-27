import { profilePlanFromCrossSection } from './compilePlan';
import { Shape } from './kernel';
import { type PlaneSpec, planeFrameToWorldToPlaneMatrix, resolvePlaneFrame } from './planeFrame';
import { buildProjectionProfileCompilePlan } from './projectionCompile';
import { Sketch } from './sketch';
import { setSketchCompileProfilePlan } from './sketch/core';
import { TrackedShape } from './sketch/topology';

export type { PlaneSpec } from './planeFrame';

/** Accept either a Shape or a TrackedShape, returning the underlying Shape. */
function requireShape(input: Shape | TrackedShape): Shape {
  return input instanceof TrackedShape ? input.toShape() : input;
}

function toPlaneSpace(shape: Shape, plane: PlaneSpec) {
  const frame = resolvePlaneFrame(plane);
  const rotation = planeFrameToWorldToPlaneMatrix(frame);
  return shape.transform(rotation);
}

/** Cross-section: slice a 3D shape with a plane and return the intersection as a 2D Sketch. */
export function intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  const cross = transformed.slice(0);
  return setSketchCompileProfilePlan(new Sketch(cross), profilePlanFromCrossSection(cross));
}

/**
 * Extract the 2D boundary profile of a named face as a Sketch.
 *
 * The returned sketch is in face-local 2D coordinates (origin at the face centre,
 * X/Y aligned with the face's uAxis/vAxis).  It can be offset, scaled, or
 * extruded directly and combined with the original shape via boolean ops.
 *
 * @example
 * const base = box(100, 100, 20);
 * const pocket = faceProfile(base, 'top').offset(-5).extrude(8);
 * // then place + subtract — or use pocket() for a one-liner
 */
/** Depth inside the solid used when slicing a face boundary profile.
 *  Manifold returns an empty cross-section when sliced at the exact boundary
 *  (Z=0 after the worldToPlane transform).  Slicing a hair inside avoids this.
 *  The offset is invisible in any practical output. */
const FACE_SLICE_EPSILON = 0.001;

export function faceProfile(shape: Shape | TrackedShape, faceName: string): Sketch {
  const rawShape = requireShape(shape);
  const face = rawShape.face(faceName);
  // Shift the slice plane slightly inside the solid along the inward normal so
  // Manifold doesn't see an empty cross-section at the exact face boundary.
  const origin: [number, number, number] = [
    face.center[0] - face.normal[0] * FACE_SLICE_EPSILON,
    face.center[1] - face.normal[1] * FACE_SLICE_EPSILON,
    face.center[2] - face.normal[2] * FACE_SLICE_EPSILON,
  ];
  return intersectWithPlane(rawShape, { origin, normal: face.normal });
}

/** Orthographically project a 3D shape onto a plane and return the silhouette as a 2D Sketch. */
export function projectToPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  const cross = transformed.project();
  const sketch = new Sketch(cross);
  const plan = buildProjectionProfileCompilePlan(shape, plane);
  return setSketchCompileProfilePlan(sketch, plan ?? profilePlanFromCrossSection(cross));
}

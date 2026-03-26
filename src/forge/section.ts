import { profilePlanFromCrossSection } from './compilePlan';
import { Shape } from './kernel';
import { type PlaneSpec, planeFrameToWorldToPlaneMatrix, resolvePlaneFrame } from './planeFrame';
import { buildProjectionProfileCompilePlan } from './projectionCompile';
import { Sketch } from './sketch';
import { setSketchCompileProfilePlan } from './sketch/core';

export type { PlaneSpec } from './planeFrame';

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

/** Orthographically project a 3D shape onto a plane and return the silhouette as a 2D Sketch. */
export function projectToPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  const cross = transformed.project();
  const sketch = new Sketch(cross);
  const plan = buildProjectionProfileCompilePlan(shape, plane);
  return setSketchCompileProfilePlan(sketch, plan ?? profilePlanFromCrossSection(cross));
}

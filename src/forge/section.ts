import { Shape } from './kernel';
import { Sketch } from './sketch';
import { buildProjectionProfileCompilePlan } from './projectionCompile';
import { planeFrameToWorldToPlaneMatrix, resolvePlaneFrame, type PlaneSpec } from './planeFrame';
import { setSketchCompileProfilePlan } from './sketch/core';
import { profilePlanFromCrossSection } from './compilePlan';

export type { PlaneSpec } from './planeFrame';

function toPlaneSpace(shape: Shape, plane: PlaneSpec) {
  const frame = resolvePlaneFrame(plane);
  const rotation = planeFrameToWorldToPlaneMatrix(frame);
  return shape
    .transform(rotation);
}

export function intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  const cross = transformed.slice(0);
  return setSketchCompileProfilePlan(new Sketch(cross), profilePlanFromCrossSection(cross));
}

export function projectToPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  const cross = transformed.project();
  const sketch = new Sketch(cross);
  const plan = buildProjectionProfileCompilePlan(shape, plane);
  return setSketchCompileProfilePlan(sketch, plan ?? profilePlanFromCrossSection(cross));
}

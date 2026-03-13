import { Shape } from './kernel';
import { Sketch } from './sketch';
import { buildProjectionProfileCompilePlan } from './projectionCompile';
import { planeFrameToWorldToPlaneMatrix, resolvePlaneFrame, type PlaneSpec } from './planeFrame';
import { setSketchCompileProfilePlan } from './sketch/core';

export type { PlaneSpec } from './planeFrame';

function toPlaneSpace(shape: Shape, plane: PlaneSpec) {
  const frame = resolvePlaneFrame(plane);
  const rotation = planeFrameToWorldToPlaneMatrix(frame);
  return shape
    .transform(rotation);
}

export function intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  return new Sketch(transformed.slice(0));
}

export function projectToPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  const sketch = new Sketch(transformed.project());
  const plan = buildProjectionProfileCompilePlan(shape, plane);
  return plan ? setSketchCompileProfilePlan(sketch, plan) : sketch;
}

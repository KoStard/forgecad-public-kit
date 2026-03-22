import { Shape } from './kernel';
import { Sketch } from './sketch';
import { buildProjectionProfileCompilePlan } from './projectionCompile';
import { planeFrameToWorldToPlaneMatrix, resolvePlaneFrame, type PlaneSpec } from './planeFrame';
import { setSketchCompileProfilePlan } from './sketch/core';
import type { ProfileCompilePlan } from './compilePlan';

export type { PlaneSpec } from './planeFrame';

const OPAQUE_PLAN: ProfileCompilePlan = { kind: 'opaque', transforms: [] };

function toPlaneSpace(shape: Shape, plane: PlaneSpec) {
  const frame = resolvePlaneFrame(plane);
  const rotation = planeFrameToWorldToPlaneMatrix(frame);
  return shape
    .transform(rotation);
}

export function intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  return setSketchCompileProfilePlan(new Sketch(transformed.slice(0)), OPAQUE_PLAN);
}

export function projectToPlane(shape: Shape, plane: PlaneSpec): Sketch {
  const transformed = toPlaneSpace(shape, plane);
  const sketch = new Sketch(transformed.project());
  const plan = buildProjectionProfileCompilePlan(shape, plane);
  return setSketchCompileProfilePlan(sketch, plan ?? OPAQUE_PLAN);
}

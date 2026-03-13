/**
 * Face Transformation History Tracing
 *
 * Exposes the transformation chain that led to each surface.
 */

import type { ShapeCompilePlan, ShapeCompileTransformStep } from './compilePlan';
import type { FaceRef } from './sketch/topology';
import type { FaceQueryRef, ShapeQueryOwner } from './queryModel';

export interface TransformationStep {
  kind: string;
  description: string;
  details?: Record<string, unknown>;
}

export interface FaceTransformationHistory {
  faceName: string;
  origin: {
    operation: string;
    owner?: ShapeQueryOwner;
  };
  transformations: TransformationStep[];
  query?: FaceQueryRef;
}

function describeTransformStep(step: ShapeCompileTransformStep): TransformationStep {
  switch (step.kind) {
    case 'translate':
      return {
        kind: 'translate',
        description: `Translate by [${step.x}, ${step.y}, ${step.z}]`,
        details: { x: step.x, y: step.y, z: step.z },
      };
    case 'rotate':
      return {
        kind: 'rotate',
        description: `Rotate by [${step.xDeg}°, ${step.yDeg}°, ${step.zDeg}°]`,
        details: { xDeg: step.xDeg, yDeg: step.yDeg, zDeg: step.zDeg },
      };
    case 'scale':
      return {
        kind: 'scale',
        description: `Scale by [${step.x}, ${step.y}, ${step.z}]`,
        details: { x: step.x, y: step.y, z: step.z },
      };
    case 'mirror':
      return {
        kind: 'mirror',
        description: `Mirror across plane with normal [${step.normalX}, ${step.normalY}, ${step.normalZ}]`,
        details: { normalX: step.normalX, normalY: step.normalY, normalZ: step.normalZ },
      };
    case 'rotateAround':
      return {
        kind: 'rotateAround',
        description: `Rotate ${step.degrees}° around axis [${step.axisX}, ${step.axisY}, ${step.axisZ}] at pivot [${step.pivotX}, ${step.pivotY}, ${step.pivotZ}]`,
        details: {
          axisX: step.axisX,
          axisY: step.axisY,
          axisZ: step.axisZ,
          degrees: step.degrees,
          pivotX: step.pivotX,
          pivotY: step.pivotY,
          pivotZ: step.pivotZ,
        },
      };
    case 'workplanePlacement':
      return {
        kind: 'workplanePlacement',
        description: `Place on workplane`,
        details: { matrix: step.matrix, placement: step.placement },
      };
  }
}

function tracePlanTransformations(plan: ShapeCompilePlan | null): TransformationStep[] {
  if (!plan) return [];

  const steps: TransformationStep[] = [];

  // Recursively trace through the plan structure
  switch (plan.kind) {
    case 'transform':
      steps.push(...tracePlanTransformations(plan.base));
      steps.push(...plan.steps.map(describeTransformStep));
      break;

    case 'queryOwner':
      steps.push(...tracePlanTransformations(plan.base));
      break;

    case 'boolean':
      // For booleans, trace the first operand (the base)
      if (plan.shapes.length > 0) {
        steps.push(...tracePlanTransformations(plan.shapes[0]));
      }
      break;

    case 'shell':
    case 'hole':
    case 'cut':
    case 'fillet':
    case 'chamfer':
    case 'trimByPlane':
      steps.push(...tracePlanTransformations(plan.base));
      break;

    case 'hull':
      // For hull, we could trace all shapes, but let's just note it's a hull
      break;

    default:
      // Primitives and other operations don't have base transformations
      break;
  }

  return steps;
}

function findOriginOperation(plan: ShapeCompilePlan | null): { operation: string; owner?: ShapeQueryOwner } {
  if (!plan) return { operation: 'unknown' };

  switch (plan.kind) {
    case 'queryOwner':
      return { operation: plan.owner.operation, owner: plan.owner };

    case 'transform':
      return findOriginOperation(plan.base);

    case 'boolean':
      return { operation: `${plan.op} (${plan.shapes.length} operands)` };

    case 'shell':
    case 'hole':
    case 'cut':
    case 'fillet':
    case 'chamfer':
    case 'trimByPlane':
      return findOriginOperation(plan.base);

    default:
      return { operation: plan.kind };
  }
}

export function traceFaceTransformationHistory(
  plan: ShapeCompilePlan | null,
  face: FaceRef,
): FaceTransformationHistory {
  const transformations = tracePlanTransformations(plan);
  const origin = findOriginOperation(plan);

  return {
    faceName: face.name,
    origin,
    transformations,
    query: face.query,
  };
}

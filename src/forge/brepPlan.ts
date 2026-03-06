export type BrepProfileTransformStep =
  | { kind: 'translate'; x: number; y: number }
  | { kind: 'rotate'; degrees: number };

export type BrepProfilePlan =
  | {
      kind: 'rect';
      width: number;
      height: number;
      center: boolean;
      transforms: BrepProfileTransformStep[];
    }
  | {
      kind: 'circle';
      radius: number;
      transforms: BrepProfileTransformStep[];
    };

export type BrepShapeTransformStep =
  | { kind: 'translate'; x: number; y: number; z: number }
  | { kind: 'rotate'; xDeg: number; yDeg: number; zDeg: number };

export type BrepShapePlan =
  | {
      kind: 'box';
      x: number;
      y: number;
      z: number;
      center: boolean;
    }
  | {
      kind: 'cylinder';
      height: number;
      radius: number;
      radiusTop?: number;
      center: boolean;
    }
  | {
      kind: 'sphere';
      radius: number;
    }
  | {
      kind: 'extrude';
      profile: BrepProfilePlan;
      height: number;
      center: boolean;
    }
  | {
      kind: 'revolve';
      profile: BrepProfilePlan;
      degrees: number;
    }
  | {
      kind: 'boolean';
      op: 'union' | 'difference' | 'intersection';
      shapes: BrepShapePlan[];
    }
  | {
      kind: 'transform';
      base: BrepShapePlan;
      steps: BrepShapeTransformStep[];
    };

function cloneProfileTransform(step: BrepProfileTransformStep): BrepProfileTransformStep {
  if (step.kind === 'translate') {
    return { kind: 'translate', x: step.x, y: step.y };
  }
  return { kind: 'rotate', degrees: step.degrees };
}

function cloneShapeTransform(step: BrepShapeTransformStep): BrepShapeTransformStep {
  if (step.kind === 'translate') {
    return { kind: 'translate', x: step.x, y: step.y, z: step.z };
  }
  return {
    kind: 'rotate',
    xDeg: step.xDeg,
    yDeg: step.yDeg,
    zDeg: step.zDeg,
  };
}

export function cloneBrepProfilePlan(plan: BrepProfilePlan | null): BrepProfilePlan | null {
  if (!plan) return null;
  if (plan.kind === 'rect') {
    return {
      kind: 'rect',
      width: plan.width,
      height: plan.height,
      center: plan.center,
      transforms: plan.transforms.map(cloneProfileTransform),
    };
  }
  return {
    kind: 'circle',
    radius: plan.radius,
    transforms: plan.transforms.map(cloneProfileTransform),
  };
}

export function cloneBrepShapePlan(plan: BrepShapePlan | null): BrepShapePlan | null {
  if (!plan) return null;
  switch (plan.kind) {
    case 'box':
      return { kind: 'box', x: plan.x, y: plan.y, z: plan.z, center: plan.center };
    case 'cylinder':
      return {
        kind: 'cylinder',
        height: plan.height,
        radius: plan.radius,
        radiusTop: plan.radiusTop,
        center: plan.center,
      };
    case 'sphere':
      return { kind: 'sphere', radius: plan.radius };
    case 'extrude':
      return {
        kind: 'extrude',
        profile: cloneBrepProfilePlan(plan.profile)!,
        height: plan.height,
        center: plan.center,
      };
    case 'revolve':
      return {
        kind: 'revolve',
        profile: cloneBrepProfilePlan(plan.profile)!,
        degrees: plan.degrees,
      };
    case 'boolean':
      return {
        kind: 'boolean',
        op: plan.op,
        shapes: plan.shapes.map((shape) => cloneBrepShapePlan(shape)!),
      };
    case 'transform':
      return {
        kind: 'transform',
        base: cloneBrepShapePlan(plan.base)!,
        steps: plan.steps.map(cloneShapeTransform),
      };
  }
}

export function appendBrepProfileTransform(
  plan: BrepProfilePlan | null,
  step: BrepProfileTransformStep,
): BrepProfilePlan | null {
  if (!plan) return null;
  const out = cloneBrepProfilePlan(plan)!;
  out.transforms.push(cloneProfileTransform(step));
  return out;
}

export function appendBrepShapeTransform(
  plan: BrepShapePlan | null,
  step: BrepShapeTransformStep,
): BrepShapePlan | null {
  if (!plan) return null;
  if (plan.kind === 'transform') {
    return {
      kind: 'transform',
      base: cloneBrepShapePlan(plan.base)!,
      steps: [...plan.steps.map(cloneShapeTransform), cloneShapeTransform(step)],
    };
  }
  return {
    kind: 'transform',
    base: cloneBrepShapePlan(plan)!,
    steps: [cloneShapeTransform(step)],
  };
}

export function buildBrepBooleanPlan(
  op: 'union' | 'difference' | 'intersection',
  shapes: Array<BrepShapePlan | null>,
): BrepShapePlan | null {
  if (shapes.some((shape) => shape == null)) return null;
  return {
    kind: 'boolean',
    op,
    shapes: shapes.map((shape) => cloneBrepShapePlan(shape)!),
  };
}

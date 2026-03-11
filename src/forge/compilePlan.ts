export type ProfileCompileTransformStep =
  | { kind: 'translate'; x: number; y: number }
  | { kind: 'rotate'; degrees: number }
  | { kind: 'scale'; x: number; y: number }
  | { kind: 'mirror'; normalX: number; normalY: number };

export type ProfileCompilePlan =
  | {
      kind: 'rect';
      width: number;
      height: number;
      center: boolean;
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'roundedRect';
      width: number;
      height: number;
      radius: number;
      center: boolean;
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'circle';
      radius: number;
      segments?: number;
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'polygon';
      points: [number, number][];
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'boolean';
      op: 'union' | 'difference' | 'intersection';
      profiles: ProfileCompilePlan[];
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'offset';
      base: ProfileCompilePlan;
      delta: number;
      join: 'Round';
      transforms: ProfileCompileTransformStep[];
    }
  | {
      kind: 'hull';
      profiles: ProfileCompilePlan[];
      transforms: ProfileCompileTransformStep[];
    };

export type ShapeCompileTransformStep =
  | { kind: 'translate'; x: number; y: number; z: number }
  | { kind: 'rotate'; xDeg: number; yDeg: number; zDeg: number }
  | { kind: 'scale'; x: number; y: number; z: number }
  | {
      kind: 'rotateAround';
      axisX: number;
      axisY: number;
      axisZ: number;
      degrees: number;
      pivotX: number;
      pivotY: number;
      pivotZ: number;
    }
  | {
      kind: 'mirror';
      normalX: number;
      normalY: number;
      normalZ: number;
    };

export type ShapeCompilePlan =
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
      segments?: number;
      center: boolean;
    }
  | {
      kind: 'sphere';
      radius: number;
      segments?: number;
    }
  | {
      kind: 'extrude';
      profile: ProfileCompilePlan;
      height: number;
      center: boolean;
      scaleTop?: [number, number];
    }
  | {
      kind: 'revolve';
      profile: ProfileCompilePlan;
      degrees: number;
      segments?: number;
    }
  | {
      kind: 'boolean';
      op: 'union' | 'difference' | 'intersection';
      shapes: ShapeCompilePlan[];
    }
  | {
      kind: 'transform';
      base: ShapeCompilePlan;
      steps: ShapeCompileTransformStep[];
    }
  | {
      kind: 'hull';
      shapes: ShapeCompilePlan[];
      points: [number, number, number][];
    };

function cloneProfileTransform(step: ProfileCompileTransformStep): ProfileCompileTransformStep {
  switch (step.kind) {
    case 'translate':
      return { kind: 'translate', x: step.x, y: step.y };
    case 'rotate':
      return { kind: 'rotate', degrees: step.degrees };
    case 'scale':
      return { kind: 'scale', x: step.x, y: step.y };
    case 'mirror':
      return { kind: 'mirror', normalX: step.normalX, normalY: step.normalY };
  }
}

function cloneShapeTransform(step: ShapeCompileTransformStep): ShapeCompileTransformStep {
  switch (step.kind) {
    case 'translate':
      return { kind: 'translate', x: step.x, y: step.y, z: step.z };
    case 'rotate':
      return {
        kind: 'rotate',
        xDeg: step.xDeg,
        yDeg: step.yDeg,
        zDeg: step.zDeg,
      };
    case 'scale':
      return {
        kind: 'scale',
        x: step.x,
        y: step.y,
        z: step.z,
      };
    case 'rotateAround':
      return {
        kind: 'rotateAround',
        axisX: step.axisX,
        axisY: step.axisY,
        axisZ: step.axisZ,
        degrees: step.degrees,
        pivotX: step.pivotX,
        pivotY: step.pivotY,
        pivotZ: step.pivotZ,
      };
    case 'mirror':
      return {
        kind: 'mirror',
        normalX: step.normalX,
        normalY: step.normalY,
        normalZ: step.normalZ,
      };
  }
}

export function cloneProfileCompilePlan(plan: ProfileCompilePlan | null): ProfileCompilePlan | null {
  if (!plan) return null;
  switch (plan.kind) {
    case 'rect':
      return {
        kind: 'rect',
        width: plan.width,
        height: plan.height,
        center: plan.center,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'roundedRect':
      return {
        kind: 'roundedRect',
        width: plan.width,
        height: plan.height,
        radius: plan.radius,
        center: plan.center,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'circle':
      return {
        kind: 'circle',
        radius: plan.radius,
        segments: plan.segments,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'polygon':
      return {
        kind: 'polygon',
        points: plan.points.map(([x, y]) => [x, y]),
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'boolean':
      return {
        kind: 'boolean',
        op: plan.op,
        profiles: plan.profiles.map((profile) => cloneProfileCompilePlan(profile)!),
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'offset':
      return {
        kind: 'offset',
        base: cloneProfileCompilePlan(plan.base)!,
        delta: plan.delta,
        join: plan.join,
        transforms: plan.transforms.map(cloneProfileTransform),
      };
    case 'hull':
      return {
        kind: 'hull',
        profiles: plan.profiles.map((profile) => cloneProfileCompilePlan(profile)!),
        transforms: plan.transforms.map(cloneProfileTransform),
      };
  }
}

export function cloneShapeCompilePlan(plan: ShapeCompilePlan | null): ShapeCompilePlan | null {
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
        segments: plan.segments,
        center: plan.center,
      };
    case 'sphere':
      return { kind: 'sphere', radius: plan.radius, segments: plan.segments };
    case 'extrude':
      return {
        kind: 'extrude',
        profile: cloneProfileCompilePlan(plan.profile)!,
        height: plan.height,
        center: plan.center,
        scaleTop: plan.scaleTop ? [plan.scaleTop[0], plan.scaleTop[1]] : undefined,
      };
    case 'revolve':
      return {
        kind: 'revolve',
        profile: cloneProfileCompilePlan(plan.profile)!,
        degrees: plan.degrees,
        segments: plan.segments,
      };
    case 'boolean':
      return {
        kind: 'boolean',
        op: plan.op,
        shapes: plan.shapes.map((shape) => cloneShapeCompilePlan(shape)!),
      };
    case 'transform':
      return {
        kind: 'transform',
        base: cloneShapeCompilePlan(plan.base)!,
        steps: plan.steps.map(cloneShapeTransform),
      };
    case 'hull':
      return {
        kind: 'hull',
        shapes: plan.shapes.map((shape) => cloneShapeCompilePlan(shape)!),
        points: plan.points.map(([x, y, z]) => [x, y, z]),
      };
  }
}

export function appendProfileCompileTransform(
  plan: ProfileCompilePlan | null,
  step: ProfileCompileTransformStep,
): ProfileCompilePlan | null {
  if (!plan) return null;
  const out = cloneProfileCompilePlan(plan)!;
  out.transforms.push(cloneProfileTransform(step));
  return out;
}

export function appendShapeCompileTransform(
  plan: ShapeCompilePlan | null,
  step: ShapeCompileTransformStep,
): ShapeCompilePlan | null {
  if (!plan) return null;
  if (plan.kind === 'transform') {
    return {
      kind: 'transform',
      base: cloneShapeCompilePlan(plan.base)!,
      steps: [...plan.steps.map(cloneShapeTransform), cloneShapeTransform(step)],
    };
  }
  return {
    kind: 'transform',
    base: cloneShapeCompilePlan(plan)!,
    steps: [cloneShapeTransform(step)],
  };
}

export function appendShapeCompileTransforms(
  plan: ShapeCompilePlan | null,
  steps: ShapeCompileTransformStep[],
): ShapeCompilePlan | null {
  let out = cloneShapeCompilePlan(plan);
  for (const step of steps) {
    out = appendShapeCompileTransform(out, step);
  }
  return out;
}

export function buildBooleanShapeCompilePlan(
  op: 'union' | 'difference' | 'intersection',
  shapes: Array<ShapeCompilePlan | null>,
): ShapeCompilePlan | null {
  if (shapes.some((shape) => shape == null)) return null;
  return {
    kind: 'boolean',
    op,
    shapes: shapes.map((shape) => cloneShapeCompilePlan(shape)!),
  };
}

export function buildBooleanProfileCompilePlan(
  op: 'union' | 'difference' | 'intersection',
  profiles: Array<ProfileCompilePlan | null>,
): ProfileCompilePlan | null {
  if (profiles.some((profile) => profile == null)) return null;
  return {
    kind: 'boolean',
    op,
    profiles: profiles.map((profile) => cloneProfileCompilePlan(profile)!),
    transforms: [],
  };
}

export function buildOffsetProfileCompilePlan(
  base: ProfileCompilePlan | null,
  delta: number,
  join: 'Round',
): ProfileCompilePlan | null {
  if (!base) return null;
  return {
    kind: 'offset',
    base: cloneProfileCompilePlan(base)!,
    delta,
    join,
    transforms: [],
  };
}

export function buildHullProfileCompilePlan(
  profiles: Array<ProfileCompilePlan | null>,
): ProfileCompilePlan | null {
  if (profiles.some((profile) => profile == null)) return null;
  return {
    kind: 'hull',
    profiles: profiles.map((profile) => cloneProfileCompilePlan(profile)!),
    transforms: [],
  };
}

export function buildHullShapeCompilePlan(
  shapes: Array<ShapeCompilePlan | null>,
  points: [number, number, number][] = [],
): ShapeCompilePlan | null {
  if (shapes.some((shape) => shape == null)) return null;
  return {
    kind: 'hull',
    shapes: shapes.map((shape) => cloneShapeCompilePlan(shape)!),
    points: points.map(([x, y, z]) => [x, y, z]),
  };
}

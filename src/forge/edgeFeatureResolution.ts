import type { ShapeCompilePlan, ShapeCompileTransformStep } from './compilePlan';
import { shapeQueryOwnersEqual, type EdgeQueryRef, type ShapeQueryOwner } from './queryModel';
import { Transform, type Vec3 } from './transform';
import type { EdgeFeatureResolvedSelector, ResolvedEdgeFeatureSelection } from './edgeFeatureModel';

const EPS = 1e-8;

type EdgeFeatureIssueCode =
  | 'missing-edge-query'
  | 'unsupported-edge-query-kind'
  | 'unsupported-edge-selector'
  | 'missing-edge-owner'
  | 'edge-owner-not-found'
  | 'edge-query-crosses-topology-rewrite'
  | 'unsupported-edge-transform'
  | 'unsupported-edge-base'
  | 'unsupported-edge-name'
  | 'unsupported-edge-profile';

export interface EdgeFeatureResolutionIssue {
  code: EdgeFeatureIssueCode;
  reason: string;
}

type EdgeFeatureResolutionResult =
  | { ok: true; selection: ResolvedEdgeFeatureSelection }
  | { ok: false; issue: EdgeFeatureResolutionIssue };

interface OwnerSearchMatch {
  base: ShapeCompilePlan;
  transform: Transform;
  crossedRewrite: boolean;
}

function midpoint(start: Vec3, end: Vec3): Vec3 {
  return [
    (start[0] + end[0]) * 0.5,
    (start[1] + end[1]) * 0.5,
    (start[2] + end[2]) * 0.5,
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= EPS) throw new Error('Edge feature selection requires a non-zero direction vector');
  return [v[0] / len, v[1] / len, v[2] / len];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function edgeIssue(code: EdgeFeatureIssueCode, reason: string): EdgeFeatureResolutionResult {
  return { ok: false, issue: { code, reason } };
}

function rigidTransformForEdgeStep(step: ShapeCompileTransformStep): Transform | null {
  switch (step.kind) {
    case 'translate':
      return Transform.translation(step.x, step.y, step.z);
    case 'rotate':
      return Transform.identity()
        .rotateAxis([1, 0, 0], step.xDeg)
        .rotateAxis([0, 1, 0], step.yDeg)
        .rotateAxis([0, 0, 1], step.zDeg);
    case 'rotateAround':
      return Transform.rotationAxis(
        [step.axisX, step.axisY, step.axisZ],
        step.degrees,
        [step.pivotX, step.pivotY, step.pivotZ],
      );
    case 'mirror': {
      const [nx0, ny0, nz0] = [step.normalX, step.normalY, step.normalZ];
      const len = Math.hypot(nx0, ny0, nz0);
      if (len <= EPS) return Transform.identity();
      const nx = nx0 / len;
      const ny = ny0 / len;
      const nz = nz0 / len;
      return Transform.from([
        1 - 2 * nx * nx, -2 * ny * nx, -2 * nz * nx, 0,
        -2 * nx * ny, 1 - 2 * ny * ny, -2 * nz * ny, 0,
        -2 * nx * nz, -2 * ny * nz, 1 - 2 * nz * nz, 0,
        0, 0, 0, 1,
      ]);
    }
    case 'workplanePlacement':
      return Transform.from(step.matrix);
    case 'scale':
      return null;
  }
}

function accumulateRigidTransform(
  current: Transform,
  steps: ShapeCompileTransformStep[],
): { transform?: Transform; issue?: EdgeFeatureResolutionIssue } {
  let out = current;
  for (const step of steps) {
    const rigid = rigidTransformForEdgeStep(step);
    if (!rigid) {
      return {
        issue: {
          code: 'unsupported-edge-transform',
          reason: 'Edge finishing currently supports only rigid transforms between the tracked source edge and the target body.',
        },
      };
    }
    out = out.mul(rigid);
  }
  return { transform: out };
}

function searchOwnerMatch(
  plan: ShapeCompilePlan | null,
  owner: ShapeQueryOwner,
  transform: Transform = Transform.identity(),
  crossedRewrite = false,
): { match?: OwnerSearchMatch; issue?: EdgeFeatureResolutionIssue } {
  if (!plan) {
    return {
      issue: {
        code: 'edge-owner-not-found',
        reason: 'The selected tracked edge is not owned by this target shape or any preserved query ancestor.',
      },
    };
  }

  switch (plan.kind) {
    case 'queryOwner':
      if (shapeQueryOwnersEqual(plan.owner, owner)) {
        return {
          match: {
            base: plan.base,
            transform,
            crossedRewrite,
          },
        };
      }
      return searchOwnerMatch(plan.base, owner, transform, crossedRewrite);
    case 'transform': {
      const accumulated = accumulateRigidTransform(transform, plan.steps);
      if (!accumulated.transform) return { issue: accumulated.issue };
      return searchOwnerMatch(plan.base, owner, accumulated.transform, crossedRewrite);
    }
    case 'shell':
    case 'hole':
    case 'cut':
    case 'fillet':
    case 'chamfer':
    case 'trimByPlane':
      return searchOwnerMatch(plan.base, owner, transform, true);
    case 'boolean': {
      for (const shape of plan.shapes) {
        const found = searchOwnerMatch(shape, owner, transform, true);
        if (found.match || found.issue?.code === 'unsupported-edge-transform') return found;
      }
      return {
        issue: {
          code: 'edge-owner-not-found',
          reason: 'The selected tracked edge is not owned by this target shape or any preserved query ancestor.',
        },
      };
    }
    case 'hull': {
      for (const shape of plan.shapes) {
        const found = searchOwnerMatch(shape, owner, transform, true);
        if (found.match || found.issue?.code === 'unsupported-edge-transform') return found;
      }
      return {
        issue: {
          code: 'edge-owner-not-found',
          reason: 'The selected tracked edge is not owned by this target shape or any preserved query ancestor.',
        },
      };
    }
    case 'box':
    case 'cylinder':
    case 'sphere':
    case 'extrude':
    case 'revolve':
    case 'loft':
    case 'sweep':
      return {
        issue: {
          code: 'edge-owner-not-found',
          reason: 'The selected tracked edge is not owned by this target shape or any preserved query ancestor.',
        },
      };
  }
}

function boxEdgeSelection(
  plan: Extract<ShapeCompilePlan, { kind: 'box' }>,
  edgeName: string,
): EdgeFeatureResolutionResult {
  const x0 = plan.center ? -plan.x / 2 : 0;
  const y0 = plan.center ? -plan.y / 2 : 0;
  const z0 = plan.center ? -plan.z / 2 : 0;
  const x1 = x0 + plan.x;
  const y1 = y0 + plan.y;
  const z1 = z0 + plan.z;

  const local = (() => {
    switch (edgeName) {
      case 'vert-bl':
        return { point: [x0, y0, z0] as Vec3, quadrant: [1, -1] as [number, number] };
      case 'vert-br':
        return { point: [x1, y0, z0] as Vec3, quadrant: [-1, -1] as [number, number] };
      case 'vert-tr':
        return { point: [x1, y1, z0] as Vec3, quadrant: [-1, 1] as [number, number] };
      case 'vert-tl':
        return { point: [x0, y1, z0] as Vec3, quadrant: [1, 1] as [number, number] };
      default:
        return null;
    }
  })();

  if (!local) {
    return edgeIssue(
      'unsupported-edge-name',
      `Edge finishing v1 currently supports only tracked vertical rectangle/box edges (${['vert-bl', 'vert-br', 'vert-tr', 'vert-tl'].join(', ')}).`,
    );
  }

  return {
    ok: true,
    selection: {
      kind: 'line-segment',
      edgeName,
      start: [local.point[0], local.point[1], z0],
      end: [local.point[0], local.point[1], z1],
      midpoint: [local.point[0], local.point[1], (z0 + z1) * 0.5],
      axis: [0, 0, 1],
      basisX: [1, 0, 0],
      basisY: [0, -1, 0],
      quadrant: local.quadrant,
    },
  };
}

function isRectangleProfile(points: [number, number][]): boolean {
  if (points.length !== 4) return false;
  const vectors = points.map((point, index) => {
    const next = points[(index + 1) % points.length];
    return [next[0] - point[0], next[1] - point[1]] as [number, number];
  });

  const lengths = vectors.map(([x, y]) => Math.hypot(x, y));
  if (lengths.some((length) => length <= EPS)) return false;

  const dot01 = vectors[0][0] * vectors[1][0] + vectors[0][1] * vectors[1][1];
  const dot12 = vectors[1][0] * vectors[2][0] + vectors[1][1] * vectors[2][1];
  const dot23 = vectors[2][0] * vectors[3][0] + vectors[2][1] * vectors[3][1];
  const dot30 = vectors[3][0] * vectors[0][0] + vectors[3][1] * vectors[0][1];

  const cross02 = vectors[0][0] * vectors[2][1] - vectors[0][1] * vectors[2][0];
  const cross13 = vectors[1][0] * vectors[3][1] - vectors[1][1] * vectors[3][0];

  return Math.abs(dot01) <= 1e-6 * Math.max(1, lengths[0] * lengths[1])
    && Math.abs(dot12) <= 1e-6 * Math.max(1, lengths[1] * lengths[2])
    && Math.abs(dot23) <= 1e-6 * Math.max(1, lengths[2] * lengths[3])
    && Math.abs(dot30) <= 1e-6 * Math.max(1, lengths[3] * lengths[0])
    && Math.abs(cross02) <= 1e-6 * Math.max(1, lengths[0] * lengths[2])
    && Math.abs(cross13) <= 1e-6 * Math.max(1, lengths[1] * lengths[3]);
}

function extrudeEdgeSelection(
  plan: Extract<ShapeCompilePlan, { kind: 'extrude' }>,
  edgeName: string,
): EdgeFeatureResolutionResult {
  if (plan.scaleTop) {
    return edgeIssue(
      'unsupported-edge-base',
      'Edge finishing v1 does not support tapered extrudes (`scaleTop`) yet.',
    );
  }
  if (plan.center) {
    return edgeIssue(
      'unsupported-edge-base',
      'Edge finishing v1 currently supports tracked rectangle extrusions in their normal upward form; centered sketch extrudes are not tracked in the supported subset.',
    );
  }
  if (plan.profile.kind !== 'polygon' || !isRectangleProfile(plan.profile.points)) {
    return edgeIssue(
      'unsupported-edge-profile',
      'Edge finishing v1 currently supports tracked rectangle extrusions only; generic sketch extrudes are outside the supported subset.',
    );
  }

  const index = (() => {
    switch (edgeName) {
      case 'vert-bl':
        return 0;
      case 'vert-br':
        return 1;
      case 'vert-tr':
        return 2;
      case 'vert-tl':
        return 3;
      default:
        return -1;
    }
  })();
  if (index < 0) {
    return edgeIssue(
      'unsupported-edge-name',
      `Edge finishing v1 currently supports only tracked vertical rectangle/box edges (${['vert-bl', 'vert-br', 'vert-tr', 'vert-tl'].join(', ')}).`,
    );
  }

  const points = plan.profile.points;
  const [bl, br, tr, tl] = points;
  const u = normalize([br[0] - bl[0], br[1] - bl[1], 0]);
  const v = normalize([tl[0] - bl[0], tl[1] - bl[1], 0]);
  const vertex = points[index];
  const quadrant = (
    index === 0 ? [1, -1]
      : index === 1 ? [-1, -1]
        : index === 2 ? [-1, 1]
          : [1, 1]
  ) as [number, number];

  return {
    ok: true,
    selection: {
      kind: 'line-segment',
      edgeName,
      start: [vertex[0], vertex[1], 0],
      end: [vertex[0], vertex[1], plan.height],
      midpoint: [vertex[0], vertex[1], plan.height * 0.5],
      axis: [0, 0, 1],
      basisX: [u[0], u[1], u[2]],
      basisY: [-v[0], -v[1], -v[2]],
      quadrant,
    },
  };
}

function applySelectionTransform(
  selection: ResolvedEdgeFeatureSelection,
  transform: Transform,
): ResolvedEdgeFeatureSelection {
  const start = transform.point(selection.start);
  const end = transform.point(selection.end);
  const basisX = normalize(transform.vector(selection.basisX));
  const basisY = normalize(transform.vector(selection.basisY));
  const axis = normalize(subtract(end, start));

  return {
    kind: 'line-segment',
    edgeName: selection.edgeName,
    start,
    end,
    midpoint: midpoint(start, end),
    axis,
    basisX,
    basisY,
    quadrant: [selection.quadrant[0], selection.quadrant[1]],
  };
}

function resolveSelectionFromOwnerBase(
  plan: ShapeCompilePlan,
  edgeName: string,
): EdgeFeatureResolutionResult {
  switch (plan.kind) {
    case 'transform': {
      const base = resolveSelectionFromOwnerBase(plan.base, edgeName);
      if (!base.ok) return base;
      const accumulated = accumulateRigidTransform(Transform.identity(), plan.steps);
      if (!accumulated.transform) return edgeIssue(accumulated.issue!.code, accumulated.issue!.reason);
      return {
        ok: true,
        selection: applySelectionTransform(base.selection, accumulated.transform),
      };
    }
    case 'box':
      return boxEdgeSelection(plan, edgeName);
    case 'extrude':
      return extrudeEdgeSelection(plan, edgeName);
    case 'queryOwner':
      return resolveSelectionFromOwnerBase(plan.base, edgeName);
    case 'fillet':
    case 'chamfer':
    case 'shell':
    case 'hole':
    case 'cut':
    case 'boolean':
    case 'cylinder':
    case 'sphere':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'hull':
    case 'trimByPlane':
      return edgeIssue(
        'unsupported-edge-base',
        'Edge finishing v1 currently supports tracked vertical edges from compile-covered box() bodies and rectangle extrusions before topology-changing edits.',
      );
  }
}

export function resolveSupportedEdgeFeatureSelection(
  plan: ShapeCompilePlan | null,
  ref: EdgeQueryRef | undefined,
): EdgeFeatureResolutionResult {
  if (!ref) {
    return edgeIssue(
      'missing-edge-query',
      'Edge finishing currently requires a tracked edge query from a compile-covered target body.',
    );
  }
  if (ref.kind !== 'tracked-edge') {
    return edgeIssue(
      'unsupported-edge-query-kind',
      'Edge finishing v1 supports only tracked-edge queries from tracked topology, not direct edge refs.',
    );
  }
  if (ref.selector !== 'edge') {
    return edgeIssue(
      'unsupported-edge-selector',
      'Edge finishing v1 currently supports whole-edge selections only; use shape.edge(name), not .start/.end/.midpoint selectors.',
    );
  }
  if (!ref.owner) {
    return edgeIssue(
      'missing-edge-owner',
      'Edge finishing currently requires a tracked edge query with a compiler-owned parent body owner.',
    );
  }

  const found = searchOwnerMatch(plan, ref.owner);
  if (!found.match) {
    if (found.issue) return edgeIssue(found.issue.code, found.issue.reason);
    return edgeIssue(
      'edge-owner-not-found',
      'The selected tracked edge is not owned by this target shape or any preserved query ancestor.',
    );
  }
  if (found.match.crossedRewrite) {
    return edgeIssue(
      'edge-query-crosses-topology-rewrite',
      'Edge finishing v1 does not claim durable edge identity after shell/boolean/hole/cut/edge-finish rewrites; select the edge on the original tracked body before those edits.',
    );
  }

  const base = resolveSelectionFromOwnerBase(found.match.base, ref.edgeName);
  if (!base.ok) return base;
  return {
    ok: true,
    selection: applySelectionTransform(base.selection, found.match.transform),
  };
}

export function selectionToResolvedSelector(
  selection: ResolvedEdgeFeatureSelection,
): EdgeFeatureResolvedSelector {
  return {
    kind: 'line-segment',
    edgeName: selection.edgeName,
    start: [selection.start[0], selection.start[1], selection.start[2]],
    end: [selection.end[0], selection.end[1], selection.end[2]],
    midpoint: [selection.midpoint[0], selection.midpoint[1], selection.midpoint[2]],
  };
}

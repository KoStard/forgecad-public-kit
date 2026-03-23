import { assertExhaustive, type ShapeCompilePlan, type ShapeCompileTransformStep } from './compilePlan';
import type { ShapeEdgeDescendantResolution } from './descendantResolution';
import {
  cloneEdgeQueryRef,
  cloneShapeQueryOwner,
  edgeQueryRefsEqual,
  shapeQueryOwnersEqual,
  type EdgeQueryRef,
  type PropagatedEdgeQueryRef,
  type ShapeQueryOwner,
  type TopologyRewriteEdgeDescendantContract,
} from './queryModel';
import { Transform, type Vec3 } from './transform';
import type { EdgeFeatureResolvedSelector, ResolvedEdgeFeatureSelection } from './edgeFeatureModel';

const EPS = 1e-8;
const SUPPORTED_VERTICAL_EDGE_NAMES = ['vert-bl', 'vert-br', 'vert-tr', 'vert-tl'] as const;
type SupportedVerticalEdgeName = typeof SUPPORTED_VERTICAL_EDGE_NAMES[number];

type EdgeFeatureIssueCode =
  | 'missing-edge-query'
  | 'unsupported-edge-query-kind'
  | 'unsupported-edge-selector'
  | 'missing-edge-owner'
  | 'edge-owner-not-found'
  | 'edge-query-crosses-topology-rewrite'
  | 'edge-query-propagation-mismatch'
  | 'edge-query-ambiguous-after-rewrite'
  | 'edge-query-unsupported-after-rewrite'
  | 'unsupported-edge-transform'
  | 'unsupported-edge-base'
  | 'unsupported-edge-name'
  | 'unsupported-edge-profile';

export interface EdgeFeatureResolutionIssue {
  code: EdgeFeatureIssueCode;
  reason: string;
}

interface ResolvedEdgeFeatureCandidate {
  selection: ResolvedEdgeFeatureSelection;
  query: EdgeQueryRef;
}

type EdgeFeatureResolutionResult =
  | { ok: true; selection: ResolvedEdgeFeatureSelection; query: EdgeQueryRef }
  | { ok: false; issue: EdgeFeatureResolutionIssue };

type EdgeFeatureSelectionResult =
  | { ok: true; selection: ResolvedEdgeFeatureSelection }
  | { ok: false; issue: EdgeFeatureResolutionIssue };

type TopologyRewritePlan = Extract<
  ShapeCompilePlan,
  { kind: 'shell' | 'hole' | 'cut' | 'boolean' | 'trimByPlane' | 'fillet' | 'chamfer' }
>;

type OwnerSearchStep =
  | {
      kind: 'transform';
      steps: ShapeCompileTransformStep[];
    }
  | {
      kind: 'rewrite';
      plan: TopologyRewritePlan;
    };

interface OwnerSearchMatch {
  base: ShapeCompilePlan;
  steps: OwnerSearchStep[];
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

function edgeSuccess(
  selection: ResolvedEdgeFeatureSelection,
  query: EdgeQueryRef,
): EdgeFeatureResolutionResult {
  return {
    ok: true,
    selection,
    query: cloneEdgeQueryRef(query)!,
  };
}

function isSupportedVerticalEdgeName(value: string): value is SupportedVerticalEdgeName {
  return (SUPPORTED_VERTICAL_EDGE_NAMES as readonly string[]).includes(value);
}

function rewriteOperationLabel(plan: TopologyRewritePlan): string {
  switch (plan.kind) {
    case 'boolean':
      return `boolean ${plan.op}`;
    case 'trimByPlane':
      return 'trimByPlane';
    default:
      return plan.kind;
  }
}

function appendOwnerSearchStep(match: OwnerSearchMatch, step: OwnerSearchStep): OwnerSearchMatch {
  return {
    base: match.base,
    steps: [...match.steps, step],
  };
}

function defaultUnsupportedReasonForRewrite(plan: TopologyRewritePlan): string {
  switch (plan.kind) {
    case 'shell':
      return 'This vertical edge is not in the defended post-shell finishing subset: it is adjacent to the shell opening, or the base shape has no tracked vertical edges in the supported set.';
    case 'hole':
      return 'This vertical edge is not in the defended post-hole finishing subset: it is adjacent to a face the hole rewrites, or the base shape has no tracked vertical edges in the supported set.';
    case 'cut':
      return 'This vertical edge is not in the defended post-cut finishing subset: it is adjacent to a face the cut rewrites, or the base shape has no tracked vertical edges in the supported set.';
    case 'boolean':
      return `Edge finishing only accepts propagated edge queries that ${rewriteOperationLabel(plan)} already recorded as supported.`;
    case 'trimByPlane':
      return 'Edge finishing does not yet defend durable edge queries through trimByPlane rewrites.';
    case 'fillet':
    case 'chamfer':
      return `Edge finishing only accepts preserved propagated edge queries after earlier ${plan.kind} rewrites.`;
    default:
      assertExhaustive(plan);
  }
}

function findEdgePropagationDiagnosticMessage(
  plan: TopologyRewritePlan,
  source: EdgeQueryRef,
  query?: EdgeQueryRef,
): string | null {
  const diagnostics = plan.queryPropagation?.diagnostics.filter((entry) => entry.queryKind === 'edge') ?? [];
  const exact = diagnostics.find((entry) =>
    edgeQueryRefsEqual(entry.source as EdgeQueryRef | undefined, source)
    && (query == null || edgeQueryRefsEqual(entry.query as EdgeQueryRef | undefined, query))
  );
  if (exact?.message) return exact.message;

  const bySource = diagnostics.find((entry) =>
    edgeQueryRefsEqual(entry.source as EdgeQueryRef | undefined, source)
  );
  if (bySource?.message) return bySource.message;

  const generic = diagnostics.find((entry) => entry.source == null && entry.query == null);
  return generic?.message ?? null;
}

function findEdgeDescendantContract(
  plan: TopologyRewritePlan,
  query: EdgeQueryRef | undefined,
): TopologyRewriteEdgeDescendantContract | undefined {
  if (!query) return undefined;
  return plan.queryPropagation?.descendants.find((entry): entry is TopologyRewriteEdgeDescendantContract =>
    entry.queryKind === 'edge' && edgeQueryRefsEqual(entry.query, query),
  );
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
            steps: [],
          },
        };
      }
      return searchOwnerMatch(plan.base, owner);
    case 'transform': {
      const found = searchOwnerMatch(plan.base, owner);
      if (!found.match) return found;
      return { match: appendOwnerSearchStep(found.match, { kind: 'transform', steps: plan.steps }) };
    }
    case 'shell':
    case 'hole':
    case 'cut':
    case 'fillet':
    case 'chamfer':
    case 'trimByPlane': {
      const found = searchOwnerMatch(plan.base, owner);
      if (!found.match) return found;
      return { match: appendOwnerSearchStep(found.match, { kind: 'rewrite', plan }) };
    }
    case 'filletEdges':
    case 'chamferEdges':
    case 'draft':
    case 'offsetSolid':
      return searchOwnerMatch(plan.base, owner);
    case 'boolean': {
      for (const shape of plan.shapes) {
        const found = searchOwnerMatch(shape, owner);
        if (found.match) {
          return { match: appendOwnerSearchStep(found.match, { kind: 'rewrite', plan }) };
        }
        if (found.issue?.code === 'unsupported-edge-transform') return found;
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
    case 'torus':
    case 'extrude':
    case 'sheetMetal':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'importedMesh':
      return {
        issue: {
          code: 'edge-owner-not-found',
          reason: 'The selected tracked edge is not owned by this target shape or any preserved query ancestor.',
        },
      };
    default:
      assertExhaustive(plan);
  }
}

function applyTransformStepsToCandidate(
  candidate: ResolvedEdgeFeatureCandidate,
  steps: ShapeCompileTransformStep[],
): EdgeFeatureResolutionResult {
  const accumulated = accumulateRigidTransform(Transform.identity(), steps);
  if (!accumulated.transform) return edgeIssue(accumulated.issue!.code, accumulated.issue!.reason);
  return edgeSuccess(applySelectionTransform(candidate.selection, accumulated.transform), candidate.query);
}

function resolveEdgeQueryAtOwnerBase(
  ownerBase: ShapeCompilePlan,
  ref: EdgeQueryRef,
): EdgeFeatureResolutionResult {
  switch (ref.kind) {
    case 'tracked-edge':
      return resolveTrackedEdgeQueryAtOwnerBase(ownerBase, ref);
    case 'propagated-edge':
      return resolvePropagatedEdgeQueryAtOwnerBase(ownerBase, ref);
    case 'created-edge':
      return edgeIssue(
        'unsupported-edge-query-kind',
        'Edge finishing does not yet support created-edge queries from topology rewrites.',
      );
    case 'edge-ref':
      return edgeIssue(
        'unsupported-edge-query-kind',
        'Edge finishing v1 supports tracked/propagated compiler-owned edge queries only, not direct edge refs.',
      );
  }
}

function resolveTrackedEdgeQueryAtOwnerBase(
  ownerBase: ShapeCompilePlan,
  ref: Extract<EdgeQueryRef, { kind: 'tracked-edge' }>,
): EdgeFeatureResolutionResult {
  const selection = resolveSelectionFromOwnerBase(ownerBase, ref.edgeName);
  if (!selection.ok) return selection;
  return edgeSuccess(selection.selection, ref);
}

function resolveSourceQueryBeforeRewrite(
  plan: TopologyRewritePlan,
  source: EdgeQueryRef,
): EdgeFeatureResolutionResult {
  switch (plan.kind) {
    case 'fillet':
    case 'chamfer':
    case 'shell':
    case 'hole':
    case 'cut':
    case 'trimByPlane':
      return resolveSupportedEdgeFeatureSelection(plan.base, source);
    case 'boolean': {
      let deferred: EdgeFeatureResolutionIssue | null = null;
      for (const shape of plan.shapes) {
        const resolved = resolveSupportedEdgeFeatureSelection(shape, source);
        if (resolved.ok) return resolved;
        if (resolved.issue.code !== 'edge-owner-not-found' && resolved.issue.code !== 'edge-query-propagation-mismatch') {
          deferred ??= resolved.issue;
        }
      }
      if (deferred) return edgeIssue(deferred.code, deferred.reason);
      return edgeIssue(
        'edge-query-propagation-mismatch',
        'The selected propagated edge query does not match the target shape\'s recorded rewrite propagation contract.',
      );
    }
    default:
      assertExhaustive(plan);
  }
}

function propagateCandidateAcrossRewrite(
  plan: TopologyRewritePlan,
  candidate: ResolvedEdgeFeatureCandidate,
): EdgeFeatureResolutionResult {
  const preservedEntry = plan.queryPropagation?.preservedEdges.find((entry) =>
    edgeQueryRefsEqual(entry.query.source, candidate.query)
  );
  if (!preservedEntry) {
    return edgeIssue(
      'edge-query-unsupported-after-rewrite',
      findEdgePropagationDiagnosticMessage(plan, candidate.query)
        ?? defaultUnsupportedReasonForRewrite(plan),
    );
  }
  if (preservedEntry.status !== 'supported' || preservedEntry.query.outcome !== 'preserved') {
    return edgeIssue(
      'edge-query-ambiguous-after-rewrite',
      findEdgePropagationDiagnosticMessage(plan, candidate.query, preservedEntry.query)
        ?? preservedEntry.note
        ?? `The selected edge query is recorded as ${preservedEntry.status} after ${rewriteOperationLabel(plan)} and does not resolve to one defended edge target.`,
    );
  }
  return edgeSuccess(candidate.selection, preservedEntry.query);
}

function resolvePropagatedEdgeQueryAtOwnerBase(
  ownerBase: ShapeCompilePlan,
  ref: PropagatedEdgeQueryRef,
): EdgeFeatureResolutionResult {
  if (
    ownerBase.kind === 'box'
    || ownerBase.kind === 'cylinder'
    || ownerBase.kind === 'sphere'
    || ownerBase.kind === 'extrude'
    || ownerBase.kind === 'sheetMetal'
    || ownerBase.kind === 'revolve'
    || ownerBase.kind === 'loft'
    || ownerBase.kind === 'sweep'
    || ownerBase.kind === 'transform'
    || ownerBase.kind === 'queryOwner'
    || ownerBase.kind === 'filletEdges'
    || ownerBase.kind === 'chamferEdges'
    || ownerBase.kind === 'importedMesh'
  ) {
    return edgeIssue(
      'edge-query-propagation-mismatch',
      'The selected propagated edge query does not point at a topology-rewrite result on this target shape.',
    );
  }

  const propagation = ownerBase.queryPropagation;
  if (!propagation || propagation.rewriteId !== ref.rewriteId) {
    return edgeIssue(
      'edge-query-propagation-mismatch',
      'The selected propagated edge query does not match the target shape\'s recorded rewrite propagation contract.',
    );
  }

  const preservedEntry = propagation.preservedEdges.find((entry) => edgeQueryRefsEqual(entry.query, ref));
  if (!preservedEntry) {
    return edgeIssue(
      'edge-query-propagation-mismatch',
      `The selected propagated edge query is not part of the recorded ${rewriteOperationLabel(ownerBase)} propagation subset for this target shape.`,
    );
  }

  const sourceCandidate = resolveSourceQueryBeforeRewrite(ownerBase, ref.source);
  if (!sourceCandidate.ok) return sourceCandidate;

  const propagated = propagateCandidateAcrossRewrite(ownerBase, {
    selection: sourceCandidate.selection,
    query: sourceCandidate.query,
  });
  if (!propagated.ok) return propagated;
  if (!edgeQueryRefsEqual(propagated.query, ref)) {
    return edgeIssue(
      'edge-query-propagation-mismatch',
      'The selected propagated edge query does not match the target shape\'s recorded rewrite propagation contract.',
    );
  }
  return propagated;
}

function applyOwnerSearchSteps(
  selection: ResolvedEdgeFeatureCandidate,
  steps: OwnerSearchStep[],
): EdgeFeatureResolutionResult {
  let current: EdgeFeatureResolutionResult = edgeSuccess(selection.selection, selection.query);
  for (const step of steps) {
    if (!current.ok) return current;
    current = step.kind === 'transform'
      ? applyTransformStepsToCandidate({ selection: current.selection, query: current.query }, step.steps)
      : propagateCandidateAcrossRewrite(step.plan, { selection: current.selection, query: current.query });
  }
  return current;
}

function deepestTrackedVerticalEdgeSource(
  ref: EdgeQueryRef | undefined,
): { owner: ShapeQueryOwner; edgeName: SupportedVerticalEdgeName } | null {
  if (!ref) return null;
  switch (ref.kind) {
    case 'tracked-edge':
      if (ref.selector !== 'edge' || !ref.owner || !isSupportedVerticalEdgeName(ref.edgeName)) return null;
      return {
        owner: cloneShapeQueryOwner(ref.owner)!,
        edgeName: ref.edgeName,
      };
    case 'propagated-edge':
      return deepestTrackedVerticalEdgeSource(ref.source);
    case 'created-edge':
    case 'edge-ref':
      return null;
  }
}

function boxEdgeSelection(
  plan: Extract<ShapeCompilePlan, { kind: 'box' }>,
  edgeName: string,
): EdgeFeatureSelectionResult {
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
): EdgeFeatureSelectionResult {
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
): EdgeFeatureSelectionResult {
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
    case 'filletEdges':
    case 'chamferEdges':
    case 'draft':
    case 'offsetSolid':
    case 'shell':
    case 'hole':
    case 'cut':
    case 'boolean':
    case 'cylinder':
    case 'sphere':
    case 'torus':
    case 'sheetMetal':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'trimByPlane':
    case 'importedMesh':
      return edgeIssue(
        'unsupported-edge-base',
        'Edge finishing v1 currently supports tracked vertical edges from compile-covered box() bodies and rectangle extrusions before topology-changing edits.',
      );
    default:
      assertExhaustive(plan);
  }
}

export function resolveSupportedEdgeFeatureSelection(
  plan: ShapeCompilePlan | null,
  ref: EdgeQueryRef | undefined,
): EdgeFeatureResolutionResult {
  const descendant = resolveShapeEdgeDescendant(plan, ref);
  if (descendant.kind === 'single') {
    return edgeSuccess(descendant.selection, descendant.query);
  }
  if (descendant.kind === 'edge-chain') {
    return edgeIssue(
      'edge-query-ambiguous-after-rewrite',
      descendant.note
        ?? 'The selected edge resolves to a defended descendant chain, not one single edge target.',
    );
  }
  if (descendant.query == null && ref == null) {
    return edgeIssue(
      'missing-edge-query',
      descendant.reason,
    );
  }
  if (descendant.query == null && ref?.selector && ref.selector !== 'edge') {
    return edgeIssue('unsupported-edge-selector', descendant.reason);
  }
  if (descendant.reason.includes('selector')) {
    return edgeIssue('unsupported-edge-selector', descendant.reason);
  }
  if (descendant.reason.includes('owner')) {
    return edgeIssue('edge-owner-not-found', descendant.reason);
  }
  return edgeIssue('edge-query-unsupported-after-rewrite', descendant.reason);
}

function resolveEdgeChainAtOwnerBase(
  ownerBase: ShapeCompilePlan,
  ref: PropagatedEdgeQueryRef,
): ShapeEdgeDescendantResolution {
  if (
    ownerBase.kind === 'box'
    || ownerBase.kind === 'cylinder'
    || ownerBase.kind === 'sphere'
    || ownerBase.kind === 'extrude'
    || ownerBase.kind === 'sheetMetal'
    || ownerBase.kind === 'revolve'
    || ownerBase.kind === 'loft'
    || ownerBase.kind === 'sweep'
    || ownerBase.kind === 'transform'
    || ownerBase.kind === 'queryOwner'
    || ownerBase.kind === 'filletEdges'
    || ownerBase.kind === 'chamferEdges'
    || ownerBase.kind === 'importedMesh'
  ) {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: 'The selected propagated edge query does not point at a topology-rewrite result on this target shape.',
    };
  }

  const contract = findEdgeDescendantContract(ownerBase, ref);
  if (!contract || contract.kind !== 'edge-chain') {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: 'This target shape does not record a defended descendant edge chain for the selected query.',
    };
  }

  const sourceCandidate = resolveSourceQueryBeforeRewrite(ownerBase, ref.source);
  if (!sourceCandidate.ok) {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: sourceCandidate.issue.reason,
      note: contract.note,
    };
  }

  return {
    kind: 'edge-chain',
    semantic: 'chain',
    query: cloneEdgeQueryRef(ref)!,
    selection: sourceCandidate.selection,
    note: contract.note,
  };
}

function resolveCreatedEdgeChainAtOwnerBase(
  ownerBase: ShapeCompilePlan,
  ref: Extract<EdgeQueryRef, { kind: 'created-edge' }>,
): ShapeEdgeDescendantResolution {
  if (
    ownerBase.kind === 'box'
    || ownerBase.kind === 'cylinder'
    || ownerBase.kind === 'sphere'
    || ownerBase.kind === 'extrude'
    || ownerBase.kind === 'sheetMetal'
    || ownerBase.kind === 'revolve'
    || ownerBase.kind === 'loft'
    || ownerBase.kind === 'sweep'
    || ownerBase.kind === 'transform'
    || ownerBase.kind === 'queryOwner'
    || ownerBase.kind === 'filletEdges'
    || ownerBase.kind === 'chamferEdges'
    || ownerBase.kind === 'importedMesh'
  ) {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: 'The selected created-edge query does not point at a topology-rewrite result on this target shape.',
    };
  }

  const contract = findEdgeDescendantContract(ownerBase, ref);
  if (!contract || contract.kind !== 'edge-chain') {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: 'This target shape does not record a defended descendant edge chain for the selected created-edge query.',
    };
  }

  return {
    kind: 'edge-chain',
    semantic: 'chain',
    query: cloneEdgeQueryRef(ref)!,
    note: contract.note,
  };
}

export function resolveShapeEdgeDescendant(
  plan: ShapeCompilePlan | null,
  ref: EdgeQueryRef | undefined,
): ShapeEdgeDescendantResolution {
  if (!ref) {
    return {
      kind: 'unsupported',
      reason: 'Edge finishing currently requires a tracked edge query from a compile-covered target body.',
    };
  }
  if (ref.selector !== 'edge') {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: 'Edge finishing v1 currently supports whole-edge selections only; use shape.edge(name), not .start/.end/.midpoint selectors.',
    };
  }
  if (ref.kind === 'edge-ref') {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: 'Edge finishing v1 supports compiler-owned tracked-edge, propagated-edge, and inspectable created-edge queries only, not direct edge refs.',
    };
  }
  if (!ref.owner) {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: 'Edge finishing currently requires a tracked edge query with a compiler-owned parent body owner.',
    };
  }

  const found = searchOwnerMatch(plan, ref.owner);
  if (!found.match) {
    return {
      kind: 'unsupported',
      query: cloneEdgeQueryRef(ref),
      reason: found.issue?.reason
        ?? 'The selected tracked edge is not owned by this target shape or any preserved query ancestor.',
    };
  }

  if (ref.kind === 'created-edge') {
    const chain = resolveCreatedEdgeChainAtOwnerBase(found.match.base, ref);
    if (chain.kind === 'unsupported') return chain;
    for (const step of found.match.steps) {
      if (step.kind === 'rewrite') {
        return {
          kind: 'unsupported',
          query: cloneEdgeQueryRef(ref),
          reason: 'Later topology rewrites do not yet preserve this defended created-edge chain as a new downstream chain contract.',
          note: chain.note,
        };
      }
    }
    return chain;
  }

  const base = resolveEdgeQueryAtOwnerBase(found.match.base, ref);
  if (base.ok) {
    const applied = applyOwnerSearchSteps({ selection: base.selection, query: base.query }, found.match.steps);
    if (!applied.ok) {
      return {
        kind: 'unsupported',
        query: cloneEdgeQueryRef(ref),
        reason: applied.issue.reason,
      };
    }
    return {
      kind: 'single',
      semantic: 'edge',
      query: applied.query,
      selection: applied.selection,
    };
  }

  if (ref.kind === 'propagated-edge') {
    const chain = resolveEdgeChainAtOwnerBase(found.match.base, ref);
    if (chain.kind !== 'unsupported') {
      let transformed = chain;
      for (const step of found.match.steps) {
        if (step.kind === 'transform') {
          if (!transformed.selection) {
            continue;
          }
          const applied = applyTransformStepsToCandidate(
            { selection: transformed.selection, query: transformed.query },
            step.steps,
          );
          if (!applied.ok) {
            return {
              kind: 'unsupported',
              query: cloneEdgeQueryRef(ref),
              reason: applied.issue.reason,
              note: transformed.note,
            };
          }
          transformed = {
            ...transformed,
            selection: applied.selection,
            query: applied.query,
          };
          continue;
        }
        return {
          kind: 'unsupported',
          query: cloneEdgeQueryRef(ref),
          reason: 'Later topology rewrites do not yet preserve this defended edge chain as a new downstream chain contract.',
          note: transformed.note,
        };
      }
      return transformed;
    }
  }

  return {
    kind: 'unsupported',
    query: cloneEdgeQueryRef(ref),
    reason: base.issue.reason,
  };
}

export function collectSupportedEdgeFinishPreservedSources(
  plan: ShapeCompilePlan | null,
  selected: EdgeQueryRef | undefined,
): EdgeQueryRef[] {
  if (!plan) return [];
  const trackedSource = deepestTrackedVerticalEdgeSource(selected);
  if (!trackedSource) return [];

  const out: EdgeQueryRef[] = [];
  for (const edgeName of SUPPORTED_VERTICAL_EDGE_NAMES) {
    if (edgeName === trackedSource.edgeName) continue;
    const candidate: EdgeQueryRef = {
      kind: 'tracked-edge',
      edgeName,
      selector: 'edge',
      owner: cloneShapeQueryOwner(trackedSource.owner),
    };
    const resolved = resolveSupportedEdgeFeatureSelection(plan, candidate);
    if (resolved.ok) out.push(resolved.query);
  }
  return out;
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

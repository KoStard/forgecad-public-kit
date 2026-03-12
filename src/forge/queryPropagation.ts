import type { ShapeCompilePlan } from './compilePlan';
import {
  cloneTopologyRewritePropagation,
  type EdgeQueryRef,
  type ShapeQueryOwner,
  type TopologyRewritePropagation,
} from './queryModel';
import type { ShapeWorkplanePlacement } from './sketch/workplaneModel';
import {
  createCreatedEdgeQueryRef,
  createCreatedFaceQueryRef,
  createPropagatedEdgeQueryRef,
  createPropagatedFaceQueryRef,
  createTopologyRewritePropagation,
  createTopologyRewritePropagationDiagnostic,
} from './queryPropagationCore';
export { buildBooleanTopologyRewritePropagation } from './booleanQueryPropagation';

type TopologyRewriteNodeKind =
  | 'shell'
  | 'hole'
  | 'cut'
  | 'boolean'
  | 'hull'
  | 'trimByPlane'
  | 'fillet'
  | 'chamfer';

type TopologyRewriteShapeCompilePlan = Extract<ShapeCompilePlan, { kind: TopologyRewriteNodeKind }>;

export function buildShellTopologyRewritePropagation(
  owner: ShapeQueryOwner,
  openFaces: Array<'top' | 'bottom'>,
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('shell', owner);
  const openingText = openFaces.length > 0 ? ` Open faces: ${openFaces.join(', ')}.` : '';
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(
      'shell-face-propagation-ambiguous',
      'ambiguous',
      'face',
      `Shell rewrites result faces, but durable face-query propagation is not defended yet.${openingText}`,
    ),
    createTopologyRewritePropagationDiagnostic(
      'shell-edge-propagation-ambiguous',
      'ambiguous',
      'edge',
      'Shell rewrites result edges, but durable edge-query propagation is not defended yet.',
    ),
  );
  return propagation;
}

export function buildHoleTopologyRewritePropagation(
  owner: ShapeQueryOwner,
  placement: ShapeWorkplanePlacement['placement'],
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('hole', owner);
  const propagated = createPropagatedFaceQueryRef(placement.workplane.source, owner, 'split');
  propagation.preservedFaces.push({
    query: propagated,
    status: 'ambiguous',
    note: 'The selected host face survives only as a split descendant set after the hole lands.',
  });
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(
      'hole-source-face-split-ambiguous',
      'ambiguous',
      'face',
      'Hole intent records that the selected host face is split, but the surviving descendants are not uniquely queryable yet.',
      placement.workplane.source,
      propagated,
    ),
    createTopologyRewritePropagationDiagnostic(
      'hole-created-edge-propagation-unsupported',
      'unsupported',
      'edge',
      'Hole-created edge semantics are not part of the topology-rewrite kernel yet.',
    ),
  );
  return propagation;
}

export function buildCutTopologyRewritePropagation(
  owner: ShapeQueryOwner,
  placement: ShapeWorkplanePlacement['placement'],
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('cut', owner);
  const propagated = createPropagatedFaceQueryRef(placement.workplane.source, owner, 'split');
  propagation.preservedFaces.push({
    query: propagated,
    status: 'ambiguous',
    note: 'The selected host face is split by the cut profile, so the surviving descendants are still ambiguous.',
  });
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(
      'cut-source-face-split-ambiguous',
      'ambiguous',
      'face',
      'Cut intent records that the selected host face is split, but the surviving descendants are not uniquely queryable yet.',
      placement.workplane.source,
      propagated,
    ),
    createTopologyRewritePropagationDiagnostic(
      'cut-created-edge-propagation-unsupported',
      'unsupported',
      'edge',
      'Cut-created edge semantics are not part of the topology-rewrite kernel yet.',
    ),
  );
  return propagation;
}

export function buildHullTopologyRewritePropagation(owner: ShapeQueryOwner): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('hull', owner);
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(
      'hull-face-propagation-unsupported',
      'unsupported',
      'face',
      'Hull combines source solids through a full topology rewrite, so face-query propagation is not defended yet.',
    ),
    createTopologyRewritePropagationDiagnostic(
      'hull-edge-propagation-unsupported',
      'unsupported',
      'edge',
      'Hull combines source solids through a full topology rewrite, so edge-query propagation is not defended yet.',
    ),
  );
  return propagation;
}

export function buildTrimByPlaneTopologyRewritePropagation(owner: ShapeQueryOwner): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('trimByPlane', owner);
  propagation.createdFaces.push({
    query: createCreatedFaceQueryRef(owner, 'trimByPlane', 'plane-cap'),
    note: 'The kept side of the trim introduces one deterministic cap face on the trim plane.',
  });
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(
      'trim-by-plane-preserved-face-propagation-ambiguous',
      'ambiguous',
      'face',
      'Trim-by-plane now exposes its created plane-cap face, but preserved non-cap face propagation is still ambiguous.',
    ),
    createTopologyRewritePropagationDiagnostic(
      'trim-by-plane-edge-propagation-ambiguous',
      'ambiguous',
      'edge',
      'Trim-by-plane boundary edge propagation is not defended yet.',
    ),
  );
  return propagation;
}

export function buildEdgeFeatureTopologyRewritePropagation(
  operation: 'fillet' | 'chamfer',
  owner: ShapeQueryOwner,
  edge: EdgeQueryRef | undefined,
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation(operation, owner);
  if (edge) {
    const propagated = createPropagatedEdgeQueryRef(edge, owner, 'merged');
    propagation.preservedEdges.push({
      query: propagated,
      status: 'ambiguous',
      note: `${operation} rewrites the selected edge into a blended descendant set rather than one defended edge target.`,
    });
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        `${operation}-selected-edge-merged-ambiguous`,
        'ambiguous',
        'edge',
        `${operation} records that the selected edge is merged into rewritten descendants, but a durable post-rewrite edge target is not defended yet.`,
        edge,
        propagated,
      ),
    );
  }
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(
      `${operation}-created-face-propagation-unsupported`,
      'unsupported',
      'face',
      `${operation}-created face semantics are not part of the topology-rewrite kernel yet.`,
    ),
  );
  return propagation;
}

function isTopologyRewriteShapeCompilePlan(plan: ShapeCompilePlan): plan is TopologyRewriteShapeCompilePlan {
  return plan.kind === 'shell'
    || plan.kind === 'hole'
    || plan.kind === 'cut'
    || plan.kind === 'boolean'
    || plan.kind === 'hull'
    || plan.kind === 'trimByPlane'
    || plan.kind === 'fillet'
    || plan.kind === 'chamfer';
}

function cloneNodeWithPropagation(
  plan: TopologyRewriteShapeCompilePlan,
  propagation: TopologyRewritePropagation,
): TopologyRewriteShapeCompilePlan {
  return {
    ...plan,
    queryPropagation: cloneTopologyRewritePropagation(propagation),
  };
}

export function attachTopologyRewritePropagation<T extends ShapeCompilePlan | null>(
  plan: T,
  propagation: TopologyRewritePropagation,
): T {
  if (!plan) return plan;
  if (!isTopologyRewriteShapeCompilePlan(plan)) {
    throw new Error(`Cannot attach topology-rewrite propagation to non-rewrite plan kind "${plan.kind}".`);
  }
  return cloneNodeWithPropagation(plan, propagation) as T;
}

function nodePropagation(plan: TopologyRewriteShapeCompilePlan): TopologyRewritePropagation | null {
  return cloneTopologyRewritePropagation(plan.queryPropagation) ?? null;
}

export function findShapeTopologyRewritePropagation(
  plan: ShapeCompilePlan | null,
): TopologyRewritePropagation | null {
  if (!plan) return null;

  switch (plan.kind) {
    case 'queryOwner':
    case 'transform':
      return findShapeTopologyRewritePropagation(plan.base);
    case 'shell':
    case 'hole':
    case 'cut':
    case 'boolean':
    case 'hull':
    case 'trimByPlane':
    case 'fillet':
    case 'chamfer':
      return nodePropagation(plan);
    case 'box':
    case 'cylinder':
    case 'sphere':
    case 'extrude':
    case 'revolve':
    case 'loft':
    case 'sweep':
      return null;
  }
}

export function collectShapeTopologyRewritePropagations(
  plan: ShapeCompilePlan | null,
): TopologyRewritePropagation[] {
  const out: TopologyRewritePropagation[] = [];
  const seen = new Set<string>();

  function pushPropagation(propagation: TopologyRewritePropagation | null): void {
    if (!propagation || seen.has(propagation.rewriteId)) return;
    seen.add(propagation.rewriteId);
    out.push(propagation);
  }

  function visit(current: ShapeCompilePlan | null): void {
    if (!current) return;

    switch (current.kind) {
      case 'queryOwner':
      case 'transform':
        visit(current.base);
        return;
      case 'shell':
      case 'hole':
      case 'cut':
      case 'trimByPlane':
      case 'fillet':
      case 'chamfer': {
        pushPropagation(nodePropagation(current));
        visit(current.base);
        return;
      }
      case 'boolean':
      case 'hull': {
        pushPropagation(nodePropagation(current));
        const children = current.kind === 'boolean' ? current.shapes : current.shapes;
        for (const child of children) visit(child);
        return;
      }
      case 'box':
      case 'cylinder':
      case 'sphere':
      case 'extrude':
      case 'revolve':
      case 'loft':
      case 'sweep':
        return;
    }
  }

  visit(plan);
  return out;
}

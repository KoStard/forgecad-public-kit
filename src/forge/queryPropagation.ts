import type { ShapeCompilePlan } from './compilePlan';
import {
  cloneEdgeQueryRef,
  cloneFaceQueryRef,
  cloneShapeQueryOwner,
  cloneTopologyRewritePropagation,
  type CreatedEdgeQueryRef,
  type CreatedFaceQueryRef,
  type EdgeQueryRef,
  type FaceQueryRef,
  type PropagatedEdgeQueryRef,
  type PropagatedFaceQueryRef,
  type ShapeQueryOwner,
  type TopologyRewritePropagation,
  type TopologyRewritePropagationDiagnostic,
  type TopologyRewriteQueryKind,
  type TopologyRewriteQueryOutcome,
} from './queryModel';
import type { ShapeWorkplanePlacement } from './sketch/workplaneModel';

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

function createPropagation(operation: string, owner: ShapeQueryOwner): TopologyRewritePropagation {
  return {
    rewriteId: owner.id,
    operation,
    owner: cloneShapeQueryOwner(owner),
    preservedFaces: [],
    preservedEdges: [],
    createdFaces: [],
    createdEdges: [],
    diagnostics: [],
  };
}

function createDiagnostic(
  code: string,
  category: TopologyRewritePropagationDiagnostic['category'],
  queryKind: TopologyRewriteQueryKind,
  message: string,
  source?: FaceQueryRef | EdgeQueryRef,
  query?: FaceQueryRef | EdgeQueryRef,
): TopologyRewritePropagationDiagnostic {
  return {
    code,
    category,
    queryKind,
    message,
    source: queryKind === 'face'
      ? cloneFaceQueryRef(source as FaceQueryRef | undefined)
      : cloneEdgeQueryRef(source as EdgeQueryRef | undefined),
    query: queryKind === 'face'
      ? cloneFaceQueryRef(query as FaceQueryRef | undefined)
      : cloneEdgeQueryRef(query as EdgeQueryRef | undefined),
  };
}

export function createPropagatedFaceQueryRef(
  source: FaceQueryRef,
  owner: ShapeQueryOwner,
  outcome: TopologyRewriteQueryOutcome,
): PropagatedFaceQueryRef {
  return {
    kind: 'propagated-face',
    rewriteId: owner.id,
    outcome,
    source: cloneFaceQueryRef(source)!,
    owner: cloneShapeQueryOwner(owner),
  };
}

export function createCreatedFaceQueryRef(
  owner: ShapeQueryOwner,
  operation: string,
  slot: string,
): CreatedFaceQueryRef {
  return {
    kind: 'created-face',
    rewriteId: owner.id,
    operation,
    slot,
    owner: cloneShapeQueryOwner(owner),
  };
}

export function createPropagatedEdgeQueryRef(
  source: EdgeQueryRef,
  owner: ShapeQueryOwner,
  outcome: TopologyRewriteQueryOutcome,
): PropagatedEdgeQueryRef {
  return {
    kind: 'propagated-edge',
    rewriteId: owner.id,
    outcome,
    source: cloneEdgeQueryRef(source)!,
    selector: source.selector,
    owner: cloneShapeQueryOwner(owner),
  };
}

export function createCreatedEdgeQueryRef(
  owner: ShapeQueryOwner,
  operation: string,
  slot: string,
  selector: EdgeQueryRef['selector'] = 'edge',
): CreatedEdgeQueryRef {
  return {
    kind: 'created-edge',
    rewriteId: owner.id,
    operation,
    slot,
    selector,
    owner: cloneShapeQueryOwner(owner),
  };
}

export function buildShellTopologyRewritePropagation(
  owner: ShapeQueryOwner,
  openFaces: Array<'top' | 'bottom'>,
): TopologyRewritePropagation {
  const propagation = createPropagation('shell', owner);
  const openingText = openFaces.length > 0 ? ` Open faces: ${openFaces.join(', ')}.` : '';
  propagation.diagnostics.push(
    createDiagnostic(
      'shell-face-propagation-ambiguous',
      'ambiguous',
      'face',
      `Shell rewrites result faces, but durable face-query propagation is not defended yet.${openingText}`,
    ),
    createDiagnostic(
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
  const propagation = createPropagation('hole', owner);
  const propagated = createPropagatedFaceQueryRef(placement.workplane.source, owner, 'split');
  propagation.preservedFaces.push({
    query: propagated,
    status: 'ambiguous',
    note: 'The selected host face survives only as a split descendant set after the hole lands.',
  });
  propagation.diagnostics.push(
    createDiagnostic(
      'hole-source-face-split-ambiguous',
      'ambiguous',
      'face',
      'Hole intent records that the selected host face is split, but the surviving descendants are not uniquely queryable yet.',
      placement.workplane.source,
      propagated,
    ),
    createDiagnostic(
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
  const propagation = createPropagation('cut', owner);
  const propagated = createPropagatedFaceQueryRef(placement.workplane.source, owner, 'split');
  propagation.preservedFaces.push({
    query: propagated,
    status: 'ambiguous',
    note: 'The selected host face is split by the cut profile, so the surviving descendants are still ambiguous.',
  });
  propagation.diagnostics.push(
    createDiagnostic(
      'cut-source-face-split-ambiguous',
      'ambiguous',
      'face',
      'Cut intent records that the selected host face is split, but the surviving descendants are not uniquely queryable yet.',
      placement.workplane.source,
      propagated,
    ),
    createDiagnostic(
      'cut-created-edge-propagation-unsupported',
      'unsupported',
      'edge',
      'Cut-created edge semantics are not part of the topology-rewrite kernel yet.',
    ),
  );
  return propagation;
}

export function buildBooleanTopologyRewritePropagation(
  op: 'union' | 'difference' | 'intersection',
  owner: ShapeQueryOwner,
): TopologyRewritePropagation {
  const propagation = createPropagation(`boolean:${op}`, owner);
  propagation.diagnostics.push(
    createDiagnostic(
      `boolean-${op}-face-propagation-ambiguous`,
      'ambiguous',
      'face',
      `Boolean ${op} records an explicit topology-rewrite boundary, but durable face-query propagation is still pending.`,
    ),
    createDiagnostic(
      `boolean-${op}-edge-propagation-ambiguous`,
      'ambiguous',
      'edge',
      `Boolean ${op} records an explicit topology-rewrite boundary, but durable edge-query propagation is still pending.`,
    ),
  );
  return propagation;
}

export function buildHullTopologyRewritePropagation(owner: ShapeQueryOwner): TopologyRewritePropagation {
  const propagation = createPropagation('hull', owner);
  propagation.diagnostics.push(
    createDiagnostic(
      'hull-face-propagation-unsupported',
      'unsupported',
      'face',
      'Hull combines source solids through a full topology rewrite, so face-query propagation is not defended yet.',
    ),
    createDiagnostic(
      'hull-edge-propagation-unsupported',
      'unsupported',
      'edge',
      'Hull combines source solids through a full topology rewrite, so edge-query propagation is not defended yet.',
    ),
  );
  return propagation;
}

export function buildTrimByPlaneTopologyRewritePropagation(owner: ShapeQueryOwner): TopologyRewritePropagation {
  const propagation = createPropagation('trimByPlane', owner);
  propagation.createdFaces.push({
    query: createCreatedFaceQueryRef(owner, 'trimByPlane', 'plane-cap'),
    note: 'The kept side of the trim introduces one deterministic cap face on the trim plane.',
  });
  propagation.diagnostics.push(
    createDiagnostic(
      'trim-by-plane-preserved-face-propagation-ambiguous',
      'ambiguous',
      'face',
      'Trim-by-plane now exposes its created plane-cap face, but preserved non-cap face propagation is still ambiguous.',
    ),
    createDiagnostic(
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
  preservedEdges: EdgeQueryRef[] = [],
): TopologyRewritePropagation {
  const propagation = createPropagation(operation, owner);
  for (const source of preservedEdges) {
    propagation.preservedEdges.push({
      query: createPropagatedEdgeQueryRef(source, owner, 'preserved'),
      status: 'supported',
      note: `${operation} leaves this sibling tracked vertical edge unchanged in the defended post-rewrite subset.`,
    });
  }
  if (edge) {
    const propagated = createPropagatedEdgeQueryRef(edge, owner, 'merged');
    propagation.preservedEdges.push({
      query: propagated,
      status: 'ambiguous',
      note: `${operation} rewrites the selected edge into a blended descendant set rather than one defended edge target.`,
    });
    propagation.diagnostics.push(
      createDiagnostic(
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
    createDiagnostic(
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

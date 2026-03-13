import {
  cloneEdgeQueryRef,
  cloneFaceQueryRef,
  cloneShapeQueryOwner,
  type CreatedEdgeQueryRef,
  type CreatedFaceQueryRef,
  type EdgeQueryRef,
  type FaceQueryRef,
  type PropagatedEdgeQueryRef,
  type PropagatedFaceQueryRef,
  type ShapeQueryOwner,
  type TopologyRewritePropagation,
  type TopologyRewritePropagationDiagnostic,
  type TopologyRewriteDescendantContract,
  type TopologyRewriteEdgeDescendantContract,
  type TopologyRewriteFaceDescendantContract,
  type TopologyRewriteQueryKind,
  type TopologyRewriteQueryOutcome,
} from './queryModel';

export function createTopologyRewritePropagation(
  operation: string,
  owner: ShapeQueryOwner,
): TopologyRewritePropagation {
  return {
    rewriteId: owner.id,
    operation,
    owner: cloneShapeQueryOwner(owner),
    preservedFaces: [],
    preservedEdges: [],
    createdFaces: [],
    createdEdges: [],
    diagnostics: [],
    descendants: [],
  };
}

export function createTopologyRewritePropagationDiagnostic(
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

export function createFaceDescendantContract(
  kind: TopologyRewriteFaceDescendantContract['kind'],
  query: FaceQueryRef,
  options: { source?: FaceQueryRef; note?: string } = {},
): TopologyRewriteFaceDescendantContract {
  return {
    queryKind: 'face',
    kind,
    query: cloneFaceQueryRef(query)!,
    source: cloneFaceQueryRef(options.source),
    note: options.note,
  };
}

export function createEdgeDescendantContract(
  kind: TopologyRewriteEdgeDescendantContract['kind'],
  query: EdgeQueryRef,
  options: { source?: EdgeQueryRef; note?: string } = {},
): TopologyRewriteEdgeDescendantContract {
  return {
    queryKind: 'edge',
    kind,
    query: cloneEdgeQueryRef(query)!,
    source: cloneEdgeQueryRef(options.source),
    note: options.note,
  };
}

export function pushTopologyRewriteDescendantContract(
  propagation: TopologyRewritePropagation,
  contract: TopologyRewriteDescendantContract,
): void {
  propagation.descendants.push(contract);
}

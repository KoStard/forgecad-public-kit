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

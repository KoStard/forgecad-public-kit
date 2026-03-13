export type SketchFace3D = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

export interface ShapeQueryOwner {
  id: string;
  operation: string;
}

export type TopologyRewriteQueryOutcome = 'preserved' | 'split' | 'merged';
export type TopologyRewriteDiagnosticCategory = 'ambiguous' | 'unsupported';
export type TopologyRewriteQueryKind = 'face' | 'edge';

export interface CanonicalFaceQueryRef {
  kind: 'canonical-face';
  face: SketchFace3D;
  owner?: ShapeQueryOwner;
}

export interface TrackedFaceQueryRef {
  kind: 'tracked-face';
  faceName: string;
  owner?: ShapeQueryOwner;
}

export interface DirectFaceQueryRef {
  kind: 'face-ref';
  faceName?: string;
  owner?: ShapeQueryOwner;
}

export interface PropagatedFaceQueryRef {
  kind: 'propagated-face';
  rewriteId: string;
  outcome: TopologyRewriteQueryOutcome;
  source: FaceQueryRef;
  owner?: ShapeQueryOwner;
}

export interface CreatedFaceQueryRef {
  kind: 'created-face';
  rewriteId: string;
  operation: string;
  slot: string;
  owner?: ShapeQueryOwner;
}

export type FaceQueryRef =
  | CanonicalFaceQueryRef
  | TrackedFaceQueryRef
  | DirectFaceQueryRef
  | PropagatedFaceQueryRef
  | CreatedFaceQueryRef;

export type EdgeQuerySelector = 'edge' | 'start' | 'end' | 'midpoint';

export interface TrackedEdgeQueryRef {
  kind: 'tracked-edge';
  edgeName: string;
  selector: EdgeQuerySelector;
  owner?: ShapeQueryOwner;
}

export interface DirectEdgeQueryRef {
  kind: 'edge-ref';
  edgeName?: string;
  selector: EdgeQuerySelector;
  owner?: ShapeQueryOwner;
}

export interface PropagatedEdgeQueryRef {
  kind: 'propagated-edge';
  rewriteId: string;
  outcome: TopologyRewriteQueryOutcome;
  source: EdgeQueryRef;
  selector: EdgeQuerySelector;
  owner?: ShapeQueryOwner;
}

export interface CreatedEdgeQueryRef {
  kind: 'created-edge';
  rewriteId: string;
  operation: string;
  slot: string;
  selector: EdgeQuerySelector;
  owner?: ShapeQueryOwner;
}

export type EdgeQueryRef =
  | TrackedEdgeQueryRef
  | DirectEdgeQueryRef
  | PropagatedEdgeQueryRef
  | CreatedEdgeQueryRef;

export interface TopologyRewritePreservedFaceQuery {
  query: PropagatedFaceQueryRef;
  status: 'supported' | 'ambiguous';
  note?: string;
}

export interface TopologyRewritePreservedEdgeQuery {
  query: PropagatedEdgeQueryRef;
  status: 'supported' | 'ambiguous';
  note?: string;
}

export interface TopologyRewriteCreatedFaceQuery {
  query: CreatedFaceQueryRef;
  note?: string;
}

export interface TopologyRewriteCreatedEdgeQuery {
  query: CreatedEdgeQueryRef;
  note?: string;
}

export interface TopologyRewritePropagationDiagnostic {
  code: string;
  category: TopologyRewriteDiagnosticCategory;
  queryKind: TopologyRewriteQueryKind;
  message: string;
  source?: FaceQueryRef | EdgeQueryRef;
  query?: FaceQueryRef | EdgeQueryRef;
}

export type TopologyRewriteDescendantContractKind =
  | 'single'
  | 'face-region'
  | 'face-set'
  | 'edge-chain'
  | 'vertex-set'
  | 'unsupported';

export interface TopologyRewriteFaceDescendantContract {
  queryKind: 'face';
  kind: 'single' | 'face-region' | 'face-set' | 'unsupported';
  query: FaceQueryRef;
  source?: FaceQueryRef;
  note?: string;
}

export interface TopologyRewriteEdgeDescendantContract {
  queryKind: 'edge';
  kind: 'single' | 'edge-chain' | 'unsupported';
  query: EdgeQueryRef;
  source?: EdgeQueryRef;
  note?: string;
}

export interface TopologyRewriteVertexDescendantContract {
  queryKind: 'vertex';
  kind: 'vertex-set' | 'unsupported';
  note?: string;
}

export type TopologyRewriteDescendantContract =
  | TopologyRewriteFaceDescendantContract
  | TopologyRewriteEdgeDescendantContract
  | TopologyRewriteVertexDescendantContract;

export interface TopologyRewritePropagation {
  rewriteId: string;
  operation: string;
  owner?: ShapeQueryOwner;
  preservedFaces: TopologyRewritePreservedFaceQuery[];
  preservedEdges: TopologyRewritePreservedEdgeQuery[];
  createdFaces: TopologyRewriteCreatedFaceQuery[];
  createdEdges: TopologyRewriteCreatedEdgeQuery[];
  diagnostics: TopologyRewritePropagationDiagnostic[];
  descendants: TopologyRewriteDescendantContract[];
}

export function cloneShapeQueryOwner(owner: ShapeQueryOwner | undefined): ShapeQueryOwner | undefined {
  if (!owner) return undefined;
  return {
    id: owner.id,
    operation: owner.operation,
  };
}

export function shapeQueryOwnersEqual(
  a: ShapeQueryOwner | undefined,
  b: ShapeQueryOwner | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  return a.id === b.id && a.operation === b.operation;
}

export function cloneFaceQueryRef(ref: FaceQueryRef | undefined): FaceQueryRef | undefined {
  if (!ref) return undefined;
  switch (ref.kind) {
    case 'canonical-face':
      return { kind: 'canonical-face', face: ref.face, owner: cloneShapeQueryOwner(ref.owner) };
    case 'tracked-face':
      return { kind: 'tracked-face', faceName: ref.faceName, owner: cloneShapeQueryOwner(ref.owner) };
    case 'face-ref':
      return { kind: 'face-ref', faceName: ref.faceName, owner: cloneShapeQueryOwner(ref.owner) };
    case 'propagated-face':
      return {
        kind: 'propagated-face',
        rewriteId: ref.rewriteId,
        outcome: ref.outcome,
        source: cloneFaceQueryRef(ref.source)!,
        owner: cloneShapeQueryOwner(ref.owner),
      };
    case 'created-face':
      return {
        kind: 'created-face',
        rewriteId: ref.rewriteId,
        operation: ref.operation,
        slot: ref.slot,
        owner: cloneShapeQueryOwner(ref.owner),
      };
  }
}

export function cloneEdgeQueryRef(ref: EdgeQueryRef | undefined): EdgeQueryRef | undefined {
  if (!ref) return undefined;
  switch (ref.kind) {
    case 'tracked-edge':
      return {
        kind: 'tracked-edge',
        edgeName: ref.edgeName,
        selector: ref.selector,
        owner: cloneShapeQueryOwner(ref.owner),
      };
    case 'edge-ref':
      return {
        kind: 'edge-ref',
        edgeName: ref.edgeName,
        selector: ref.selector,
        owner: cloneShapeQueryOwner(ref.owner),
      };
    case 'propagated-edge':
      return {
        kind: 'propagated-edge',
        rewriteId: ref.rewriteId,
        outcome: ref.outcome,
        source: cloneEdgeQueryRef(ref.source)!,
        selector: ref.selector,
        owner: cloneShapeQueryOwner(ref.owner),
      };
    case 'created-edge':
      return {
        kind: 'created-edge',
        rewriteId: ref.rewriteId,
        operation: ref.operation,
        slot: ref.slot,
        selector: ref.selector,
        owner: cloneShapeQueryOwner(ref.owner),
      };
  }
}

export function cloneTopologyRewritePropagation(
  propagation: TopologyRewritePropagation | undefined,
): TopologyRewritePropagation | undefined {
  if (!propagation) return undefined;
  return {
    rewriteId: propagation.rewriteId,
    operation: propagation.operation,
    owner: cloneShapeQueryOwner(propagation.owner),
    preservedFaces: propagation.preservedFaces.map((entry) => ({
      query: cloneFaceQueryRef(entry.query)! as PropagatedFaceQueryRef,
      status: entry.status,
      note: entry.note,
    })),
    preservedEdges: propagation.preservedEdges.map((entry) => ({
      query: cloneEdgeQueryRef(entry.query)! as PropagatedEdgeQueryRef,
      status: entry.status,
      note: entry.note,
    })),
    createdFaces: propagation.createdFaces.map((entry) => ({
      query: cloneFaceQueryRef(entry.query)! as CreatedFaceQueryRef,
      note: entry.note,
    })),
    createdEdges: propagation.createdEdges.map((entry) => ({
      query: cloneEdgeQueryRef(entry.query)! as CreatedEdgeQueryRef,
      note: entry.note,
    })),
    diagnostics: propagation.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      category: diagnostic.category,
      queryKind: diagnostic.queryKind,
      message: diagnostic.message,
      source: diagnostic.queryKind === 'face'
        ? cloneFaceQueryRef(diagnostic.source as FaceQueryRef | undefined)
        : cloneEdgeQueryRef(diagnostic.source as EdgeQueryRef | undefined),
      query: diagnostic.queryKind === 'face'
        ? cloneFaceQueryRef(diagnostic.query as FaceQueryRef | undefined)
        : cloneEdgeQueryRef(diagnostic.query as EdgeQueryRef | undefined),
    })),
    descendants: (propagation.descendants ?? []).map((contract) => {
      switch (contract.queryKind) {
        case 'face':
          return {
            queryKind: 'face',
            kind: contract.kind,
            query: cloneFaceQueryRef(contract.query)!,
            source: cloneFaceQueryRef(contract.source),
            note: contract.note,
          };
        case 'edge':
          return {
            queryKind: 'edge',
            kind: contract.kind,
            query: cloneEdgeQueryRef(contract.query)!,
            source: cloneEdgeQueryRef(contract.source),
            note: contract.note,
          };
        case 'vertex':
          return {
            queryKind: 'vertex',
            kind: contract.kind,
            note: contract.note,
          };
      }
    }),
  };
}

export function faceQueryRefsEqual(
  a: FaceQueryRef | undefined,
  b: FaceQueryRef | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'canonical-face':
      return b.kind === 'canonical-face'
        && a.face === b.face
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'tracked-face':
      return b.kind === 'tracked-face'
        && a.faceName === b.faceName
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'face-ref':
      return b.kind === 'face-ref'
        && a.faceName === b.faceName
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'propagated-face':
      return b.kind === 'propagated-face'
        && a.rewriteId === b.rewriteId
        && a.outcome === b.outcome
        && faceQueryRefsEqual(a.source, b.source)
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'created-face':
      return b.kind === 'created-face'
        && a.rewriteId === b.rewriteId
        && a.operation === b.operation
        && a.slot === b.slot
        && shapeQueryOwnersEqual(a.owner, b.owner);
  }
}

export function edgeQueryRefsEqual(
  a: EdgeQueryRef | undefined,
  b: EdgeQueryRef | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'tracked-edge':
      return b.kind === 'tracked-edge'
        && a.edgeName === b.edgeName
        && a.selector === b.selector
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'edge-ref':
      return b.kind === 'edge-ref'
        && a.edgeName === b.edgeName
        && a.selector === b.selector
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'propagated-edge':
      return b.kind === 'propagated-edge'
        && a.rewriteId === b.rewriteId
        && a.outcome === b.outcome
        && a.selector === b.selector
        && edgeQueryRefsEqual(a.source, b.source)
        && shapeQueryOwnersEqual(a.owner, b.owner);
    case 'created-edge':
      return b.kind === 'created-edge'
        && a.rewriteId === b.rewriteId
        && a.operation === b.operation
        && a.slot === b.slot
        && a.selector === b.selector
        && shapeQueryOwnersEqual(a.owner, b.owner);
  }
}

export function describeFaceQueryRef(ref: FaceQueryRef | undefined | null): string {
  if (!ref) return 'none';
  const owner = ref.owner ? ` @${ref.owner.operation}:${ref.owner.id}` : '';
  switch (ref.kind) {
    case 'canonical-face':
      return `canonical-face(${ref.face})${owner}`;
    case 'tracked-face':
      return `tracked-face(${ref.faceName})${owner}`;
    case 'face-ref':
      return `face-ref(${ref.faceName ?? 'unnamed'})${owner}`;
    case 'propagated-face':
      return `propagated-face(${ref.outcome} <- ${describeFaceQueryRef(ref.source)})${owner}`;
    case 'created-face':
      return `created-face(${ref.operation}:${ref.slot})${owner}`;
  }
}

export function describeEdgeQueryRef(ref: EdgeQueryRef | undefined | null): string {
  if (!ref) return 'none';
  const owner = ref.owner ? ` @${ref.owner.operation}:${ref.owner.id}` : '';
  const selector = `#${ref.selector}`;
  switch (ref.kind) {
    case 'tracked-edge':
      return `tracked-edge(${ref.edgeName}${selector})${owner}`;
    case 'edge-ref':
      return `edge-ref(${ref.edgeName ?? 'unnamed'}${selector})${owner}`;
    case 'propagated-edge':
      return `propagated-edge(${ref.outcome} <- ${describeEdgeQueryRef(ref.source)}${selector})${owner}`;
    case 'created-edge':
      return `created-edge(${ref.operation}:${ref.slot}${selector})${owner}`;
  }
}

export function describeTopologyRewriteDescendantContract(
  contract: TopologyRewriteDescendantContract | undefined | null,
): string {
  if (!contract) return 'none';
  switch (contract.queryKind) {
    case 'face':
      return `${contract.kind}(${describeFaceQueryRef(contract.query)})`;
    case 'edge':
      return `${contract.kind}(${describeEdgeQueryRef(contract.query)})`;
    case 'vertex':
      return `${contract.kind}(vertex)`;
  }
}

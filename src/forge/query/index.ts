export {
  createTopologyRewritePropagation,
  createTopologyRewritePropagationDiagnostic,
  createPropagatedFaceQueryRef,
  createCreatedFaceQueryRef,
  createPropagatedEdgeQueryRef,
  createCreatedEdgeQueryRef,
  createFaceDescendantContract,
  createEdgeDescendantContract,
  pushTopologyRewriteDescendantContract,
} from './queryPropagationCore';

export { buildBooleanTopologyRewritePropagation } from './booleanQueryPropagation';

export {
  buildShellTopologyRewritePropagation,
  buildHoleTopologyRewritePropagation,
  buildCutTopologyRewritePropagation,
  buildTrimByPlaneTopologyRewritePropagation,
  buildEdgeFeatureTopologyRewritePropagation,
  attachTopologyRewritePropagation,
  findShapeTopologyRewritePropagation,
  collectShapeTopologyRewritePropagations,
} from './queryPropagation';

export {
  type BoundingRegion,
  type EdgeQuery,
  type EdgeSegment,
  selectEdges,
  selectEdge,
  coalesceEdges,
} from './edgeQuery';

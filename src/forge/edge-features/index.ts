export {
  type EdgeFinishQuadrant,
  type EdgeFeatureResolvedSelector,
  type ResolvedEdgeFeatureSelection,
  cloneEdgeFinishQuadrant,
  cloneEdgeFeatureResolvedSelector,
  cloneResolvedEdgeFeatureSelection,
} from './edgeFeatureModel';

export {
  type EdgeFeatureResolutionIssue,
  resolveSupportedEdgeFeatureSelection,
  resolveShapeEdgeDescendant,
  collectSupportedEdgeFinishPreservedSources,
  selectionToResolvedSelector,
} from './edgeFeatureResolution';

export { filletEdgeSegment, chamferEdgeSegment } from './edgeSegmentFeatures';

export { filletEdge, chamferEdge } from './edgeFeatures';

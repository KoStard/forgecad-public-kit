import type { Vec3 } from './transform';

export type EdgeFinishQuadrant = [number, number];

export interface EdgeFeatureResolvedSelector {
  kind: 'line-segment';
  edgeName: string;
  start: Vec3;
  end: Vec3;
  midpoint: Vec3;
}

export interface ResolvedEdgeFeatureSelection extends EdgeFeatureResolvedSelector {
  axis: Vec3;
  basisX: Vec3;
  basisY: Vec3;
  quadrant: EdgeFinishQuadrant;
}

export function cloneEdgeFinishQuadrant(
  quadrant: EdgeFinishQuadrant | undefined,
): EdgeFinishQuadrant | undefined {
  if (!quadrant) return undefined;
  return [quadrant[0], quadrant[1]];
}

export function cloneEdgeFeatureResolvedSelector(
  selector: EdgeFeatureResolvedSelector | undefined,
): EdgeFeatureResolvedSelector | undefined {
  if (!selector) return undefined;
  return {
    kind: selector.kind,
    edgeName: selector.edgeName,
    start: [selector.start[0], selector.start[1], selector.start[2]],
    end: [selector.end[0], selector.end[1], selector.end[2]],
    midpoint: [selector.midpoint[0], selector.midpoint[1], selector.midpoint[2]],
  };
}

export function cloneResolvedEdgeFeatureSelection(
  selection: ResolvedEdgeFeatureSelection | undefined,
): ResolvedEdgeFeatureSelection | undefined {
  if (!selection) return undefined;
  return {
    kind: selection.kind,
    edgeName: selection.edgeName,
    start: [selection.start[0], selection.start[1], selection.start[2]],
    end: [selection.end[0], selection.end[1], selection.end[2]],
    midpoint: [selection.midpoint[0], selection.midpoint[1], selection.midpoint[2]],
    axis: [selection.axis[0], selection.axis[1], selection.axis[2]],
    basisX: [selection.basisX[0], selection.basisX[1], selection.basisX[2]],
    basisY: [selection.basisY[0], selection.basisY[1], selection.basisY[2]],
    quadrant: [selection.quadrant[0], selection.quadrant[1]],
  };
}

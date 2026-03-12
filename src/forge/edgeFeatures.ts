import {
  buildChamferShapeCompilePlan,
  buildFilletShapeCompilePlan,
  createShapeQueryOwner,
  type ShapeCompilePlan,
  wrapShapeCompilePlanWithQueryOwner,
} from './compilePlan';
import {
  Shape,
  buildShapeFromCompilePlan,
  getShapeCompilePlan,
  getShapeDimensions,
  getShapeGeometryInfo,
  getShapePlacementReferences,
  getShapeQueryOwners,
  setShapeDimensions,
  setShapeGeometryInfo,
  setShapePlacementReferences,
} from './kernel';
import { shapeQueryOwnersEqual, type ShapeQueryOwner } from './queryModel';
import {
  attachTopologyRewritePropagation,
  buildEdgeFeatureTopologyRewritePropagation,
} from './queryPropagation';
import {
  collectSupportedEdgeFinishPreservedSources,
  resolveSupportedEdgeFeatureSelection,
} from './edgeFeatureResolution';
import { TrackedShape, type EdgeRef } from './sketch/topology';

type ShapeArg = Shape | TrackedShape;

function unwrapShape(value: ShapeArg): Shape {
  return value instanceof TrackedShape ? value.toShape() : value;
}

function normalizeQuadrant(
  quadrant: [number, number] | undefined,
  label: string,
): [number, number] {
  const next = quadrant ?? [-1, -1];
  const x = Math.sign(next[0]);
  const y = Math.sign(next[1]);
  if ((x !== 1 && x !== -1) || (y !== 1 && y !== -1)) {
    throw new Error(`${label} requires quadrant signs of either 1 or -1.`);
  }
  return [x, y];
}

function targetRetainsQueryOwner(target: Shape, owner: ShapeQueryOwner | undefined): boolean {
  if (!owner) return true;
  return getShapeQueryOwners(target).some((current) => shapeQueryOwnersEqual(current, owner));
}

function requireCompatibleEdgeOwner(target: Shape, edge: EdgeRef, label: string): void {
  if (targetRetainsQueryOwner(target, edge.query?.owner)) return;
  throw new Error(
    `${label} requires an edge query owned by the target shape or one of its preserved query ancestors.`,
  );
}

function createOwnedTopologyRewritePlan(
  plan: ShapeCompilePlan | null,
  operation: 'fillet' | 'chamfer',
  edge: EdgeRef,
  preservedEdges: EdgeRef['query'][],
): ShapeCompilePlan | null {
  if (!plan) return null;
  const owner = createShapeQueryOwner(operation);
  return wrapShapeCompilePlanWithQueryOwner(
    attachTopologyRewritePropagation(
      plan,
      buildEdgeFeatureTopologyRewritePropagation(operation, owner, edge.query, preservedEdges.filter((query): query is NonNullable<typeof query> => query != null)),
    ),
    owner,
  );
}

function buildEdgeFeatureResult(target: Shape, plan: ShapeCompilePlan | null, source: 'fillet' | 'chamfer'): Shape {
  if (!plan) {
    throw new Error(`Could not record compiler intent for ${source} on this target shape.`);
  }

  const targetInfo = getShapeGeometryInfo(target);
  const result = buildShapeFromCompilePlan(plan, target.colorHex, {
    backend: targetInfo.backend,
    representation: targetInfo.representation,
    fidelity: targetInfo.fidelity,
    topology: 'none',
    sources: [source, ...targetInfo.sources],
  });
  setShapeDimensions(result, getShapeDimensions(target));
  setShapePlacementReferences(result, getShapePlacementReferences(target), { merge: false });
  setShapeGeometryInfo(result, {
    backend: targetInfo.backend,
    representation: targetInfo.representation,
    fidelity: targetInfo.fidelity,
    topology: 'none',
    sources: [source, ...targetInfo.sources],
  });
  return result;
}

export function filletEdge(
  shape: ShapeArg,
  edge: EdgeRef,
  radius: number,
  quadrant: [number, number] = [-1, -1],
  segments = 16,
): Shape {
  if (!Number.isFinite(radius) || !(radius > 0)) {
    throw new Error('filletEdge() requires a positive finite radius.');
  }
  if (!Number.isFinite(segments) || segments < 2) {
    throw new Error('filletEdge() requires at least 2 segments.');
  }

  const target = unwrapShape(shape);
  requireCompatibleEdgeOwner(target, edge, 'filletEdge()');

  const basePlan = getShapeCompilePlan(target);
  if (!basePlan) {
    throw new Error('filletEdge() currently requires a compile-covered target shape.');
  }

  const normalizedQuadrant = normalizeQuadrant(quadrant, 'filletEdge()');
  const selection = resolveSupportedEdgeFeatureSelection(basePlan, edge.query);
  if (!selection.ok) {
    throw new Error(`filletEdge(): ${selection.issue.reason}`);
  }
  const preservedEdges = collectSupportedEdgeFinishPreservedSources(basePlan, edge.query);
  if (
    selection.selection.quadrant[0] !== normalizedQuadrant[0]
    || selection.selection.quadrant[1] !== normalizedQuadrant[1]
  ) {
    throw new Error(
      `filletEdge() currently supports ${selection.selection.edgeName} only with quadrant [${selection.selection.quadrant[0]}, ${selection.selection.quadrant[1]}].`,
    );
  }

  const plan = createOwnedTopologyRewritePlan(
    buildFilletShapeCompilePlan(basePlan, edge.query, radius, normalizedQuadrant, Math.round(segments)),
    'fillet',
    edge,
    preservedEdges,
  );
  return buildEdgeFeatureResult(target, plan, 'fillet');
}

export function chamferEdge(
  shape: ShapeArg,
  edge: EdgeRef,
  size: number,
  quadrant: [number, number] = [-1, -1],
): Shape {
  if (!Number.isFinite(size) || !(size > 0)) {
    throw new Error('chamferEdge() requires a positive finite size.');
  }

  const target = unwrapShape(shape);
  requireCompatibleEdgeOwner(target, edge, 'chamferEdge()');

  const basePlan = getShapeCompilePlan(target);
  if (!basePlan) {
    throw new Error('chamferEdge() currently requires a compile-covered target shape.');
  }

  const normalizedQuadrant = normalizeQuadrant(quadrant, 'chamferEdge()');
  const selection = resolveSupportedEdgeFeatureSelection(basePlan, edge.query);
  if (!selection.ok) {
    throw new Error(`chamferEdge(): ${selection.issue.reason}`);
  }
  const preservedEdges = collectSupportedEdgeFinishPreservedSources(basePlan, edge.query);
  if (
    selection.selection.quadrant[0] !== normalizedQuadrant[0]
    || selection.selection.quadrant[1] !== normalizedQuadrant[1]
  ) {
    throw new Error(
      `chamferEdge() currently supports ${selection.selection.edgeName} only with quadrant [${selection.selection.quadrant[0]}, ${selection.selection.quadrant[1]}].`,
    );
  }

  const plan = createOwnedTopologyRewritePlan(
    buildChamferShapeCompilePlan(basePlan, edge.query, size, normalizedQuadrant),
    'chamfer',
    edge,
    preservedEdges,
  );
  return buildEdgeFeatureResult(target, plan, 'chamfer');
}

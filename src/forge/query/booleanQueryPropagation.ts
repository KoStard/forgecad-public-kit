import { assertExhaustive, findShapePrimaryQueryOwner, type ShapeCompilePlan } from '../compilePlan';
import {
  cloneEdgeQueryRef,
  cloneFaceQueryRef,
  cloneShapeQueryOwner,
  cloneTopologyRewritePropagation,
  describeEdgeQueryRef,
  describeFaceQueryRef,
  type EdgeQueryRef,
  edgeQueryRefsEqual,
  type FaceQueryRef,
  faceQueryRefsEqual,
  type ShapeQueryOwner,
  type SketchFace3D,
  type TopologyRewritePropagation,
} from '../queryModel';
import {
  createEdgeDescendantContract,
  createFaceDescendantContract,
  createPropagatedEdgeQueryRef,
  createPropagatedFaceQueryRef,
  createTopologyRewritePropagation,
  createTopologyRewritePropagationDiagnostic,
  pushTopologyRewriteDescendantContract,
} from './queryPropagationCore';

interface FacePropagationSeed {
  source: FaceQueryRef;
  status: 'supported' | 'ambiguous';
}

interface EdgePropagationSeed {
  source: EdgeQueryRef;
  status: 'supported' | 'ambiguous';
}

interface FaceSeedGroup {
  source: FaceQueryRef;
  count: number;
  hasAmbiguousSource: boolean;
}

interface EdgeSeedGroup {
  source: EdgeQueryRef;
  count: number;
  hasAmbiguousSource: boolean;
}

const CANONICAL_FACES: SketchFace3D[] = ['front', 'back', 'left', 'right', 'top', 'bottom'];

function rootTopologyRewritePropagation(plan: ShapeCompilePlan | null): TopologyRewritePropagation | null {
  if (!plan) return null;

  switch (plan.kind) {
    case 'queryOwner':
    case 'transform':
      return rootTopologyRewritePropagation(plan.base);
    case 'shell':
    case 'hole':
    case 'cut':
    case 'boolean':
    case 'trimByPlane':
    case 'fillet':
    case 'chamfer':
      return cloneTopologyRewritePropagation(plan.queryPropagation) ?? null;
    case 'box':
    case 'cylinder':
    case 'sphere':
    case 'torus':
    case 'extrude':
    case 'sheetMetal':
    case 'revolve':
    case 'loft':
    case 'sweep':
    case 'filletEdges':
    case 'chamferEdges':
    case 'draft':
    case 'offsetSolid':
    case 'importedMesh':
      return null;
    default:
      assertExhaustive(plan);
  }
}

function pushUniqueFaceSeed(out: FacePropagationSeed[], seed: FacePropagationSeed): void {
  const existing = out.find((entry) => faceQueryRefsEqual(entry.source, seed.source));
  if (!existing) {
    out.push({
      source: cloneFaceQueryRef(seed.source)!,
      status: seed.status,
    });
    return;
  }
  if (seed.status === 'ambiguous') {
    existing.status = 'ambiguous';
  }
}

function pushUniqueEdgeSeed(out: EdgePropagationSeed[], seed: EdgePropagationSeed): void {
  const existing = out.find((entry) => edgeQueryRefsEqual(entry.source, seed.source));
  if (!existing) {
    out.push({
      source: cloneEdgeQueryRef(seed.source)!,
      status: seed.status,
    });
    return;
  }
  if (seed.status === 'ambiguous') {
    existing.status = 'ambiguous';
  }
}

function canonicalFaceSeedsForOwner(owner: ShapeQueryOwner | null): FacePropagationSeed[] {
  if (!owner) return [];
  return CANONICAL_FACES.map((face) => ({
    source: {
      kind: 'canonical-face',
      face,
      owner: cloneShapeQueryOwner(owner),
    },
    status: 'supported' as const,
  }));
}

function collectFaceSeeds(plan: ShapeCompilePlan | null): FacePropagationSeed[] {
  if (!plan) return [];
  const propagation = rootTopologyRewritePropagation(plan);
  if (!propagation) {
    return canonicalFaceSeedsForOwner(findShapePrimaryQueryOwner(plan));
  }

  const out: FacePropagationSeed[] = [];
  for (const entry of propagation.preservedFaces) {
    pushUniqueFaceSeed(out, {
      source: entry.query,
      status: entry.status,
    });
  }
  for (const entry of propagation.createdFaces) {
    pushUniqueFaceSeed(out, {
      source: entry.query,
      status: 'supported',
    });
  }
  return out;
}

function collectEdgeSeeds(plan: ShapeCompilePlan | null): EdgePropagationSeed[] {
  const propagation = rootTopologyRewritePropagation(plan);
  if (!propagation) return [];

  const out: EdgePropagationSeed[] = [];
  for (const entry of propagation.preservedEdges) {
    pushUniqueEdgeSeed(out, {
      source: entry.query,
      status: entry.status,
    });
  }
  for (const entry of propagation.createdEdges) {
    pushUniqueEdgeSeed(out, {
      source: entry.query,
      status: 'supported',
    });
  }
  return out;
}

function groupFaceSeeds(seeds: FacePropagationSeed[]): FaceSeedGroup[] {
  const groups: FaceSeedGroup[] = [];
  for (const seed of seeds) {
    const existing = groups.find((entry) => faceQueryRefsEqual(entry.source, seed.source));
    if (existing) {
      existing.count += 1;
      existing.hasAmbiguousSource = existing.hasAmbiguousSource || seed.status === 'ambiguous';
      continue;
    }
    groups.push({
      source: cloneFaceQueryRef(seed.source)!,
      count: 1,
      hasAmbiguousSource: seed.status === 'ambiguous',
    });
  }
  return groups;
}

function groupEdgeSeeds(seeds: EdgePropagationSeed[]): EdgeSeedGroup[] {
  const groups: EdgeSeedGroup[] = [];
  for (const seed of seeds) {
    const existing = groups.find((entry) => edgeQueryRefsEqual(entry.source, seed.source));
    if (existing) {
      existing.count += 1;
      existing.hasAmbiguousSource = existing.hasAmbiguousSource || seed.status === 'ambiguous';
      continue;
    }
    groups.push({
      source: cloneEdgeQueryRef(seed.source)!,
      count: 1,
      hasAmbiguousSource: seed.status === 'ambiguous',
    });
  }
  return groups;
}

function collectOperandFaceGroups(plans: Array<ShapeCompilePlan | null>, includeAllOperands: boolean): FaceSeedGroup[] {
  const selected = includeAllOperands ? plans : plans.slice(0, 1);
  return groupFaceSeeds(selected.flatMap((plan) => collectFaceSeeds(plan)));
}

function collectOperandEdgeGroups(plans: Array<ShapeCompilePlan | null>, includeAllOperands: boolean): EdgeSeedGroup[] {
  const selected = includeAllOperands ? plans : plans.slice(0, 1);
  return groupEdgeSeeds(selected.flatMap((plan) => collectEdgeSeeds(plan)));
}

function addFaceUnsupportedDiagnostic(propagation: TopologyRewritePropagation, op: 'union' | 'difference' | 'intersection'): void {
  const message =
    op === 'union'
      ? 'Boolean union preserved owner lineage, but none of its operands exposed defended face queries in the supported subset.'
      : op === 'difference'
        ? 'Boolean difference can only propagate explicit base-operand face queries, and none were available in the supported subset.'
        : 'Boolean intersection needs explicit operand face queries to defend any surviving descendants, and none were available in the supported subset.';
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(`boolean-${op}-face-propagation-unsupported`, 'unsupported', 'face', message),
  );
}

function addEdgeUnsupportedDiagnostic(propagation: TopologyRewritePropagation, op: 'union' | 'difference' | 'intersection'): void {
  const message =
    op === 'union'
      ? 'Boolean union preserved owner lineage, but none of its operands exposed defended edge queries in the supported subset.'
      : op === 'difference'
        ? 'Boolean difference can only propagate explicit base-operand edge queries, and none were available in the supported subset.'
        : 'Boolean intersection needs explicit operand edge queries to defend any surviving descendants, and none were available in the supported subset.';
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(`boolean-${op}-edge-propagation-unsupported`, 'unsupported', 'edge', message),
  );
}

function buildUnionFacePropagation(
  owner: ShapeQueryOwner,
  propagation: TopologyRewritePropagation,
  operandPlans: Array<ShapeCompilePlan | null>,
): void {
  const groups = collectOperandFaceGroups(operandPlans, true);
  if (groups.length === 0) {
    addFaceUnsupportedDiagnostic(propagation, 'union');
    return;
  }

  for (const group of groups) {
    if (group.count === 1 && !group.hasAmbiguousSource) {
      const query = createPropagatedFaceQueryRef(group.source, owner, 'preserved');
      propagation.preservedFaces.push({
        query,
        status: 'supported',
      });
      pushTopologyRewriteDescendantContract(
        propagation,
        createFaceDescendantContract('single', query, {
          source: group.source,
          note: 'Boolean union keeps one defended single face descendant for this lineage.',
        }),
      );
      continue;
    }

    const query = createPropagatedFaceQueryRef(group.source, owner, group.count > 1 ? 'merged' : 'preserved');
    propagation.preservedFaces.push({
      query,
      status: 'ambiguous',
    });
    if (group.count > 1 && !group.hasAmbiguousSource) {
      pushTopologyRewriteDescendantContract(
        propagation,
        createFaceDescendantContract('face-set', query, {
          source: group.source,
          note: 'Boolean union keeps a defended descendant face set for this merged lineage.',
        }),
      );
    }
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        group.count > 1 ? 'boolean-union-face-merged-ambiguous' : 'boolean-union-face-inherited-ambiguity',
        'ambiguous',
        'face',
        group.count > 1
          ? `Boolean union cannot defend ${describeFaceQueryRef(group.source)} because ${group.count} operand descendants share that face lineage and may merge.`
          : `Boolean union inherits ${describeFaceQueryRef(group.source)} from an already-ambiguous rewrite result, so the post-union descendant remains ambiguous.`,
        group.source,
        query,
      ),
    );
  }
}

function buildUnionEdgePropagation(
  owner: ShapeQueryOwner,
  propagation: TopologyRewritePropagation,
  operandPlans: Array<ShapeCompilePlan | null>,
): void {
  const groups = collectOperandEdgeGroups(operandPlans, true);
  if (groups.length === 0) {
    addEdgeUnsupportedDiagnostic(propagation, 'union');
    return;
  }

  for (const group of groups) {
    if (group.count === 1 && !group.hasAmbiguousSource) {
      const query = createPropagatedEdgeQueryRef(group.source, owner, 'preserved');
      propagation.preservedEdges.push({
        query,
        status: 'supported',
      });
      pushTopologyRewriteDescendantContract(
        propagation,
        createEdgeDescendantContract('single', query, {
          source: group.source,
          note: 'Boolean union keeps one defended single edge descendant for this lineage.',
        }),
      );
      continue;
    }

    const query = createPropagatedEdgeQueryRef(group.source, owner, group.count > 1 ? 'merged' : 'preserved');
    propagation.preservedEdges.push({
      query,
      status: 'ambiguous',
    });
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        group.count > 1 ? 'boolean-union-edge-merged-ambiguous' : 'boolean-union-edge-inherited-ambiguity',
        'ambiguous',
        'edge',
        group.count > 1
          ? `Boolean union cannot defend ${describeEdgeQueryRef(group.source)} because ${group.count} operand descendants share that edge lineage and may merge.`
          : `Boolean union inherits ${describeEdgeQueryRef(group.source)} from an already-ambiguous rewrite result, so the post-union descendant remains ambiguous.`,
        group.source,
        query,
      ),
    );
  }
}

function buildDifferenceFacePropagation(
  owner: ShapeQueryOwner,
  propagation: TopologyRewritePropagation,
  operandPlans: Array<ShapeCompilePlan | null>,
): void {
  const groups = collectOperandFaceGroups(operandPlans, false);
  if (groups.length === 0) {
    addFaceUnsupportedDiagnostic(propagation, 'difference');
    return;
  }

  for (const group of groups) {
    const query = createPropagatedFaceQueryRef(group.source, owner, 'split');
    propagation.preservedFaces.push({
      query,
      status: 'ambiguous',
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('face-region', query, {
        source: group.source,
        note: 'Boolean difference keeps a defended descendant region on the source surface.',
      }),
    );
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        'boolean-difference-face-split-ambiguous',
        'ambiguous',
        'face',
        `Boolean difference can trace ${describeFaceQueryRef(group.source)} to the base operand, but subtractive cutters may split or erase its surviving descendants.`,
        group.source,
        query,
      ),
    );
  }
}

function buildDifferenceEdgePropagation(
  owner: ShapeQueryOwner,
  propagation: TopologyRewritePropagation,
  operandPlans: Array<ShapeCompilePlan | null>,
): void {
  const groups = collectOperandEdgeGroups(operandPlans, false);
  if (groups.length === 0) {
    addEdgeUnsupportedDiagnostic(propagation, 'difference');
    return;
  }

  for (const group of groups) {
    const query = createPropagatedEdgeQueryRef(group.source, owner, 'split');
    propagation.preservedEdges.push({
      query,
      status: 'ambiguous',
    });
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        'boolean-difference-edge-split-ambiguous',
        'ambiguous',
        'edge',
        `Boolean difference can trace ${describeEdgeQueryRef(group.source)} to the base operand, but subtractive cutters may split or erase its surviving descendants.`,
        group.source,
        query,
      ),
    );
  }
}

function buildIntersectionFacePropagation(
  owner: ShapeQueryOwner,
  propagation: TopologyRewritePropagation,
  operandPlans: Array<ShapeCompilePlan | null>,
): void {
  const groups = collectOperandFaceGroups(operandPlans, true);
  if (groups.length === 0) {
    addFaceUnsupportedDiagnostic(propagation, 'intersection');
    return;
  }

  for (const group of groups) {
    const query = createPropagatedFaceQueryRef(group.source, owner, 'split');
    propagation.preservedFaces.push({
      query,
      status: 'ambiguous',
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('face-region', query, {
        source: group.source,
        note: 'Boolean intersection keeps a defended descendant region on the source surface.',
      }),
    );
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        'boolean-intersection-face-split-ambiguous',
        'ambiguous',
        'face',
        `Boolean intersection can trace ${describeFaceQueryRef(group.source)}, but the kept overlap is only a clipped descendant subset and cannot be defended as one stable face target.`,
        group.source,
        query,
      ),
    );
  }
}

function buildIntersectionEdgePropagation(
  owner: ShapeQueryOwner,
  propagation: TopologyRewritePropagation,
  operandPlans: Array<ShapeCompilePlan | null>,
): void {
  const groups = collectOperandEdgeGroups(operandPlans, true);
  if (groups.length === 0) {
    addEdgeUnsupportedDiagnostic(propagation, 'intersection');
    return;
  }

  for (const group of groups) {
    const query = createPropagatedEdgeQueryRef(group.source, owner, 'split');
    propagation.preservedEdges.push({
      query,
      status: 'ambiguous',
    });
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        'boolean-intersection-edge-split-ambiguous',
        'ambiguous',
        'edge',
        `Boolean intersection can trace ${describeEdgeQueryRef(group.source)}, but the kept overlap is only a clipped descendant subset and cannot be defended as one stable edge target.`,
        group.source,
        query,
      ),
    );
  }
}

export function buildBooleanTopologyRewritePropagation(
  op: 'union' | 'difference' | 'intersection',
  owner: ShapeQueryOwner,
  operandPlans: Array<ShapeCompilePlan | null>,
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation(`boolean:${op}`, owner);
  switch (op) {
    case 'union':
      buildUnionFacePropagation(owner, propagation, operandPlans);
      buildUnionEdgePropagation(owner, propagation, operandPlans);
      return propagation;
    case 'difference':
      buildDifferenceFacePropagation(owner, propagation, operandPlans);
      buildDifferenceEdgePropagation(owner, propagation, operandPlans);
      return propagation;
    case 'intersection':
      buildIntersectionFacePropagation(owner, propagation, operandPlans);
      buildIntersectionEdgePropagation(owner, propagation, operandPlans);
      return propagation;
  }
}

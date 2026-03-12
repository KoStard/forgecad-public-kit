import type { FeatureCutExtent, HoleCompilePlan, ProfileCompilePlan, ShapeCompilePlan } from './compilePlan';
import {
  cloneTopologyRewritePropagation,
  type EdgeQueryRef,
  type ShapeQueryOwner,
  type TopologyRewritePropagation,
} from './queryModel';
import {
  createCreatedEdgeQueryRef,
  createCreatedFaceQueryRef,
  createPropagatedEdgeQueryRef,
  createPropagatedFaceQueryRef,
  createTopologyRewritePropagation,
  createTopologyRewritePropagationDiagnostic,
} from './queryPropagationCore';
import type { ShapeWorkplanePlacement } from './sketch/workplaneModel';
import {
  blockedShapeFacesForFeature,
  type FeatureBlockedFaceReason,
  preservedShapeFaceQueries,
  supportedCutCreatedFaceNames,
  supportedHoleCreatedFaceNames,
  supportedShellCreatedFaceNames,
} from './shapeFaces';

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

function blockedFeatureFaceNote(operation: 'hole' | 'cut', reason: FeatureBlockedFaceReason): string {
  switch (reason) {
    case 'host':
      return `The selected host face is rewritten by the ${operation} result and is not a defended named target.`;
    case 'through-exit':
      return `This opposite face is pierced by the through-${operation} and is not a defended named target.`;
    case 'up-to-face-target':
      return `The selected up-to-face termination face is rewritten by the ${operation} result and is not a defended named target.`;
  }
}

export function buildShellTopologyRewritePropagation(
  owner: ShapeQueryOwner,
  base: ShapeCompilePlan,
  openFaces: Array<'top' | 'bottom'>,
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('shell', owner);
  const preserved = preservedShapeFaceQueries(base);
  const created = supportedShellCreatedFaceNames(base, openFaces);

  for (const entry of preserved) {
    propagation.preservedFaces.push({
      query: createPropagatedFaceQueryRef(entry.query, owner, 'preserved'),
      status: 'supported',
      note: 'The outer shell face survives as a defended preserved-face query on the shelled result.',
    });
  }
  for (const name of created) {
    propagation.createdFaces.push({
      query: createCreatedFaceQueryRef(owner, 'shell', name),
      note: 'This shell-created inner face is part of the defended named-face subset.',
    });
  }

  if (preserved.length === 0 && created.length === 0) {
    const openingText = openFaces.length > 0 ? ` Open faces: ${openFaces.join(', ')}.` : '';
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        'shell-face-propagation-unsupported',
        'unsupported',
        'face',
        `Shell exact lowering is supported here, but compiler-owned face propagation is not defended for this shell base.${openingText}`,
      ),
    );
  }
  propagation.diagnostics.push(
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
  base: ShapeCompilePlan,
  placement: ShapeWorkplanePlacement['placement'],
  hole: HoleCompilePlan,
  extent: FeatureCutExtent,
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('hole', owner);
  const blocked = new Map(blockedShapeFacesForFeature(base, placement.workplane.source, extent)
    .map((entry) => [entry.name, entry.reason]));
  for (const entry of preservedShapeFaceQueries(base)) {
    const blockedReason = blocked.get(entry.name);
    if (blockedReason) {
      propagation.preservedFaces.push({
        query: createPropagatedFaceQueryRef(entry.query, owner, 'split'),
        status: 'ambiguous',
        note: blockedFeatureFaceNote('hole', blockedReason),
      });
      continue;
    }
    propagation.preservedFaces.push({
      query: createPropagatedFaceQueryRef(entry.query, owner, 'preserved'),
      status: 'supported',
      note: 'This face stays queryable through the hole rewrite.',
    });
  }
  for (const name of supportedHoleCreatedFaceNames(hole, extent)) {
    propagation.createdFaces.push({
      query: createCreatedFaceQueryRef(owner, 'hole', name),
      note: (() => {
        switch (name) {
          case 'floor':
            return 'Blind holes create a defended planar floor face.';
          case 'counterbore-floor':
            return 'Counterbored holes create a defended planar shoulder face.';
          case 'counterbore-wall':
            return 'Counterbored holes create a defended counterbore wall-face query.';
          case 'countersink-wall':
            return 'Countersunk holes create a defended countersink wall-face query.';
          default:
            return 'Hole results create a defended wall-face query.';
        }
      })(),
    });
  }
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(
      'hole-source-face-split-ambiguous',
      'ambiguous',
      'face',
      'Hole intent records which rewritten host/exit faces are ambiguous instead of silently accepting them.',
      placement.workplane.source,
      createPropagatedFaceQueryRef(placement.workplane.source, owner, 'split'),
    ),
    createTopologyRewritePropagationDiagnostic(
      'hole-created-edge-propagation-unsupported',
      'unsupported',
      'edge',
      'Hole-created edge semantics are not part of the topology-rewrite kernel yet.',
    ),
  );
  if (extent.kind === 'upToFace') {
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        'hole-up-to-face-target-split-ambiguous',
        'ambiguous',
        'face',
        'Hole upToFace intent records the selected termination face as an explicit split-face ambiguity instead of silently keeping it queryable.',
        extent.face,
        createPropagatedFaceQueryRef(extent.face, owner, 'split'),
      ),
    );
  }
  return propagation;
}

export function buildCutTopologyRewritePropagation(
  owner: ShapeQueryOwner,
  base: ShapeCompilePlan,
  placement: ShapeWorkplanePlacement['placement'],
  profile: ProfileCompilePlan,
  extent: FeatureCutExtent,
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('cut', owner);
  const blocked = new Map(blockedShapeFacesForFeature(base, placement.workplane.source, extent)
    .map((entry) => [entry.name, entry.reason]));
  for (const entry of preservedShapeFaceQueries(base)) {
    const blockedReason = blocked.get(entry.name);
    if (blockedReason) {
      propagation.preservedFaces.push({
        query: createPropagatedFaceQueryRef(entry.query, owner, 'split'),
        status: 'ambiguous',
        note: blockedFeatureFaceNote('cut', blockedReason),
      });
      continue;
    }
    propagation.preservedFaces.push({
      query: createPropagatedFaceQueryRef(entry.query, owner, 'preserved'),
      status: 'supported',
      note: 'This face stays queryable through the cut rewrite.',
    });
  }
  const createdNames = supportedCutCreatedFaceNames(profile, extent);
  for (const name of createdNames) {
    propagation.createdFaces.push({
      query: createCreatedFaceQueryRef(owner, 'cut', name),
      note: name === 'floor'
        ? 'Blind cutouts create a defended planar floor face.'
        : 'This cut-created wall face is part of the defended named-face subset.',
    });
  }
  propagation.diagnostics.push(
    createTopologyRewritePropagationDiagnostic(
      'cut-source-face-split-ambiguous',
      'ambiguous',
      'face',
      'Cut intent records which rewritten host/exit faces are ambiguous instead of silently accepting them.',
      placement.workplane.source,
      createPropagatedFaceQueryRef(placement.workplane.source, owner, 'split'),
    ),
    createTopologyRewritePropagationDiagnostic(
      'cut-created-edge-propagation-unsupported',
      'unsupported',
      'edge',
      'Cut-created edge semantics are not part of the topology-rewrite kernel yet.',
    ),
  );
  if (extent.kind === 'upToFace') {
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        'cut-up-to-face-target-split-ambiguous',
        'ambiguous',
        'face',
        'Cut upToFace intent records the selected termination face as an explicit split-face ambiguity instead of silently keeping it queryable.',
        extent.face,
        createPropagatedFaceQueryRef(extent.face, owner, 'split'),
      ),
    );
  }
  if (createdNames.length === 0) {
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        'cut-created-face-subset-unsupported',
        'unsupported',
        'face',
        'This cut profile does not fall inside the defended cut-created face subset yet.',
      ),
    );
  }
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
  preservedEdges: EdgeQueryRef[] = [],
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation(operation, owner);
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

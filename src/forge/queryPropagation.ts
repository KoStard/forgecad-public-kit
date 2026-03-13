import type {
  CutTaperCompilePlan,
  FeatureCutExtent,
  HoleCompilePlan,
  ProfileCompilePlan,
  ShapeCompilePlan,
} from './compilePlan';
import { featureCutExtentForwardSide, featureCutExtentReverseSide } from './compilePlan';
import {
  cloneTopologyRewritePropagation,
  type EdgeQueryRef,
  type ShapeQueryOwner,
  type TopologyRewritePropagation,
} from './queryModel';
import {
  createCreatedEdgeQueryRef,
  createCreatedFaceQueryRef,
  createEdgeDescendantContract,
  createFaceDescendantContract,
  createPropagatedEdgeQueryRef,
  createPropagatedFaceQueryRef,
  createTopologyRewritePropagation,
  createTopologyRewritePropagationDiagnostic,
  pushTopologyRewriteDescendantContract,
} from './queryPropagationCore';
import type { ShapeWorkplanePlacement } from './sketch/workplaneModel';
import {
  blockedShapeFacesForFeature,
  type FeatureBlockedFaceReason,
  preservedShapeFaceQueries,
  supportedCutCreatedFaceNames,
  supportedCutCreatedEdgeNames,
  supportedHoleCreatedFaceNames,
  supportedHoleCreatedEdgeNames,
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

function holeCreatedEdgeNote(name: string, hole: HoleCompilePlan, extent: FeatureCutExtent): string {
  switch (name) {
    case 'entry-rim':
      return 'Hole results record the entry perimeter as a defended descendant edge chain on the host face.';
    case 'forward-end-rim': {
      const forward = featureCutExtentForwardSide(extent);
      if (forward.kind === 'blind') return 'Blind holes record the floor perimeter as a defended descendant edge chain.';
      if (forward.kind === 'upToFace') return 'Hole upToFace results record the termination perimeter as a defended descendant edge chain.';
      return 'Through holes record the exit perimeter as a defended descendant edge chain.';
    }
    case 'reverse-end-rim': {
      const reverse = featureCutExtentReverseSide(extent);
      if (reverse?.kind === 'blind') return 'Reverse two-sided holes record the cap perimeter as a defended descendant edge chain.';
      return 'Reverse two-sided hole termination stays visible as a defended descendant edge chain.';
    }
    case 'head-transition-rim':
      return hole.counterbore
        ? 'Counterbored holes record the shoulder transition as a defended descendant edge chain.'
        : 'Countersunk holes record the sink-to-shaft transition as a defended descendant edge chain.';
    default:
      return 'This hole-created edge chain stays inspectable in the defended topology-rewrite subset.';
  }
}

function cutCreatedEdgeNote(name: string, extent: FeatureCutExtent): string {
  switch (name) {
    case 'entry-rim':
      return 'Cut results record the sketched entry perimeter as a defended descendant edge chain on the host face.';
    case 'forward-end-rim': {
      const forward = featureCutExtentForwardSide(extent);
      if (forward.kind === 'blind') return 'Blind cutouts record the floor perimeter as a defended descendant edge chain.';
      if (forward.kind === 'upToFace') return 'Cut upToFace results record the termination perimeter as a defended descendant edge chain.';
      return 'Through cutouts record the exit perimeter as a defended descendant edge chain.';
    }
    case 'reverse-end-rim': {
      const reverse = featureCutExtentReverseSide(extent);
      if (reverse?.kind === 'blind') return 'Reverse two-sided cutouts record the cap perimeter as a defended descendant edge chain.';
      return 'Reverse two-sided cut termination stays visible as a defended descendant edge chain.';
    }
    default:
      return 'This cut-created edge chain stays inspectable in the defended topology-rewrite subset.';
  }
}

function pushExtentUpToFaceDiagnostics(
  propagation: TopologyRewritePropagation,
  owner: ShapeQueryOwner,
  operation: 'hole' | 'cut',
  extent: FeatureCutExtent,
): void {
  const forward = featureCutExtentForwardSide(extent);
  if (forward.kind === 'upToFace') {
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        `${operation}-up-to-face-target-split-ambiguous`,
        'ambiguous',
        'face',
        `${operation === 'hole' ? 'Hole' : 'Cut'} upToFace intent records the selected termination face as an explicit split-face ambiguity instead of silently keeping it queryable.`,
        forward.face,
        createPropagatedFaceQueryRef(forward.face!, owner, 'split'),
      ),
    );
  }
  const reverse = featureCutExtentReverseSide(extent);
  if (reverse?.kind === 'upToFace') {
    propagation.diagnostics.push(
      createTopologyRewritePropagationDiagnostic(
        `${operation}-reverse-up-to-face-target-split-ambiguous`,
        'ambiguous',
        'face',
        `${operation === 'hole' ? 'Hole' : 'Cut'} reverse upToFace intent records the selected reverse termination face as an explicit split-face ambiguity instead of silently keeping it queryable.`,
        reverse.face,
        createPropagatedFaceQueryRef(reverse.face!, owner, 'split'),
      ),
    );
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
    const query = createPropagatedFaceQueryRef(entry.query, owner, 'preserved');
    propagation.preservedFaces.push({
      query,
      status: 'supported',
      note: 'The outer shell face survives as a defended preserved-face query on the shelled result.',
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('single', query, {
        source: entry.query,
        note: 'Shell keeps this face as one defended single descendant.',
      }),
    );
  }
  for (const name of created) {
    const query = createCreatedFaceQueryRef(owner, 'shell', name);
    propagation.createdFaces.push({
      query,
      note: 'This shell-created inner face is part of the defended named-face subset.',
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('single', query, {
        note: 'This shell-created face resolves to one defended descendant.',
      }),
    );
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
      const query = createPropagatedFaceQueryRef(entry.query, owner, 'split');
      propagation.preservedFaces.push({
        query,
        status: 'ambiguous',
        note: blockedFeatureFaceNote('hole', blockedReason),
      });
      pushTopologyRewriteDescendantContract(
        propagation,
        createFaceDescendantContract('face-region', query, {
          source: entry.query,
          note: 'This rewritten hole face remains a defended descendant region on the same source surface.',
        }),
      );
      continue;
    }
    const query = createPropagatedFaceQueryRef(entry.query, owner, 'preserved');
    propagation.preservedFaces.push({
      query,
      status: 'supported',
      note: 'This face stays queryable through the hole rewrite.',
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('single', query, {
        source: entry.query,
        note: 'This hole descendant stays one defended face.',
      }),
    );
  }
  for (const name of supportedHoleCreatedFaceNames(hole, extent)) {
    const query = createCreatedFaceQueryRef(owner, 'hole', name);
    propagation.createdFaces.push({
      query,
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
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('single', query, {
        note: 'This hole-created face resolves to one defended descendant.',
      }),
    );
  }
  for (const name of supportedHoleCreatedEdgeNames(hole, extent)) {
    const query = createCreatedEdgeQueryRef(owner, 'hole', name);
    propagation.createdEdges.push({
      query,
      note: holeCreatedEdgeNote(name, hole, extent),
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createEdgeDescendantContract('edge-chain', query, {
        note: 'This hole-created edge query resolves to a defended descendant chain.',
      }),
    );
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
  );
  pushExtentUpToFaceDiagnostics(propagation, owner, 'hole', extent);
  return propagation;
}

export function buildCutTopologyRewritePropagation(
  owner: ShapeQueryOwner,
  base: ShapeCompilePlan,
  placement: ShapeWorkplanePlacement['placement'],
  profile: ProfileCompilePlan,
  extent: FeatureCutExtent,
  taper?: CutTaperCompilePlan,
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('cut', owner);
  const blocked = new Map(blockedShapeFacesForFeature(base, placement.workplane.source, extent)
    .map((entry) => [entry.name, entry.reason]));
  for (const entry of preservedShapeFaceQueries(base)) {
    const blockedReason = blocked.get(entry.name);
    if (blockedReason) {
      const query = createPropagatedFaceQueryRef(entry.query, owner, 'split');
      propagation.preservedFaces.push({
        query,
        status: 'ambiguous',
        note: blockedFeatureFaceNote('cut', blockedReason),
      });
      pushTopologyRewriteDescendantContract(
        propagation,
        createFaceDescendantContract('face-region', query, {
          source: entry.query,
          note: 'This rewritten cut face remains a defended descendant region on the same source surface.',
        }),
      );
      continue;
    }
    const query = createPropagatedFaceQueryRef(entry.query, owner, 'preserved');
    propagation.preservedFaces.push({
      query,
      status: 'supported',
      note: 'This face stays queryable through the cut rewrite.',
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('single', query, {
        source: entry.query,
        note: 'This cut descendant stays one defended face.',
      }),
    );
  }
  const createdNames = supportedCutCreatedFaceNames(profile, extent);
  for (const name of createdNames) {
    const query = createCreatedFaceQueryRef(owner, 'cut', name);
    propagation.createdFaces.push({
      query,
      note: name === 'floor'
        ? 'Blind cutouts create a defended planar floor face.'
        : 'This cut-created wall face is part of the defended named-face subset.',
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('single', query, {
        note: 'This cut-created face resolves to one defended descendant.',
      }),
    );
  }
  for (const name of supportedCutCreatedEdgeNames(profile, extent, taper)) {
    const query = createCreatedEdgeQueryRef(owner, 'cut', name);
    propagation.createdEdges.push({
      query,
      note: cutCreatedEdgeNote(name, extent),
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createEdgeDescendantContract('edge-chain', query, {
        note: 'This cut-created edge query resolves to a defended descendant chain.',
      }),
    );
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
  );
  pushExtentUpToFaceDiagnostics(propagation, owner, 'cut', extent);
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

export function buildTrimByPlaneTopologyRewritePropagation(
  owner: ShapeQueryOwner,
  base: ShapeCompilePlan,
): TopologyRewritePropagation {
  const propagation = createTopologyRewritePropagation('trimByPlane', owner);
  for (const entry of preservedShapeFaceQueries(base)) {
    const query = createPropagatedFaceQueryRef(entry.query, owner, 'split');
    propagation.preservedFaces.push({
      query,
      status: 'ambiguous',
      note: 'Trim keeps a clipped descendant region on the source surface instead of one untouched face.',
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createFaceDescendantContract('face-region', query, {
        source: entry.query,
        note: 'Trim keeps a defended descendant region on the source surface.',
      }),
    );
  }
  const planeCap = createCreatedFaceQueryRef(owner, 'trimByPlane', 'plane-cap');
  propagation.createdFaces.push({
    query: planeCap,
    note: 'The kept side of the trim introduces one deterministic cap face on the trim plane.',
  });
  pushTopologyRewriteDescendantContract(
    propagation,
    createFaceDescendantContract('single', planeCap, {
      note: 'The trim plane cap resolves to one defended descendant face.',
    }),
  );
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
    const query = createPropagatedEdgeQueryRef(source, owner, 'preserved');
    propagation.preservedEdges.push({
      query,
      status: 'supported',
      note: `${operation} leaves this supported propagated vertical edge lineage unchanged in the defended post-rewrite subset.`,
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createEdgeDescendantContract('single', query, {
        source,
        note: `${operation} keeps this edge as one defended single descendant.`,
      }),
    );
  }
  if (edge) {
    const propagated = createPropagatedEdgeQueryRef(edge, owner, 'merged');
    propagation.preservedEdges.push({
      query: propagated,
      status: 'ambiguous',
      note: `${operation} rewrites the selected edge into a blended descendant set rather than one defended edge target.`,
    });
    pushTopologyRewriteDescendantContract(
      propagation,
      createEdgeDescendantContract('edge-chain', propagated, {
        source: edge,
        note: `${operation} rewrites the selected edge into a defended descendant chain instead of one single edge target.`,
      }),
    );
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
    case 'sheetMetal':
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
      case 'sheetMetal':
      case 'revolve':
      case 'loft':
      case 'sweep':
        return;
    }
  }

  visit(plan);
  return out;
}

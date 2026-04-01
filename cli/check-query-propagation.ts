#!/usr/bin/env node
/**
 * Query-propagation regression snapshots.
 *
 * This keeps topology-rewrite query propagation reviewable without colliding
 * with the broader compiler-routing snapshots.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { init } from '../src/forge/headless';
import {
  describeEdgeQueryRef,
  describeFaceQueryRef,
  describeTopologyRewriteDescendantContract,
  type EdgeQueryRef,
  type FaceQueryRef,
  type ShapeQueryOwner,
  type TopologyRewritePropagation,
} from '../src/forge/queryModel';
import type { CompilerInspectionInput, CompilerRouteInspection, CompilerShapeInspection } from './compiler-inspection';
import { inspectCompilerScene, loadCompilerInspectionInput } from './compiler-inspection';
import { getCompilerRegressionCorpusPart } from './compiler-regression-corpus';
import { CHAMFER_EDGE_WORKFLOW_CODE, FILLET_EDGE_WORKFLOW_CODE } from './edge-finish-fixtures';
import { resolvePackagePath } from './package-runtime';

type QueryPropagationRouteSnapshot = {
  kind: CompilerRouteInspection['kind'];
  target?: CompilerRouteInspection['target'];
  reason?: string;
  diagnosticCodes: string[];
};

type QueryPropagationEntrySnapshot = {
  status?: 'supported' | 'ambiguous';
  query: string;
  note?: string;
};

type QueryPropagationDiagnosticSnapshot = {
  code: string;
  category: 'ambiguous' | 'unsupported';
  queryKind: 'face' | 'edge';
  source?: string;
  query?: string;
};

type QueryPropagationSnapshot = {
  rewriteId: string;
  operation: string;
  owner?: string;
  preservedFaces: QueryPropagationEntrySnapshot[];
  preservedEdges: QueryPropagationEntrySnapshot[];
  createdFaces: QueryPropagationEntrySnapshot[];
  createdEdges: QueryPropagationEntrySnapshot[];
  diagnostics: QueryPropagationDiagnosticSnapshot[];
  descendants: string[];
};

type QueryPropagationObjectSnapshot = {
  name: string;
  exactRoute: QueryPropagationRouteSnapshot;
  facetedRoute: QueryPropagationRouteSnapshot;
  propagationOps: string[];
  propagations: QueryPropagationSnapshot[];
};

type QueryPropagationCaseSnapshot = {
  id: string;
  description: string;
  objects: QueryPropagationObjectSnapshot[];
};

type QueryPropagationObjectExpectation = {
  name: string;
  exactRouteKind: QueryPropagationRouteSnapshot['kind'];
  facetedRouteKind: QueryPropagationRouteSnapshot['kind'];
  operations: string[];
  requiredDiagnosticCodes: string[];
  requiredRouteDiagnosticCodes?: string[];
  requiredPreservedFaceQueries?: string[];
  requiredPreservedEdgeQueries?: string[];
  requiredCreatedFaceQueries?: string[];
  requiredCreatedEdgeQueries?: string[];
};

type QueryPropagationCaseDefinition = {
  id: string;
  description: string;
  input: CompilerInspectionInput;
  expectedObjects: QueryPropagationObjectExpectation[];
};

const SNAPSHOT_PATH = resolvePackagePath(import.meta.url, 'cli', 'snapshots', 'query-propagation-snapshots.json');

const HOLE_CUT_WORKFLOW_CODE = `
const base = roundedRect(90, 60, 8, true).extrude(24);
const topPocket = roundedRect(18, 10, 2, true)
  .onFace(base, 'top', { u: 14, v: -8, selfAnchor: 'center' });
const sideCut = roundedRect(16, 8, 2, true)
  .onFace(base, 'right', { u: -4, v: 0, selfAnchor: 'center' });
const body = base
  .hole('front', { diameter: 8, u: 0, v: 2 })
  .hole('top', { diameter: 6, u: -18, v: 10, depth: 10 })
  .cutout(topPocket, { depth: 6 })
  .cutout(sideCut);
return [{ name: 'Workflow', shape: body }];
`;

const ADVANCED_HOLE_CUT_VARIANTS_CODE = `
const base = roundedRect(68, 44, 4, true).extrude(20);
const accessPocket = roundedRect(20, 12, 2, true)
  .onFace(base, 'top', { u: 0, v: 0, selfAnchor: 'center' });
const recessed = base.cutout(accessPocket, { depth: 10 });
const internalFloor = recessed.face('floor');
const threadedHole = recessed.hole(internalFloor, {
  diameter: 4.2,
  extent: {
    forward: { upToFace: base.face('bottom') },
    reverse: { depth: 2 },
  },
  thread: { designation: 'M5x0.8', class: '6H', depth: 4 },
});
const taperedPocket = roundedRect(14, 8, 2, true)
  .onFace(threadedHole, 'front', { u: 0, v: 2, selfAnchor: 'center' });
const finished = threadedHole.cutout(taperedPocket, { depth: 5, taperScale: 0.75 });
return [{ name: 'Advanced Variants', shape: finished }];
`;

const TRIM_AND_SPLIT_WORKFLOW_CODE = `
const body = box(40, 30, 20, true).toShape();
const trimmed = body.trimByPlane([0, 0, 1], 0);
const [upper, lower] = body.splitByPlane([0, 0, 1], 0);
return [
  { name: 'Trimmed', shape: trimmed },
  { name: 'Upper', shape: upper },
  { name: 'Lower', shape: lower },
];
`;

function inlineCase(
  id: string,
  description: string,
  code: string,
  expectedObjects: QueryPropagationObjectExpectation[],
): QueryPropagationCaseDefinition {
  return {
    id,
    description,
    input: {
      displayPath: `inline:${id}`,
      code,
      fileName: 'main.forge.js',
      allFiles: { 'main.forge.js': code },
    },
    expectedObjects,
  };
}

function fileCase(
  id: string,
  description: string,
  scriptPath: string,
  expectedObjects: QueryPropagationObjectExpectation[],
): QueryPropagationCaseDefinition {
  return {
    id,
    description,
    input: loadCompilerInspectionInput(scriptPath),
    expectedObjects,
  };
}

function compilerCorpusCase(
  corpusId: string,
  description: string,
  expectedObjects: QueryPropagationObjectExpectation[],
): QueryPropagationCaseDefinition {
  const part = getCompilerRegressionCorpusPart(corpusId);
  return fileCase(part.id, description, part.scriptPath, expectedObjects);
}

let _queryPropagationCases: QueryPropagationCaseDefinition[] | undefined;
function getQueryPropagationCases(): QueryPropagationCaseDefinition[] {
  if (_queryPropagationCases) return _queryPropagationCases;
  _queryPropagationCases = [
    inlineCase(
      'trim-and-split-created-faces',
      'Trim and split-by-plane workflows keep the defended plane-cap created-face query visible for each surviving branch.',
      TRIM_AND_SPLIT_WORKFLOW_CODE,
      [
        {
          name: 'Trimmed',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['trimByPlane'],
          requiredDiagnosticCodes: ['trim-by-plane-preserved-face-propagation-ambiguous', 'trim-by-plane-edge-propagation-ambiguous'],
          requiredCreatedFaceQueries: ['created-face(trimByPlane:plane-cap)'],
        },
        {
          name: 'Upper',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['trimByPlane'],
          requiredDiagnosticCodes: ['trim-by-plane-preserved-face-propagation-ambiguous', 'trim-by-plane-edge-propagation-ambiguous'],
          requiredCreatedFaceQueries: ['created-face(trimByPlane:plane-cap)'],
        },
        {
          name: 'Lower',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['trimByPlane'],
          requiredDiagnosticCodes: ['trim-by-plane-preserved-face-propagation-ambiguous', 'trim-by-plane-edge-propagation-ambiguous'],
          requiredCreatedFaceQueries: ['created-face(trimByPlane:plane-cap)'],
        },
      ],
    ),
    inlineCase(
      'hole-cut-workflows',
      'Hole and cut workflows record ambiguous preserved-face descendants plus defended created face and edge-chain slots.',
      HOLE_CUT_WORKFLOW_CODE,
      [
        {
          name: 'Workflow',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['cut', 'cut', 'hole', 'hole'],
          requiredDiagnosticCodes: ['cut-source-face-split-ambiguous', 'hole-source-face-split-ambiguous'],
          requiredPreservedFaceQueries: [
            'propagated-face(split <- tracked-face(side-bottom)',
            'propagated-face(split <- tracked-face(side-top)',
            'propagated-face(split <- propagated-face(preserved <- tracked-face(top)',
            'propagated-face(split <- propagated-face(preserved <- propagated-face(preserved <- propagated-face(preserved <- tracked-face(side-right)',
          ],
          requiredCreatedFaceQueries: [
            'created-face(hole:wall)',
            'created-face(hole:floor)',
            'created-face(cut:floor)',
            'created-face(cut:wall-right)',
          ],
          requiredCreatedEdgeQueries: [
            'created-edge(hole:entry-rim#edge)',
            'created-edge(hole:forward-end-rim#edge)',
            'created-edge(cut:entry-rim#edge)',
            'created-edge(cut:forward-end-rim#edge)',
          ],
        },
      ],
    ),
    inlineCase(
      'advanced-hole-cut-variants',
      'Two-sided threaded holes and tapered cuts keep defended cap/wall ownership and created edge chains reviewable in one feature stack.',
      ADVANCED_HOLE_CUT_VARIANTS_CODE,
      [
        {
          name: 'Advanced Variants',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['cut', 'hole', 'cut'],
          requiredDiagnosticCodes: [
            'cut-source-face-split-ambiguous',
            'hole-source-face-split-ambiguous',
            'hole-up-to-face-target-split-ambiguous',
          ],
          requiredCreatedFaceQueries: ['created-face(hole:cap)', 'created-face(cut:wall-right)'],
          requiredCreatedEdgeQueries: [
            'created-edge(hole:reverse-end-rim#edge)',
            'created-edge(hole:forward-end-rim#edge)',
            'created-edge(cut:forward-end-rim#edge)',
          ],
        },
      ],
    ),
    inlineCase(
      'fillet-edge-workflow',
      'Fillet workflows keep a preserved propagated edge finishable after an ordinary union while downstream hole/cut created faces stay visible in one chain.',
      FILLET_EDGE_WORKFLOW_CODE,
      [
        {
          name: 'Filleted Body',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['boolean:difference', 'cut', 'hole', 'fillet', 'boolean:union', 'fillet'],
          requiredDiagnosticCodes: [
            'boolean-difference-face-split-ambiguous',

            'cut-source-face-split-ambiguous',
            'hole-source-face-split-ambiguous',
            'boolean-union-edge-inherited-ambiguity',
            'fillet-selected-edge-merged-ambiguous',
            'fillet-created-face-propagation-unsupported',
          ],
          requiredPreservedFaceQueries: [
            'propagated-face(split <- propagated-face(preserved <- created-face(hole:floor)',
            'propagated-face(split <- created-face(cut:wall-right)',
          ],
          requiredPreservedEdgeQueries: [
            'propagated-edge(merged <- propagated-edge(preserved <- propagated-edge(preserved <- tracked-edge(vert-bl#edge)',
          ],
        },
      ],
    ),
    inlineCase(
      'chamfer-edge-workflow',
      'Chamfer workflows keep a preserved propagated edge finishable after an ordinary union alongside upstream hole rewrite diagnostics.',
      CHAMFER_EDGE_WORKFLOW_CODE,
      [
        {
          name: 'Chamfered Body',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['hole', 'chamfer', 'boolean:union', 'chamfer'],
          requiredDiagnosticCodes: [
            'hole-source-face-split-ambiguous',
            'boolean-union-edge-inherited-ambiguity',
            'chamfer-selected-edge-merged-ambiguous',
            'chamfer-created-face-propagation-unsupported',
          ],
          requiredPreservedEdgeQueries: [
            'propagated-edge(merged <- propagated-edge(preserved <- propagated-edge(preserved <- tracked-edge(vert-br#edge)',
          ],
        },
      ],
    ),
    compilerCorpusCase(
      'corpus-enclosure-shell-cuts',
      'The enclosure corpus keeps defended shell ownership plus later boolean rewrite boundaries reviewable inside a normal product-style part.',
      [
        {
          name: 'Enclosure Shell Cuts',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['boolean:difference', 'boolean:difference', 'boolean:union', 'shell', 'boolean:union', 'boolean:union'],
          requiredDiagnosticCodes: [
            'boolean-difference-face-split-ambiguous',

            'boolean-union-face-inherited-ambiguity',
            'boolean-union-face-merged-ambiguous',
            'boolean-union-edge-propagation-unsupported',
          ],
        },
      ],
    ),
    compilerCorpusCase(
      'corpus-edge-finished-mount',
      'The edge-finished mount corpus keeps fillet, hole, cut, and later boolean rewrite diagnostics aligned through one ordinary workflow.',
      [
        {
          name: 'Edge Finished Mount',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['boolean:difference', 'cut', 'hole', 'chamfer', 'boolean:union', 'fillet', 'boolean:union'],
          requiredDiagnosticCodes: [
            'boolean-difference-face-split-ambiguous',

            'cut-source-face-split-ambiguous',
            'hole-source-face-split-ambiguous',
            'boolean-union-edge-propagation-unsupported',
            'boolean-union-edge-inherited-ambiguity',
            'fillet-selected-edge-merged-ambiguous',
            'fillet-created-face-propagation-unsupported',
            'chamfer-selected-edge-merged-ambiguous',
            'chamfer-created-face-propagation-unsupported',
          ],
          requiredPreservedEdgeQueries: [
            'propagated-edge(merged <- propagated-edge(preserved <- propagated-edge(preserved <- tracked-edge(vert-bl#edge)',
          ],
        },
      ],
    ),
    compilerCorpusCase(
      'corpus-fastener-plate-variants',
      'The fastener-plate corpus keeps counterbore/countersink created faces and up-to-face split diagnostics reviewable through one ordinary richer hole workflow.',
      [
        {
          name: 'Fastener Plate Variants',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['cut', 'hole', 'hole', 'hole', 'hole'],
          requiredDiagnosticCodes: [
            'cut-source-face-split-ambiguous',
            'cut-up-to-face-target-split-ambiguous',
            'hole-source-face-split-ambiguous',
            'hole-up-to-face-target-split-ambiguous',
          ],
          requiredCreatedFaceQueries: [
            'created-face(hole:counterbore-floor)',
            'created-face(hole:counterbore-wall)',
            'created-face(hole:countersink-wall)',
          ],
          requiredCreatedEdgeQueries: ['created-edge(hole:head-transition-rim#edge)', 'created-edge(cut:forward-end-rim#edge)'],
          requiredPreservedFaceQueries: ['propagated-face(preserved <- created-face(hole:counterbore-floor)'],
        },
      ],
    ),
    compilerCorpusCase(
      'corpus-service-panel-cover',
      'The service-panel cover corpus keeps repeated-boss unions, richer hole/cut rewrites, and the later projection-driven union reviewable in one ordinary cover workflow.',
      [
        {
          name: 'Service Panel Cover',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['boolean:union', 'cut', 'hole', 'hole', 'hole', 'hole', 'boolean:union', 'boolean:union'],
          requiredDiagnosticCodes: [
            'boolean-union-edge-propagation-unsupported',
            'cut-source-face-split-ambiguous',
            'hole-source-face-split-ambiguous',
            'hole-up-to-face-target-split-ambiguous',
          ],
          requiredCreatedFaceQueries: [
            'created-face(hole:counterbore-floor)',
            'created-face(hole:counterbore-wall)',
            'created-face(hole:countersink-wall)',
            'created-face(cut:wall-right)',
            'created-face(cut:floor)',
          ],
          requiredCreatedEdgeQueries: ['created-edge(hole:head-transition-rim#edge)', 'created-edge(cut:forward-end-rim#edge)'],
          requiredPreservedFaceQueries: [
            'propagated-face(preserved <- created-face(hole:counterbore-floor)',
            'propagated-face(preserved <- created-face(hole:countersink-wall)',
            'propagated-face(preserved <- created-face(cut:floor)',
          ],
        },
      ],
    ),
    compilerCorpusCase(
      'corpus-folded-service-panel-cover',
      'The sheet-metal cover corpus keeps panel/flange cut descendants and bend-region semantics reviewable across both the folded body and flat pattern outputs.',
      [
        {
          name: 'Folded Service Panel Cover',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['cut', 'cut', 'cut', 'cut', 'cut', 'cut'],
          requiredDiagnosticCodes: ['cut-source-face-split-ambiguous'],
          requiredCreatedFaceQueries: ['created-face(cut:wall-right)', 'created-face(cut:wall)'],
          requiredCreatedEdgeQueries: ['created-edge(cut:entry-rim#edge)'],
          requiredPreservedFaceQueries: [
            'propagated-face(split <- tracked-face(panel)',
            'propagated-face(split <- propagated-face(preserved <- tracked-face(flange-right)',
          ],
        },
        {
          name: 'Flat Service Panel Cover',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['cut', 'cut', 'cut', 'cut', 'cut', 'cut'],
          requiredDiagnosticCodes: ['cut-source-face-split-ambiguous'],
          requiredCreatedFaceQueries: ['created-face(cut:wall-right)', 'created-face(cut:wall)'],
          requiredCreatedEdgeQueries: ['created-edge(cut:entry-rim#edge)'],
          requiredPreservedFaceQueries: [
            'propagated-face(split <- tracked-face(panel)',
            'propagated-face(split <- propagated-face(preserved <- tracked-face(flange-right)',
          ],
        },
      ],
    ),
    compilerCorpusCase(
      'corpus-trimmed-access-cover',
      'The trimmed access-cover corpus keeps trim-created plane-cap targeting reviewable while earlier hole/cut created faces and preserved canonical faces flow through later unions.',
      [
        {
          name: 'Trimmed Access Cover',
          exactRouteKind: 'exact',
          facetedRouteKind: 'exact',
          operations: ['boolean:union', 'trimByPlane', 'cut', 'hole', 'boolean:union'],
          requiredDiagnosticCodes: [
            'boolean-union-edge-propagation-unsupported',
            'trim-by-plane-preserved-face-propagation-ambiguous',
            'trim-by-plane-edge-propagation-ambiguous',
            'cut-source-face-split-ambiguous',
            'hole-source-face-split-ambiguous',
          ],
          requiredCreatedFaceQueries: ['created-face(trimByPlane:plane-cap)'],
          requiredPreservedFaceQueries: [
            'propagated-face(preserved <- created-face(trimByPlane:plane-cap)',
            'propagated-face(preserved <- canonical-face(top)',
            'propagated-face(preserved <- created-face(hole:floor)',
          ],
        },
      ],
    ),
  ];
  return _queryPropagationCases;
}

function parseArgs(argv: string[]) {
  let update = false;
  let caseId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--update') {
      update = true;
      continue;
    }
    if (arg === '--case') {
      caseId = argv[index + 1];
      if (!caseId) throw new Error('--case requires an id');
      index += 1;
      continue;
    }
    throw new Error(`Unknown flag: ${arg}`);
  }

  return { update, caseId };
}

function stripUndefinedDeep<T>(value: T): T {
  if (typeof value === 'number') {
    return (Object.is(value, -0) ? 0 : value) as T;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => stripUndefinedDeep(entry)) as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .map(([key, entry]) => [key, stripUndefinedDeep(entry)]),
    ) as T;
  }
  return value;
}

function describeOwner(owner: ShapeQueryOwner | undefined): string | undefined {
  if (!owner) return undefined;
  return `${owner.operation}:${owner.id}`;
}

function describeQuery(queryKind: 'face' | 'edge', query: FaceQueryRef | EdgeQueryRef | undefined): string | undefined {
  if (!query) return undefined;
  return queryKind === 'face' ? describeFaceQueryRef(query as FaceQueryRef) : describeEdgeQueryRef(query as EdgeQueryRef);
}

function summarizeRoute(route: CompilerRouteInspection): QueryPropagationRouteSnapshot {
  return {
    kind: route.kind,
    target: route.target,
    reason: route.reason,
    diagnosticCodes: route.diagnostics?.map((diagnostic) => diagnostic.code) ?? [],
  };
}

function summarizePropagation(propagation: TopologyRewritePropagation): QueryPropagationSnapshot {
  return {
    rewriteId: propagation.rewriteId,
    operation: propagation.operation,
    owner: describeOwner(propagation.owner),
    preservedFaces: propagation.preservedFaces.map((entry) => ({
      status: entry.status,
      query: describeFaceQueryRef(entry.query),
      note: entry.note,
    })),
    preservedEdges: propagation.preservedEdges.map((entry) => ({
      status: entry.status,
      query: describeEdgeQueryRef(entry.query),
      note: entry.note,
    })),
    createdFaces: propagation.createdFaces.map((entry) => ({
      query: describeFaceQueryRef(entry.query),
      note: entry.note,
    })),
    createdEdges: propagation.createdEdges.map((entry) => ({
      query: describeEdgeQueryRef(entry.query),
      note: entry.note,
    })),
    diagnostics: propagation.diagnostics.map((diagnostic) => ({
      code: diagnostic.code,
      category: diagnostic.category,
      queryKind: diagnostic.queryKind,
      source: describeQuery(diagnostic.queryKind, diagnostic.source as FaceQueryRef | EdgeQueryRef | undefined),
      query: describeQuery(diagnostic.queryKind, diagnostic.query as FaceQueryRef | EdgeQueryRef | undefined),
    })),
    descendants: propagation.descendants.map((contract) => describeTopologyRewriteDescendantContract(contract)),
  };
}

function summarizeShapeObject(object: CompilerShapeInspection): QueryPropagationObjectSnapshot {
  return {
    name: object.name,
    exactRoute: summarizeRoute(object.exactRoute),
    facetedRoute: summarizeRoute(object.facetedRoute),
    propagationOps: object.topologyRewritePropagations.map((entry) => entry.operation),
    propagations: object.topologyRewritePropagations.map((entry) => summarizePropagation(entry)),
  };
}

function generateSnapshots(caseId?: string): QueryPropagationCaseSnapshot[] {
  const selected = caseId ? getQueryPropagationCases().filter((entry) => entry.id === caseId) : getQueryPropagationCases();
  if (selected.length === 0) {
    throw new Error(`Unknown query-propagation snapshot case: ${caseId}`);
  }

  return selected.map((entry) => {
    const scene = inspectCompilerScene(entry.input);
    const objects = scene.objects
      .filter((object): object is CompilerShapeInspection => object.kind === 'shape' && object.topologyRewritePropagations.length > 0)
      .map((object) => summarizeShapeObject(object));

    return stripUndefinedDeep({
      id: entry.id,
      description: entry.description,
      objects,
    });
  });
}

function collectEntryQueries(
  objects: QueryPropagationObjectSnapshot,
  key: 'preservedFaces' | 'preservedEdges' | 'createdFaces' | 'createdEdges',
): string[] {
  return objects.propagations.flatMap((propagation) => propagation[key].map((entry) => entry.query));
}

function assertIncludesAll(
  caseId: string,
  objectName: string,
  label: string,
  actual: string[],
  expectedFragments: string[] | undefined,
): void {
  if (!expectedFragments || expectedFragments.length === 0) return;
  for (const fragment of expectedFragments) {
    assert(
      actual.some((value) => value.includes(fragment)),
      `${caseId}/${objectName}: missing ${label} fragment "${fragment}" in ${JSON.stringify(actual)}`,
    );
  }
}

function assertExpectedCoverage(snapshots: QueryPropagationCaseSnapshot[]): void {
  const definitions = new Map(getQueryPropagationCases().map((entry) => [entry.id, entry]));

  for (const snapshot of snapshots) {
    const definition = definitions.get(snapshot.id);
    assert(definition, `Missing definition for query-propagation case ${snapshot.id}`);
    assert.equal(
      snapshot.objects.length,
      definition.expectedObjects.length,
      `${snapshot.id}: expected ${definition.expectedObjects.length} shape object(s) with propagation, got ${snapshot.objects.length}`,
    );

    for (const expected of definition.expectedObjects) {
      const object = snapshot.objects.find((entry) => entry.name === expected.name);
      assert(object, `${snapshot.id}: missing propagated shape "${expected.name}"`);
      assert.equal(
        object!.exactRoute.kind,
        expected.exactRouteKind,
        `${snapshot.id}/${expected.name}: expected exact route ${expected.exactRouteKind}, got ${object!.exactRoute.kind}`,
      );
      assert.equal(
        object!.facetedRoute.kind,
        expected.facetedRouteKind,
        `${snapshot.id}/${expected.name}: expected allow-faceted route ${expected.facetedRouteKind}, got ${object!.facetedRoute.kind}`,
      );
      assert.deepEqual(object!.propagationOps, expected.operations, `${snapshot.id}/${expected.name}: propagation ordering changed`);

      const diagnosticCodes = object!.propagations.flatMap((propagation) => propagation.diagnostics.map((diagnostic) => diagnostic.code));
      for (const code of expected.requiredDiagnosticCodes) {
        assert(diagnosticCodes.includes(code), `${snapshot.id}/${expected.name}: missing propagation diagnostic ${code}`);
      }

      for (const code of expected.requiredRouteDiagnosticCodes ?? []) {
        assert(
          object!.exactRoute.diagnosticCodes.includes(code) || object!.facetedRoute.diagnosticCodes.includes(code),
          `${snapshot.id}/${expected.name}: missing route diagnostic ${code}`,
        );
      }

      assertIncludesAll(
        snapshot.id,
        expected.name,
        'preserved-face query',
        collectEntryQueries(object!, 'preservedFaces'),
        expected.requiredPreservedFaceQueries,
      );
      assertIncludesAll(
        snapshot.id,
        expected.name,
        'preserved-edge query',
        collectEntryQueries(object!, 'preservedEdges'),
        expected.requiredPreservedEdgeQueries,
      );
      assertIncludesAll(
        snapshot.id,
        expected.name,
        'created-face query',
        collectEntryQueries(object!, 'createdFaces'),
        expected.requiredCreatedFaceQueries,
      );
      assertIncludesAll(
        snapshot.id,
        expected.name,
        'created-edge query',
        collectEntryQueries(object!, 'createdEdges'),
        expected.requiredCreatedEdgeQueries,
      );
    }
  }
}

function readStoredSnapshots(): QueryPropagationCaseSnapshot[] {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as QueryPropagationCaseSnapshot[];
}

function writeSnapshots(snapshots: QueryPropagationCaseSnapshot[]): void {
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshots, null, 2)}\n`, 'utf-8');
}

export async function runCheckQueryPropagationCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { update, caseId } = parseArgs(argv);
  await init();

  const generated = generateSnapshots(caseId);
  assertExpectedCoverage(generated);

  if (update) {
    writeSnapshots(generated);
    console.log(`✓ Updated query-propagation snapshots at ${SNAPSHOT_PATH}`);
    return;
  }

  const stored = readStoredSnapshots();
  const expected = caseId ? stored.filter((entry) => entry.id === caseId) : stored;

  assert.deepEqual(
    generated,
    expected,
    `Query-propagation snapshots changed. Re-run with "forgecad check query-propagation --update${caseId ? ` --case ${caseId}` : ''}" after reviewing the diff.`,
  );

  console.log(`✓ Query-propagation snapshots passed (${generated.length} case${generated.length === 1 ? '' : 's'})`);
}

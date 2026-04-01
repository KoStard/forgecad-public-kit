#!/usr/bin/env node
/**
 * Compiler invariants and snapshot check.
 *
 * This is a unit-style regression harness for the compiler surface. It records
 * the Forge compile plan, exact BREP lowering, and runtime/lowered Manifold
 * summaries for a curated set of cases so compiler regressions show up as
 * explicit snapshot diffs instead of silent geometry drift.
 */
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { init } from '../src/forge/headless';
import type { CompilerCaseSnapshot, CompilerInspectionInput } from './compiler-inspection';
import { inspectCompilerScene, loadCompilerInspectionInput } from './compiler-inspection';
import { COMPILER_REGRESSION_CORPUS } from './compiler-regression-corpus';
import { CHAMFER_EDGE_WORKFLOW_CODE, FILLET_EDGE_WORKFLOW_CODE } from './edge-finish-fixtures';
import { resolvePackagePath } from './package-runtime';

type CompilerCaseDefinition = {
  id: string;
  description: string;
  input: CompilerInspectionInput;
};

const SNAPSHOT_PATH = resolvePackagePath(import.meta.url, 'cli', 'snapshots', 'compiler-snapshots.json');

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

const CREATED_FACE_DOWNSTREAM_CODE = `
const shellBase = roundedRect(70, 42, 5, true).extrude(22);
const cup = shellBase.shell(2, { openFaces: ['top'] });
const shellPad = rect(6, 4)
  .onFace(cup, 'inner-side-right', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
  .extrude(1.2)
  .toShape();

const holeBase = roundedRect(62, 38, 4, true).extrude(18);
const drilled = holeBase.hole('top', { diameter: 7, u: 12, v: -6, depth: 8 });
const floorButton = circle2d(2.5)
  .onFace(drilled, 'floor', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
  .extrude(1)
  .toShape();

const cutBase = roundedRect(68, 40, 4, true).extrude(20);
const pocket = roundedRect(18, 10, 2, true)
  .onFace(cutBase, 'front', { u: 0, v: 2, selfAnchor: 'center' });
const cut = cutBase.cutout(pocket, { depth: 7 });
const wallTab = rect(4, 3)
  .onFace(cut, 'wall-right', { u: 0, v: 0, protrude: 0.05, selfAnchor: 'center' })
  .extrude(0.9)
  .toShape();

return [
  { name: 'Shell Inner Pad', shape: shellPad },
  { name: 'Hole Floor Button', shape: floorButton },
  { name: 'Cut Wall Tab', shape: wallTab },
];
`;

function inlineCase(id: string, description: string, code: string): CompilerCaseDefinition {
  return {
    id,
    description,
    input: {
      displayPath: `inline:${id}`,
      code,
      fileName: 'main.forge.js',
      allFiles: { 'main.forge.js': code },
    },
  };
}

function fileCase(id: string, description: string, scriptPath: string): CompilerCaseDefinition {
  return {
    id,
    description,
    input: loadCompilerInspectionInput(scriptPath),
  };
}

let _compilerCases: CompilerCaseDefinition[] | undefined;
function getCompilerCases(): CompilerCaseDefinition[] {
  if (_compilerCases) return _compilerCases;
  _compilerCases = [
    inlineCase(
      'exact-boolean-plate',
      'Exact boolean plate with profile booleans and tapered extrude stays on the exact route.',
      `
const ring = difference2d(
  roundedRect(90, 60, 8, true),
  roundedRect(84, 54, 5, true),
);
const leadIn = ring
  .scale([0.96, 0.93])
  .extrude(4, { scaleTop: [1 / 0.96, 1 / 0.93] })
  .translate(0, 0, -4);
const body = roundedRect(96, 66, 8, true).extrude(20).subtract(
  roundedRect(88, 58, 5, true).extrude(18).translate(0, 0, 2),
);
return [{ name: 'Plate', shape: union(body, leadIn) }];
`,
    ),
    inlineCase(
      'transform-heavy-solid',
      'Exact primitives keep transform intent and runtime lowering aligned.',
      `
const pipe = cylinder(60, 5).pointAlong([0, 1, 0]);
const ellipsoid = sphere(6).scale([1.2, 0.8, 0.5]).translate(4, -2, 1);
const body = box(30, 30, 30, true)
  .subtract(pipe)
  .subtract(ellipsoid)
  .mirror([1, 0, 0])
  .rotateAround([0, 0, 1], 20, [0, 0, 0]);
return [{ name: 'Body', shape: body }];
`,
    ),
    inlineCase(
      'split-solid-exact',
      'Shape.split() keeps both branches inside compiler ownership when the cutter is compile-covered.',
      `
const stock = box(48, 24, 20, true).toShape();
const cutter = cylinder(28, 8, undefined, undefined, true)
  .translate(10, 0, 0)
  .rotate(0, 90, 0);
const [inside, outside] = stock.split(cutter);
return [
  { name: 'Inside', shape: inside },
  { name: 'Outside', shape: outside },
];
`,
    ),
    inlineCase(
      'plane-trim-exact',
      'Plane trims and split branches stay compiler-owned across both lowerers.',
      `
const body = box(40, 30, 20, true).toShape();
const trimmed = body.trimByPlane([0, 0, 1], 0);
const [upper, lower] = body.splitByPlane([0, 0, 1], 0);
return [
  { name: 'Trimmed', shape: trimmed },
  { name: 'Upper', shape: upper },
  { name: 'Lower', shape: lower },
];
`,
    ),
    inlineCase(
      'loft-exact',
      'Loft stays compiler-owned and lowerable to both Manifold and CadQuery/OCCT for compatible section stacks.',
      `
const body = loft(
  [
    roundedRect(26, 16, 3, true).translate(-1, 0),
    circle2d(8),
    roundedRect(18, 10, 2, true).translate(2, -1),
  ],
  [0, 14, 28],
);
return [{ name: 'Loft', shape: body }];
`,
    ),
    inlineCase(
      'sweep-exact',
      'Sweep keeps its sampled path intent in the compile graph and exports through the exact lowerer.',
      `
const profile = roundedRect(8, 4, 1.2, true).rotate(18).translate(1.5, 0);
const route = [
  [0, 0, 0],
  [18, 0, 0],
  [28, 8, 4],
  [40, 12, 10],
];
const body = sweep(profile, route, { up: [0, 0, 1], edgeLength: 0.5 });
return [{ name: 'Sweep', shape: body }];
`,
    ),
    inlineCase(
      'shell-exact',
      'Shell keeps semantic intent in the compile graph while exact lowering rewrites it into the supported boolean/extrude subset.',
      `
const body = roundedRect(80, 50, 6, true)
  .extrude(30)
  .translate(4, -3, 2)
  .shell(2.5, { openFaces: ['top'] });
return [{ name: 'Shell', shape: body }];
`,
    ),
    inlineCase(
      'hole-cut-workflows',
      'Through holes, blind holes, and face-anchored cutouts stay compiler-owned and exact-exportable from one semantic workflow family.',
      HOLE_CUT_WORKFLOW_CODE,
    ),
    inlineCase(
      'created-face-downstream',
      'Shell inner walls, blind-hole floors, and cut-created walls stay queryable enough to drive downstream exact-exportable features.',
      CREATED_FACE_DOWNSTREAM_CODE,
    ),
    inlineCase(
      'fillet-edge-workflow',
      'Tracked vertical edge finishing stays compiler-owned through an ordinary union, preserves the selected propagated edge lineage, and still accepts downstream face-driven edits on the base-owner lineage.',
      FILLET_EDGE_WORKFLOW_CODE,
    ),
    inlineCase(
      'chamfer-edge-workflow',
      'Tracked vertical chamfers lower through both backends after a supported union, preserve the selected propagated edge lineage, and still compose with additive and hole-driven edits.',
      CHAMFER_EDGE_WORKFLOW_CODE,
    ),
    inlineCase(
      'repeated-feature-ownership',
      'Mirrored descendants and patterned cuts keep repeated-result ownership visible through booleans and downstream workplanes.',
      `
const plate = roundedRect(90, 56, 6, true).extrude(14);
const boss = roundedRect(18, 12, 3, true)
  .onFace(plate, 'top', { u: -22, v: 12, protrude: 0.5, selfAnchor: 'center' })
  .extrude(10);
const mirroredBoss = boss.toShape().mirror([1, 0, 0]);
const mirroredDrill = circle2d(3)
  .onFace(mirroredBoss, 'top', { u: 0, v: 0, protrude: 0.25, selfAnchor: 'center' })
  .extrude(14);
const slotSeed = roundedRect(12, 4, 1.5, true)
  .onFace(plate, 'top', { u: -24, v: -14, protrude: 0.5, selfAnchor: 'center' })
  .extrude(8);
const slotCuts = linearPattern(slotSeed, 3, 24, 0, 0);
const body = union(
  plate,
  boss,
  mirroredBoss,
).subtract(mirroredDrill).subtract(slotCuts);
return [{ name: 'Repeated Feature Plate', shape: body }];
`,
    ),
    inlineCase(
      'boolean-pattern-query-propagation',
      'Boolean propagation keeps repeated-result descendants reviewable through supported unions and reports duplicate-owner merges explicitly.',
      `
const duplicateSeed = roundedRect(16, 12, 2, true).extrude(10).toShape();
const duplicateUnion = union(
  duplicateSeed,
  duplicateSeed.clone().translate(28, 0, 0),
);

const plate = roundedRect(84, 48, 4, true).extrude(12);
const bossSeed = roundedRect(12, 10, 1.5, true)
  .onFace(plate, 'top', { u: -24, v: 0, protrude: 0.5, selfAnchor: 'center' })
  .extrude(8);
const bosses = linearPattern(bossSeed, 3, 24, 0, 0);
const bossPlate = union(plate, bosses);
const trimmedBossPlate = bossPlate.subtract(
  box(18, 10, 24, true).translate(0, 0, 8),
);

return [
  { name: 'Duplicate Owner Union', shape: duplicateUnion },
  { name: 'Pattern Bosses', shape: bosses },
  { name: 'Trimmed Boss Plate', shape: trimmedBossPlate },
];
`,
    ),
    inlineCase(
      'sketch-on-face-placement',
      'Downstream features keep semantic workplane placement intent in the compile graph and propagate it through later shape transforms.',
      `
const body = roundedRect(20, 12, 2, true).extrude(6, { center: true });
const feature = rect(6, 4)
  .onFace(body, 'top', { u: 2, v: 1, protrude: 0.5, selfAnchor: 'center' })
  .extrude(3)
  .translate(10, -2, 5)
  .rotate(0, 0, 90);
return [{ name: 'Feature', shape: feature }];
`,
    ),
    ...COMPILER_REGRESSION_CORPUS.map((part) => fileCase(part.id, part.description, part.scriptPath)),
    inlineCase(
      'projection-downstream-gasket',
      'Projection-driven downstream sketching keeps explicit projection intent on the sketch and still lowers follow-on face features through both compiler paths.',
      `
const base = roundedRect(40, 24, 4, true).extrude(8, { center: true });
const badge = roundedRect(18, 8, 2, true)
  .onFace(base, 'top', { u: 5, v: -2, protrude: 0.25, selfAnchor: 'center' })
  .extrude(2);
const projected = projectToPlane(badge.toShape(), { plane: 'XY' });
const gasket = projected
  .offset(1.25)
  .onFace(base, 'top', { protrude: 0.25, selfAnchor: 'center' })
  .extrude(0.8);
return [
  { name: 'Projected Badge', sketch: projected },
  { name: 'Gasket', shape: gasket },
];
`,
    ),
    inlineCase(
      'segmented-runtime-hints',
      'Segmented runtime intent stays runnable but outside the exact BREP subset.',
      `
const segmentedDisk = circle2d(12, 18).extrude(4);
const segmentedPost = cylinder(20, 5, undefined, 12);
const segmentedLathe = polygon([
  [6, 0],
  [10, 4],
  [8, 12],
  [0, 12],
]).revolve(240, 24);
return [
  { name: 'Segmented Disk', shape: segmentedDisk },
  { name: 'Segmented Post', shape: segmentedPost },
  { name: 'Segmented Lathe', shape: segmentedLathe },
];
`,
    ),
    inlineCase(
      'sketch-profile-chain',
      'Sketch-only profile chains keep profile lowering aligned with runtime cross-sections.',
      `
const profile = difference2d(
  roundedRect(80, 50, 10, true),
  circle2d(12).translate(18, 0),
  circle2d(8).translate(-18, 0),
)
  .offset(-2)
  .mirror([1, 0])
  .translate(5, -3);
return [{ name: 'Profile', sketch: profile }];
`,
    ),
    fileCase(
      'example-brep-exportable',
      'The public BREP-exportable example stays on the exact compiler route.',
      resolvePackagePath(import.meta.url, 'examples', 'api', 'brep-exportable.forge.js'),
    ),
  ];
  return _compilerCases;
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
    if (!Number.isFinite(value)) return null as T;
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

function generateSnapshots(caseId?: string): CompilerCaseSnapshot[] {
  const cases = getCompilerCases();
  const selected = caseId ? cases.filter((entry) => entry.id === caseId) : cases;
  if (selected.length === 0) {
    throw new Error(`Unknown compiler snapshot case: ${caseId}`);
  }

  return selected.map((entry) =>
    stripUndefinedDeep({
      id: entry.id,
      description: entry.description,
      scene: inspectCompilerScene(entry.input),
    }),
  );
}

function isFaceQueryKind(kind: unknown): boolean {
  return (
    kind === 'canonical-face' || kind === 'tracked-face' || kind === 'face-ref' || kind === 'propagated-face' || kind === 'created-face'
  );
}

function isEdgeQueryKind(kind: unknown): boolean {
  return kind === 'tracked-edge' || kind === 'edge-ref' || kind === 'propagated-edge' || kind === 'created-edge';
}

function assertPropagationQueryShape(
  snapshotId: string,
  objectName: string,
  rewriteId: string,
  label: string,
  queryKind: 'face' | 'edge',
  query: unknown,
  issues: string[],
  enforceRewriteId = true,
): void {
  if (!query || typeof query !== 'object') {
    issues.push(`${snapshotId}/${objectName}: ${label} is missing a query object`);
    return;
  }

  const candidate = query as { kind?: unknown; rewriteId?: unknown };
  if (queryKind === 'face' && !isFaceQueryKind(candidate.kind)) {
    issues.push(`${snapshotId}/${objectName}: ${label} should carry a face-query ref, got ${String(candidate.kind)}`);
    return;
  }
  if (queryKind === 'edge' && !isEdgeQueryKind(candidate.kind)) {
    issues.push(`${snapshotId}/${objectName}: ${label} should carry an edge-query ref, got ${String(candidate.kind)}`);
    return;
  }
  if (
    enforceRewriteId &&
    (candidate.kind === 'propagated-face' ||
      candidate.kind === 'created-face' ||
      candidate.kind === 'propagated-edge' ||
      candidate.kind === 'created-edge') &&
    candidate.rewriteId !== rewriteId
  ) {
    issues.push(
      `${snapshotId}/${objectName}: ${label} rewriteId ${String(candidate.rewriteId)} does not match parent propagation ${rewriteId}`,
    );
  }
}

function assertLoweredRuntimeMatches(snapshots: CompilerCaseSnapshot[]): void {
  const mismatches: string[] = [];

  for (const snapshot of snapshots) {
    for (const object of snapshot.scene.objects) {
      if (object.loweredRuntimeError) {
        mismatches.push(`${snapshot.id}/${object.name}: lowering failed (${object.loweredRuntimeError})`);
        continue;
      }
      if (object.kind === 'shape' && object.compilePlan && object.loweredRuntimeMatches !== true) {
        mismatches.push(`${snapshot.id}/${object.name}: runtime shape diverged from compiler Manifold lowering`);
      }
      if (object.kind === 'sketch' && object.compilePlan && object.loweredRuntimeMatches !== true) {
        mismatches.push(`${snapshot.id}/${object.name}: runtime sketch diverged from compiler profile lowering`);
      }
    }
  }

  assert.equal(mismatches.length, 0, `Compiler/runtime mismatch:\n${mismatches.map((line) => `- ${line}`).join('\n')}`);
}

function assertCompilerRoutingIntegrity(snapshots: CompilerCaseSnapshot[]): void {
  const issues: string[] = [];

  for (const snapshot of snapshots) {
    const exactObjects = new Map(snapshot.scene.exactExport.objects.map((object) => [object.name, object]));
    const facetedObjects = new Map(snapshot.scene.facetedExport.objects.map((object) => [object.name, object]));
    const exactUnsupported = new Set(snapshot.scene.exactExport.unsupported.map((item) => item.name));
    const facetedUnsupported = new Set(snapshot.scene.facetedExport.unsupported.map((item) => item.name));
    const facetedFallbacks = new Set(snapshot.scene.facetedExport.fallbacks.map((item) => item.name));
    const skippedObjects = new Set(snapshot.scene.exactExport.skipped.map((item) => item.name));

    for (const object of snapshot.scene.objects) {
      if (object.kind === 'shape') {
        if (object.cadqueryOcct.supported && object.cadqueryOcct.plan == null) {
          issues.push(`${snapshot.id}/${object.name}: CadQuery/OCCT target marked supported without a lowered plan`);
        }
        if (!object.cadqueryOcct.supported && object.cadqueryOcct.diagnostics.length === 0) {
          issues.push(`${snapshot.id}/${object.name}: CadQuery/OCCT target marked unsupported without diagnostics`);
        }
        if (object.compilePlan && object.loweredRuntime == null && object.loweredRuntimeError == null) {
          issues.push(`${snapshot.id}/${object.name}: compile-covered runtime object missing lowered runtime summary`);
        }

        const exactExportObject = exactObjects.get(object.name);
        const facetedExportObject = facetedObjects.get(object.name);

        if (object.exactRoute.kind === 'exact') {
          if (!object.cadqueryOcct.supported) {
            issues.push(`${snapshot.id}/${object.name}: exact route is exact but CadQuery/OCCT target is unsupported`);
          }
          if (!exactExportObject || exactExportObject.kind !== 'exact') {
            issues.push(`${snapshot.id}/${object.name}: exact-exportable shape missing from exact export manifest`);
          }
          if (exactUnsupported.has(object.name)) {
            issues.push(`${snapshot.id}/${object.name}: exact-route shape still reported as unsupported in exact manifest`);
          }
        } else if (object.exactRoute.kind === 'unsupported') {
          if (object.cadqueryOcct.supported) {
            issues.push(`${snapshot.id}/${object.name}: exact route is unsupported but CadQuery/OCCT target is marked supported`);
          }
          if (!exactUnsupported.has(object.name)) {
            issues.push(`${snapshot.id}/${object.name}: exact-unsupported shape missing from exact export blockers`);
          }
        } else {
          issues.push(`${snapshot.id}/${object.name}: unexpected exact route kind for shape (${object.exactRoute.kind})`);
        }

        switch (object.facetedRoute.kind) {
          case 'exact':
            if (!facetedExportObject || facetedExportObject.kind !== 'exact') {
              issues.push(`${snapshot.id}/${object.name}: exact-route shape missing from allow-faceted export manifest as exact`);
            }
            if (facetedFallbacks.has(object.name) || facetedUnsupported.has(object.name)) {
              issues.push(`${snapshot.id}/${object.name}: exact-route shape still reported as fallback or unsupported with allow-faceted`);
            }
            break;
          case 'faceted':
            if (object.cadqueryOcct.supported) {
              issues.push(`${snapshot.id}/${object.name}: faceted route selected even though CadQuery/OCCT target is supported`);
            }
            if (!object.facetedMesh.supported) {
              issues.push(`${snapshot.id}/${object.name}: faceted route selected but faceted mesh target is unsupported`);
            }
            if (!facetedExportObject || facetedExportObject.kind !== 'faceted') {
              issues.push(`${snapshot.id}/${object.name}: faceted-route shape missing from allow-faceted manifest`);
            }
            if (!facetedFallbacks.has(object.name)) {
              issues.push(`${snapshot.id}/${object.name}: faceted-route shape missing fallback record`);
            }
            if (facetedUnsupported.has(object.name)) {
              issues.push(`${snapshot.id}/${object.name}: faceted-route shape still marked unsupported with allow-faceted`);
            }
            break;
          case 'unsupported':
            if (object.facetedMesh.supported && !object.cadqueryOcct.supported) {
              issues.push(`${snapshot.id}/${object.name}: allow-faceted route stayed unsupported despite faceted mesh support`);
            }
            if (!facetedUnsupported.has(object.name)) {
              issues.push(`${snapshot.id}/${object.name}: allow-faceted unsupported shape missing from manifest blockers`);
            }
            if (facetedExportObject || facetedFallbacks.has(object.name)) {
              issues.push(`${snapshot.id}/${object.name}: allow-faceted unsupported shape leaked into manifest objects/fallbacks`);
            }
            break;
          default:
            issues.push(`${snapshot.id}/${object.name}: unexpected allow-faceted route kind for shape (${object.facetedRoute.kind})`);
        }
        continue;
      }

      if (object.exactRoute.kind !== 'skipped') {
        issues.push(`${snapshot.id}/${object.name}: sketch exact route should be skipped, got ${object.exactRoute.kind}`);
      }
      if (object.facetedRoute.kind !== 'skipped') {
        issues.push(`${snapshot.id}/${object.name}: sketch allow-faceted route should be skipped, got ${object.facetedRoute.kind}`);
      }
      if (!skippedObjects.has(object.name)) {
        issues.push(`${snapshot.id}/${object.name}: sketch missing from export skip list`);
      }
      if (!snapshot.scene.facetedExport.skipped.some((item) => item.name === object.name)) {
        issues.push(`${snapshot.id}/${object.name}: sketch missing from allow-faceted export skip list`);
      }
      if (object.cadqueryOcctProfile.supported && object.cadqueryOcctProfile.plan == null) {
        issues.push(`${snapshot.id}/${object.name}: CadQuery/OCCT profile marked supported without a lowered plan`);
      }
      if (!object.cadqueryOcctProfile.supported && object.cadqueryOcctProfile.diagnostics.length === 0) {
        issues.push(`${snapshot.id}/${object.name}: CadQuery/OCCT profile marked unsupported without diagnostics`);
      }
      if (object.compilePlan && object.loweredRuntime == null && object.loweredRuntimeError == null) {
        issues.push(`${snapshot.id}/${object.name}: compile-covered sketch missing lowered runtime summary`);
      }
    }
  }

  assert.equal(issues.length, 0, `Compiler routing integrity failed:\n${issues.map((line) => `- ${line}`).join('\n')}`);
}

function assertTopologyRewritePropagationIntegrity(snapshots: CompilerCaseSnapshot[]): void {
  const issues: string[] = [];

  for (const snapshot of snapshots) {
    for (const object of snapshot.scene.objects) {
      if (object.kind !== 'shape') continue;
      if (!object.compilePlan && object.topologyRewritePropagations.length > 0) {
        issues.push(`${snapshot.id}/${object.name}: propagation metadata exists without a compile plan`);
      }

      const seenRewriteIds = new Set<string>();
      for (const propagation of object.topologyRewritePropagations) {
        if (seenRewriteIds.has(propagation.rewriteId)) {
          issues.push(`${snapshot.id}/${object.name}: duplicate topology-rewrite id ${propagation.rewriteId}`);
        }
        seenRewriteIds.add(propagation.rewriteId);

        if (propagation.owner && propagation.owner.id !== propagation.rewriteId) {
          issues.push(
            `${snapshot.id}/${object.name}: propagation ${propagation.operation} owner id ${propagation.owner.id} should match rewriteId ${propagation.rewriteId}`,
          );
        }

        for (const entry of propagation.preservedFaces) {
          assertPropagationQueryShape(snapshot.id, object.name, propagation.rewriteId, 'preservedFaces[]', 'face', entry.query, issues);
          if ((entry.query as { kind: string }).kind !== 'propagated-face') {
            issues.push(`${snapshot.id}/${object.name}: preserved face entries must use propagated-face queries`);
          }
        }
        for (const entry of propagation.preservedEdges) {
          assertPropagationQueryShape(snapshot.id, object.name, propagation.rewriteId, 'preservedEdges[]', 'edge', entry.query, issues);
          if ((entry.query as { kind: string }).kind !== 'propagated-edge') {
            issues.push(`${snapshot.id}/${object.name}: preserved edge entries must use propagated-edge queries`);
          }
        }
        for (const entry of propagation.createdFaces) {
          assertPropagationQueryShape(snapshot.id, object.name, propagation.rewriteId, 'createdFaces[]', 'face', entry.query, issues);
          if ((entry.query as { kind: string }).kind !== 'created-face') {
            issues.push(`${snapshot.id}/${object.name}: created face entries must use created-face queries`);
          }
        }
        for (const entry of propagation.createdEdges) {
          assertPropagationQueryShape(snapshot.id, object.name, propagation.rewriteId, 'createdEdges[]', 'edge', entry.query, issues);
          if ((entry.query as { kind: string }).kind !== 'created-edge') {
            issues.push(`${snapshot.id}/${object.name}: created edge entries must use created-edge queries`);
          }
        }
        for (const diagnostic of propagation.diagnostics) {
          if (diagnostic.source) {
            assertPropagationQueryShape(
              snapshot.id,
              object.name,
              propagation.rewriteId,
              `diagnostic(${diagnostic.code}).source`,
              diagnostic.queryKind,
              diagnostic.source,
              issues,
              false,
            );
          }
          if (diagnostic.query) {
            assertPropagationQueryShape(
              snapshot.id,
              object.name,
              propagation.rewriteId,
              `diagnostic(${diagnostic.code}).query`,
              diagnostic.queryKind,
              diagnostic.query,
              issues,
            );
          }
        }
      }
    }
  }

  assert.equal(issues.length, 0, `Topology-rewrite propagation integrity failed:\n${issues.map((line) => `- ${line}`).join('\n')}`);
}

function readStoredSnapshots(): CompilerCaseSnapshot[] {
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf-8')) as CompilerCaseSnapshot[];
}

function writeSnapshots(snapshots: CompilerCaseSnapshot[]): void {
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshots, null, 2)}\n`, 'utf-8');
}

export async function runCheckCompilerCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { update, caseId } = parseArgs(argv);
  await init();

  const generated = generateSnapshots(caseId);
  assertLoweredRuntimeMatches(generated);
  assertCompilerRoutingIntegrity(generated);
  assertTopologyRewritePropagationIntegrity(generated);

  if (update) {
    writeSnapshots(generated);
    console.log(`✓ Updated compiler snapshots at ${SNAPSHOT_PATH}`);
    return;
  }

  const stored = readStoredSnapshots();
  const expected = caseId ? stored.filter((entry) => entry.id === caseId) : stored;

  assert.deepEqual(
    generated,
    expected,
    `Compiler snapshots changed. Re-run with "forgecad check compiler --update${caseId ? ` --case ${caseId}` : ''}" after reviewing the diff.`,
  );

  console.log(`✓ Compiler snapshots passed (${generated.length} case${generated.length === 1 ? '' : 's'})`);
}

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
import { resolvePackagePath } from './package-runtime';

type CompilerCaseDefinition = {
  id: string;
  description: string;
  input: CompilerInspectionInput;
};

const SNAPSHOT_PATH = resolvePackagePath(import.meta.url, 'cli', 'snapshots', 'compiler-snapshots.json');

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

const COMPILER_CASES: CompilerCaseDefinition[] = [
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
  inlineCase(
    'hull-runtime-boundary',
    'Hull intent stays compiler-owned for Manifold lowering while exact export remains explicitly unsupported.',
    `
const rib = hull3d(
  cylinder(20, 3).translate(-10, 0, 0),
  cylinder(20, 3).translate(10, 0, 0),
  [0, 0, 26],
);
const convexPost = box(12, 8, 20, true)
  .toShape()
  .rotateAround([0, 0, 1], 25, [0, 0, 0])
  .hull();
const tab = hull2d(
  circle2d(6).translate(-10, 0),
  circle2d(6).translate(10, 0),
).translate(0, 4);
const collar = polygon([
  [0, 0],
  [8, 0],
  [4, 5],
]).translate(0, 16).hull();
return [
  { name: 'Rib', shape: rib },
  { name: 'Convex Post', shape: convexPost },
  { name: 'Tab', sketch: tab },
  { name: 'Collar', sketch: collar },
];
`,
  ),
  inlineCase(
    'mixed-scene-and-fallback',
    'Mixed scenes and compile-plan gaps route cleanly through exact and faceted decisions.',
    `
const plate = rect(40, 24).extrude(8);
const slot2d = slot(18, 6).translate(0, -20);
const warped = sphere(8).warp((vert) => {
  vert[2] += Math.sin(vert[0] * 0.2) * 0.8;
});
return [
  { name: 'Plate', shape: plate },
  { name: 'Slot', sketch: slot2d },
  { name: 'Warped', shape: warped },
];
`,
  ),
  fileCase(
    'example-brep-exportable',
    'The public BREP-exportable example stays on the exact compiler route.',
    'examples/api/brep-exportable.forge.js',
  ),
];

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
  const selected = caseId
    ? COMPILER_CASES.filter((entry) => entry.id === caseId)
    : COMPILER_CASES;
  if (selected.length === 0) {
    throw new Error(`Unknown compiler snapshot case: ${caseId}`);
  }

  return selected.map((entry) => stripUndefinedDeep({
    id: entry.id,
    description: entry.description,
    scene: inspectCompilerScene(entry.input),
  }));
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

  assert.equal(
    mismatches.length,
    0,
    `Compiler/runtime mismatch:\n${mismatches.map((line) => `- ${line}`).join('\n')}`,
  );
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

  assert.equal(
    issues.length,
    0,
    `Compiler routing integrity failed:\n${issues.map((line) => `- ${line}`).join('\n')}`,
  );
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

  if (update) {
    writeSnapshots(generated);
    console.log(`✓ Updated compiler snapshots at ${SNAPSHOT_PATH}`);
    return;
  }

  const stored = readStoredSnapshots();
  const expected = caseId
    ? stored.filter((entry) => entry.id === caseId)
    : stored;

  assert.deepEqual(
    generated,
    expected,
    `Compiler snapshots changed. Re-run with "forgecad check compiler --update${caseId ? ` --case ${caseId}` : ''}" after reviewing the diff.`,
  );

  console.log(`✓ Compiler snapshots passed (${generated.length} case${generated.length === 1 ? '' : 's'})`);
}

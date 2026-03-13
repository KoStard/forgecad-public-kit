#!/usr/bin/env node
/**
 * Example architecture gate.
 *
 * Inventories every runnable example artifact under `examples/`, verifies that
 * each one is classified in the checked manifest, and runs the declared
 * validation path for that entry. Part examples can additionally opt into exact
 * or faceted route assertions; holdouts still have to execute successfully but
 * are kept outside the exact-route contract until their migration task lands.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { init, runScript, type RunResult } from '../src/forge/headless';
import { buildCompiledSceneReport } from '../src/forge/compiledScene';
import { collectProjectFiles } from './collect-files';
import { EXAMPLE_MANIFEST, EXAMPLE_MANIFEST_FAMILIES, listExampleArtifacts } from './example-manifest';
import type {
  AssemblyExampleManifestEntry,
  ExampleManifestEntry,
  ExampleManifestFamily,
  ExampleValidationClass,
  ExampleValidationPath,
  ExperimentalExampleManifestEntry,
  NonPartValidationExpectations,
  NotebookExampleManifestEntry,
  PartExampleManifestEntry,
  RuntimeSceneExampleManifestEntry,
  SketchExampleManifestEntry,
} from './example-manifest/types';
import { materializeNotebookPreviewScript } from './notebook-entry';
import { buildSketchSvgDocument } from './sketch-svg';

type ParsedArgs = {
  families: ExampleManifestFamily[];
  examples: string[];
};

const VALIDATION_PATH_BY_CLASS: Record<ExampleValidationClass, ExampleValidationPath> = {
  part: 'part-runtime',
  assembly: 'assembly-runtime',
  'runtime-scene': 'runtime-scene',
  sketch: 'sketch-svg',
  notebook: 'notebook-preview',
  experimental: 'experimental-runtime',
};

function normalizeManifestPath(path: string): string {
  return path.replaceAll('\\', '/');
}

function parseArgs(argv: string[]): ParsedArgs {
  const families: ExampleManifestFamily[] = [];
  const examples: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--family') {
      const family = argv[index + 1] as ExampleManifestFamily | undefined;
      if (!family) throw new Error('--family requires a manifest family id');
      if (!EXAMPLE_MANIFEST_FAMILIES.includes(family)) {
        throw new Error(`Unknown example manifest family "${family}". Expected one of: ${EXAMPLE_MANIFEST_FAMILIES.join(', ')}`);
      }
      families.push(family);
      index += 1;
      continue;
    }
    if (arg === '--example') {
      const examplePath = argv[index + 1];
      if (!examplePath) throw new Error('--example requires a manifest path');
      examples.push(normalizeManifestPath(examplePath));
      index += 1;
      continue;
    }
    throw new Error(`Unknown flag: ${arg}`);
  }

  return { families, examples };
}

function assertManifestCoverage(entries: ExampleManifestEntry[]): void {
  const manifestPaths = entries.map((entry) => entry.path);
  const duplicates = manifestPaths.filter((path, index) => manifestPaths.indexOf(path) !== index);
  const duplicatePaths = [...new Set(duplicates)].sort();
  const discovered = listExampleArtifacts();

  const manifestSet = new Set(manifestPaths);
  const discoveredSet = new Set(discovered);

  const unclassified = discovered.filter((path) => !manifestSet.has(path));
  const missingFiles = manifestPaths.filter((path) => !discoveredSet.has(path));

  const issues: string[] = [];
  if (duplicatePaths.length > 0) {
    issues.push(`Duplicate manifest entries:\n${duplicatePaths.map((path) => `  - ${path}`).join('\n')}`);
  }
  if (unclassified.length > 0) {
    issues.push(`Unclassified example artifacts:\n${unclassified.map((path) => `  - ${path}`).join('\n')}`);
  }
  if (missingFiles.length > 0) {
    issues.push(`Manifest entries that point at missing files:\n${missingFiles.map((path) => `  - ${path}`).join('\n')}`);
  }

  if (issues.length > 0) {
    throw new Error(`Example manifest coverage failed.\n\n${issues.join('\n\n')}`);
  }
}

function assertManifestEntryIntegrity(entry: ExampleManifestEntry): void {
  assert.equal(
    entry.validation,
    VALIDATION_PATH_BY_CLASS[entry.class],
    `${entry.path}: manifest validation path "${entry.validation}" does not match class "${entry.class}"`,
  );

  if (entry.class === 'part' && entry.route.kind === 'holdout') {
    assert(entry.route.blocker.trim().length > 0, `${entry.path}: part holdouts must declare a blocker`);
    assert(entry.route.taskRef.trim().length > 0, `${entry.path}: part holdouts must declare a follow-up task`);
  }
  if (entry.class === 'part' && entry.route.kind === 'faceted') {
    assert(entry.route.blocker.trim().length > 0, `${entry.path}: faceted part expectations must declare why exact is blocked`);
  }
  if (entry.class === 'experimental') {
    const experimental = entry as ExperimentalExampleManifestEntry;
    assert(experimental.blocker.trim().length > 0, `${entry.path}: experimental entries must declare a blocker`);
    assert(experimental.taskRef.trim().length > 0, `${entry.path}: experimental entries must declare a follow-up task`);
  }
}

function selectEntries(entries: ExampleManifestEntry[], args: ParsedArgs): ExampleManifestEntry[] {
  let selected = entries;
  if (args.families.length > 0) {
    const familySet = new Set(args.families);
    selected = selected.filter((entry) => familySet.has(entry.family));
  }
  if (args.examples.length > 0) {
    const exampleSet = new Set(args.examples);
    const missingExamples = args.examples.filter((path) => !entries.some((entry) => entry.path === path));
    if (missingExamples.length > 0) {
      throw new Error(`Unknown manifest example path(s): ${missingExamples.join(', ')}`);
    }
    selected = selected.filter((entry) => exampleSet.has(entry.path));
  }
  return selected;
}

function executeExample(entry: ExampleManifestEntry): RunResult {
  const materialized = materializeNotebookPreviewScript(entry.path);
  try {
    const runnablePath = resolve(materialized.runnablePath);
    const code = readFileSync(runnablePath, 'utf-8');
    const { allFiles, fileName } = collectProjectFiles(runnablePath);
    const result = runScript(code, fileName, allFiles);
    if (result.error) {
      throw new Error(`${entry.path}: ${result.error}`);
    }
    assert(result.objects.length > 0, `${entry.path}: example executed but produced no scene objects`);
    return result;
  } finally {
    materialized.cleanup();
  }
}

function assertMinimum(entryPath: string, actual: number, minimum: number | undefined, label: string): void {
  if (minimum == null) return;
  assert(actual >= minimum, `${entryPath}: expected at least ${minimum} ${label}, got ${actual}`);
}

function applyNonPartExpectations(
  entryPath: string,
  result: RunResult,
  expectations: NonPartValidationExpectations | undefined,
): void {
  if (!expectations) return;

  const objectCount = result.objects.length;
  const shapeCount = result.objects.filter((object) => object.shape).length;
  const sketchCount = result.objects.filter((object) => object.sketch).length;
  const uniqueGroups = new Set(
    result.objects
      .map((object) => object.groupName)
      .filter((groupName): groupName is string => typeof groupName === 'string' && groupName.length > 0),
  ).size;
  const jointCount = result.jointsView?.joints.length ?? 0;
  const animationCount = result.jointsView?.animations.length ?? 0;

  assertMinimum(entryPath, objectCount, expectations.minObjectCount, 'scene object(s)');
  assertMinimum(entryPath, shapeCount, expectations.minShapeObjects, 'shape object(s)');
  assertMinimum(entryPath, sketchCount, expectations.minSketchObjects, 'sketch object(s)');
  assertMinimum(entryPath, uniqueGroups, expectations.minUniqueGroups, 'named group(s)');
  assertMinimum(entryPath, result.bom.length, expectations.minBomEntries, 'BOM entrie(s)');
  assertMinimum(entryPath, result.cutPlanes.length, expectations.minCutPlanes, 'cut plane(s)');
  assertMinimum(entryPath, jointCount, expectations.minJoints, 'jointsView joint(s)');
  assertMinimum(entryPath, animationCount, expectations.minAnimations, 'jointsView animation(s)');

  if (
    expectations.requireRobotExport
    || expectations.minRobotParts != null
    || expectations.minRobotJoints != null
  ) {
    assert(result.robotExport, `${entryPath}: expected robotExport(...) data to stay available to the example gate`);
    if (!result.robotExport) return;
    assertMinimum(entryPath, result.robotExport.assembly.parts.length, expectations.minRobotParts, 'robot part(s)');
    assertMinimum(entryPath, result.robotExport.assembly.joints.length, expectations.minRobotJoints, 'robot joint(s)');
  }
}

function validateAssemblyEntry(entry: AssemblyExampleManifestEntry): void {
  const result = executeExample(entry);
  const shapeCount = result.objects.filter((object) => object.shape).length;
  assert(shapeCount >= 2, `${entry.path}: assembly validation expected at least two shape objects in the solved scene`);
  applyNonPartExpectations(entry.path, result, entry.expect);
}

function validateRuntimeSceneEntry(entry: RuntimeSceneExampleManifestEntry): void {
  const result = executeExample(entry);
  applyNonPartExpectations(entry.path, result, entry.expect);
}

function validateSketchEntry(entry: SketchExampleManifestEntry): void {
  const result = executeExample(entry);
  const sketchEntries = result.objects
    .filter((object): object is typeof object & { sketch: NonNullable<typeof object.sketch> } => object.sketch != null)
    .map((object) => ({ name: object.name, sketch: object.sketch }));

  assert(sketchEntries.length > 0, `${entry.path}: sketch validation requires at least one returned Sketch object`);
  const svgDocument = buildSketchSvgDocument(sketchEntries);
  assert(svgDocument.pathCount > 0, `${entry.path}: sketch SVG validation expected at least one rendered SVG path`);
  applyNonPartExpectations(entry.path, result, entry.expect);
}

function validateNotebookEntry(entry: NotebookExampleManifestEntry): void {
  const result = executeExample(entry);
  const hasRenderablePayload = result.objects.some((object) => object.shape || object.sketch);
  assert(hasRenderablePayload, `${entry.path}: notebook preview validation expected at least one shape or sketch`);
  applyNonPartExpectations(entry.path, result, entry.expect);
}

function validatePartEntry(entry: PartExampleManifestEntry): void {
  const result = executeExample(entry);
  const compiledSceneReport = buildCompiledSceneReport(result.objects);
  const allShapeObjects = compiledSceneReport.objects.filter((object) => object.kind === 'shape');

  const shapeObjects = (() => {
    if (!entry.primaryShapes || entry.primaryShapes.length === 0) {
      return allShapeObjects;
    }
    const requested = new Set(entry.primaryShapes);
    const matched = allShapeObjects.filter((object) => requested.has(object.name));
    const missing = entry.primaryShapes.filter((name) => !matched.some((object) => object.name === name));
    assert.equal(
      missing.length,
      0,
      `${entry.path}: manifest primary shape selection references missing object(s): ${missing.join(', ')}`,
    );
    return matched;
  })();

  assert(allShapeObjects.length > 0, `${entry.path}: part validation requires at least one shape object`);
  assert(shapeObjects.length > 0, `${entry.path}: part validation requires at least one selected primary shape object`);

  if (entry.route.kind === 'holdout') {
    return;
  }

  if (entry.route.kind === 'exact') {
    const blockers = shapeObjects.filter((object) => object.routes.exact.kind !== 'exact');
    assert.equal(
      blockers.length,
      0,
      `${entry.path}: expected exact routing for all shape objects, but found blockers on ${blockers
        .map((object) => `"${object.name}" (${object.routes.exact.kind})`)
        .join(', ')}`,
    );
    return;
  }

  const exactUnexpected = shapeObjects.filter((object) => object.routes.exact.kind !== 'unsupported');
  assert.equal(
    exactUnexpected.length,
    0,
    `${entry.path}: expected exact routing to stay blocked for faceted example, but these objects were not exact-blocked: ${exactUnexpected
      .map((object) => `"${object.name}" (${object.routes.exact.kind})`)
      .join(', ')}`,
  );

  const facetedFailures = shapeObjects.filter((object) => object.routes.faceted.kind !== 'faceted');
  assert.equal(
    facetedFailures.length,
    0,
    `${entry.path}: expected allow-faceted routing to succeed, but these objects did not use the faceted route: ${facetedFailures
      .map((object) => `"${object.name}" (${object.routes.faceted.kind})`)
      .join(', ')}`,
  );

  const diagnosticFailures = shapeObjects.filter(
    (object) => object.routes.faceted.kind === 'faceted' && object.routes.faceted.diagnostics.length === 0,
  );
  assert.equal(
    diagnosticFailures.length,
    0,
    `${entry.path}: faceted expectations must carry explicit compiler diagnostics for ${diagnosticFailures
      .map((object) => `"${object.name}"`)
      .join(', ')}`,
  );
}

function validateEntry(entry: ExampleManifestEntry): void {
  switch (entry.validation) {
    case 'part-runtime':
      assert.equal(entry.class, 'part', `${entry.path}: part-runtime entries must use the part class`);
      validatePartEntry(entry);
      return;
    case 'assembly-runtime':
      assert.equal(entry.class, 'assembly', `${entry.path}: assembly-runtime entries must use the assembly class`);
      validateAssemblyEntry(entry);
      return;
    case 'runtime-scene':
      assert.equal(entry.class, 'runtime-scene', `${entry.path}: runtime-scene validation must use the runtime-scene class`);
      validateRuntimeSceneEntry(entry);
      return;
    case 'sketch-svg':
      assert.equal(entry.class, 'sketch', `${entry.path}: sketch-svg entries must use the sketch class`);
      validateSketchEntry(entry);
      return;
    case 'notebook-preview':
      assert.equal(entry.class, 'notebook', `${entry.path}: notebook-preview entries must use the notebook class`);
      validateNotebookEntry(entry);
      return;
    case 'experimental-runtime':
      assert.equal(entry.class, 'experimental', `${entry.path}: experimental-runtime entries must use the experimental class`);
      executeExample(entry);
      return;
  }
}

function familyBreakdown(entries: ExampleManifestEntry[]): string[] {
  return EXAMPLE_MANIFEST_FAMILIES
    .map((family) => {
      const familyEntries = entries.filter((entry) => entry.family === family);
      if (familyEntries.length === 0) return null;

      const classes = new Map<string, number>();
      for (const entry of familyEntries) {
        classes.set(entry.class, (classes.get(entry.class) ?? 0) + 1);
      }

      const classSummary = [...classes.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([klass, count]) => `${klass}:${count}`)
        .join(', ');
      return `  ${family}: ${familyEntries.length} artifact(s) [${classSummary}]`;
    })
    .filter((line): line is string => line != null);
}

function routeBreakdown(entries: ExampleManifestEntry[]): string {
  const parts = entries.filter((entry) => entry.class === 'part') as PartExampleManifestEntry[];
  const counts = { exact: 0, faceted: 0, holdout: 0 };
  for (const entry of parts) {
    counts[entry.route.kind] += 1;
  }
  return `  part routes: exact:${counts.exact}, faceted:${counts.faceted}, holdout:${counts.holdout}`;
}

export async function runCheckExamplesCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);

  assertManifestCoverage(EXAMPLE_MANIFEST);
  EXAMPLE_MANIFEST.forEach(assertManifestEntryIntegrity);

  const selected = selectEntries(EXAMPLE_MANIFEST, args);
  assert(selected.length > 0, 'No example manifest entries matched the requested filter');

  await init();
  for (const entry of selected) {
    validateEntry(entry);
  }

  console.log('✓ Example architecture gate passed');
  console.log(`  checked: ${selected.length} artifact(s)`);
  console.log(`  manifest coverage: ${EXAMPLE_MANIFEST.length} artifact(s)`);
  for (const line of familyBreakdown(selected)) {
    console.log(line);
  }
  console.log(routeBreakdown(selected));
}

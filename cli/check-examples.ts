#!/usr/bin/env node
/**
 * Example architecture gate.
 *
 * Inventories every runnable example artifact under `examples/`, verifies that
 * each one is classified in the checked manifest, and runs the validation path
 * assigned to that class. Part examples can additionally opt into exact or
 * faceted route assertions; holdouts still have to execute successfully but are
 * kept outside the exact-route contract until their migration task lands.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { init, runScript } from '../src/forge/headless';
import { buildCompiledSceneReport } from '../src/forge/compiledScene';
import { collectProjectFiles } from './collect-files';
import { EXAMPLE_MANIFEST, EXAMPLE_MANIFEST_FAMILIES, listExampleArtifacts } from './example-manifest';
import type {
  ExampleManifestEntry,
  ExampleManifestFamily,
  ExperimentalExampleManifestEntry,
  NotebookExampleManifestEntry,
  PartExampleManifestEntry,
  SketchExampleManifestEntry,
} from './example-manifest/types';
import { materializeNotebookPreviewScript } from './notebook-entry';

type ParsedArgs = {
  families: ExampleManifestFamily[];
  examples: string[];
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

function executeExample(entry: ExampleManifestEntry) {
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

function validateSketchEntry(entry: SketchExampleManifestEntry): void {
  const result = executeExample(entry);
  const sketchObject = result.objects.find((object) => object.sketch);
  assert(sketchObject?.sketch, `${entry.path}: sketch validation requires a returned Sketch object`);
  const polygons = sketchObject.sketch.toPolygons();
  assert(polygons.length > 0, `${entry.path}: sketch validation expected at least one polygon`);
}

function validateNotebookEntry(entry: NotebookExampleManifestEntry): void {
  const result = executeExample(entry);
  const hasRenderablePayload = result.objects.some((object) => object.shape || object.sketch);
  assert(hasRenderablePayload, `${entry.path}: notebook preview validation expected at least one shape or sketch`);
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
  switch (entry.class) {
    case 'part':
      validatePartEntry(entry);
      return;
    case 'assembly': {
      const result = executeExample(entry);
      const shapeCount = result.objects.filter((object) => object.shape).length;
      assert(shapeCount >= 2, `${entry.path}: assembly validation expected at least two shape objects in the solved scene`);
      return;
    }
    case 'runtime-scene':
      executeExample(entry);
      return;
    case 'sketch':
      validateSketchEntry(entry);
      return;
    case 'notebook':
      validateNotebookEntry(entry);
      return;
    case 'experimental':
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

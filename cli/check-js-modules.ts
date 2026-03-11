#!/usr/bin/env node
/**
 * JS module import invariants.
 *
 * Ensures ForgeCAD entry files can use ESM imports, utility .js modules
 * can use exports/default exports or top-level return values, `require(...)`
 * shares the same cache, and virtual `forgecad` imports resolve inside
 * utility modules.
 */
import { resolve } from 'path';
import { init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';

function fail(message: string): never {
  throw new Error(message);
}

function expect(condition: boolean, message: string): void {
  if (!condition) fail(message);
}

function close(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) <= eps;
}

function expectVec(actual: number[], expected: [number, number, number], label: string): void {
  expect(actual.length === expected.length, `${label} length mismatch`);
  const ok = actual.every((value, index) => close(value, expected[index]));
  expect(ok, `${label} expected [${expected.join(', ')}], got [${actual.join(', ')}]`);
}

export async function runCheckJsModulesCli(): Promise<void> {
  await init();

  const scriptPath = resolve('examples/api/js-module-imports.forge.js');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);
  const code = allFiles[fileName];
  expect(typeof code === 'string', `Missing collected entry file "${fileName}"`);
  expect(Boolean(allFiles['api/js-module-scene.js']), 'collectProjectFiles should include utility scene module');
  expect(Boolean(allFiles['api/js-module-pillars.js']), 'collectProjectFiles should include utility pillar module');

  const result = runScript(code, fileName, allFiles);
  expect(!result.error, `runScript failed: ${result.error}`);
  expect(result.objects.length === 1, `expected 1 object, got ${result.objects.length}`);
  expect(result.shape != null, 'expected a single returned shape');

  const bbox = result.shape!.boundingBox();
  expectVec(bbox.min as number[], [-20, -9, -2], 'bbox.min');
  expectVec(bbox.max as number[], [20, 9, 20], 'bbox.max');

  const returnArrayModuleFiles: Record<string, string> = {
    'main.forge.js': `
import sceneItems from "./scene-items.js";

if (!Array.isArray(sceneItems)) {
  throw new Error("Expected scene-items default import to be an array");
}
if (sceneItems.length !== 2) {
  throw new Error(\`Expected 2 scene items, got \${sceneItems.length}\`);
}

return sceneItems.map((entry, index) => ({
  name: index === 0 ? "Imported Plate" : "Imported Pin",
  shape: entry.shape.translate(index === 0 ? -14 : 14, 0, 0),
}));
`,
    'scene-items.js': `
import { box, cylinder } from "forgecad";

return [
  { name: "Plate", shape: box(10, 6, 2, true) },
  { name: "Pin", shape: cylinder(8, 2, undefined, undefined, true).translate(0, 0, 5) },
];
`,
  };
  const returnArrayResult = runScript(
    returnArrayModuleFiles['main.forge.js'],
    'main.forge.js',
    returnArrayModuleFiles,
  );
  expect(!returnArrayResult.error, `array-return module import failed: ${returnArrayResult.error}`);
  expect(returnArrayResult.objects.length === 2, `expected 2 imported objects, got ${returnArrayResult.objects.length}`);

  const mixedModuleFiles: Record<string, string> = {
    'main.forge.js': `
import value from "./mixed-module.js";
return box(4, 4, 4, true).translate(value, 0, 0);
`,
    'mixed-module.js': `
export const answer = 42;
return answer;
`,
  };
  const mixedModuleResult = runScript(
    mixedModuleFiles['main.forge.js'],
    'main.forge.js',
    mixedModuleFiles,
  );
  expect(
    Boolean(mixedModuleResult.error) && mixedModuleResult.error!.includes('mixed top-level return with exports'),
    `expected mixed return/export failure, got: ${mixedModuleResult.error ?? 'success'}`,
  );

  console.log('✓ JS module import invariants passed');
}

#!/usr/bin/env node
/**
 * JS module import invariants.
 *
 * Ensures ForgeCAD entry files can use ESM imports, utility .js modules
 * can use exports/default exports, `require(...)` shares the same cache,
 * and virtual `forgecad` imports resolve inside utility modules.
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

async function main() {
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

  console.log('✓ JS module import invariants passed');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Debug helper: inspect dimension annotations for a script.
 *
 * Usage:
 *   npx tsx cli/debug-dimensions.ts <script.forge.js> [--all]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';
import type { SceneObject } from '../src/forge/runner';

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: npx tsx cli/debug-dimensions.ts <script.forge.js> [--all]');
  process.exit(1);
}

const showAll = process.argv.includes('--all');

type Vec3 = [number, number, number];

function inBounds(p: Vec3, min: number[], max: number[], pad = 1e-4): boolean {
  return p[0] >= min[0] - pad && p[0] <= max[0] + pad
    && p[1] >= min[1] - pad && p[1] <= max[1] + pad
    && p[2] >= min[2] - pad && p[2] <= max[2] + pad;
}

async function main() {
  const abs = resolve(scriptPath);
  const code = readFileSync(abs, 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(abs);

  await init();
  const result = runScript(code, fileName, allFiles);
  if (result.error) {
    console.error('ERROR:', result.error);
    process.exit(1);
  }

  const objects = result.objects.filter((o): o is SceneObject & { shape: NonNullable<SceneObject['shape']> } => !!o.shape);
  const dims = result.dimensions;

  console.log(`Objects: ${objects.length}`);
  console.log(`Dimensions: ${dims.length}`);

  if (objects.length > 0) {
    console.log('\nPer-object approximate ownership (both endpoints inside bbox):');
    for (const obj of objects) {
      const bb = obj.shape.boundingBox();
      const count = dims.filter((d) => inBounds(d.from, bb.min as number[], bb.max as number[]) && inBounds(d.to, bb.min as number[], bb.max as number[])).length;
      console.log(`  ${obj.name}: ${count}`);
    }
  }

  const list = showAll ? dims : dims.slice(0, 20);
  if (list.length > 0) {
    console.log(`\nDimension list${showAll ? '' : ' (first 20)'}:`);
    for (const d of list) {
      const label = d.label || d.id;
      console.log(`  ${label}: [${d.from.join(', ')}] -> [${d.to.join(', ')}], offset=${d.offset}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

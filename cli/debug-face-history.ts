#!/usr/bin/env node
/**
 * Debug helper: inspect face transformation histories for a script.
 *
 * Usage:
 *   npx tsx cli/debug-face-history.ts <script.forge.js> [face-name]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';
import type { SceneObject } from '../src/forge/runner';
import type { Shape } from '../src/forge/kernel';

export async function runDebugFaceHistoryCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (argv.length < 1) {
    console.error('Usage: forgecad debug faces <script.forge.js> [face-name]');
    process.exit(1);
  }

  const scriptPath = resolve(argv[0]);
  const targetFaceName = argv[1];
  const code = readFileSync(scriptPath, 'utf-8');
  const allFiles = collectProjectFiles(scriptPath);

  await init();
  const result = runScript(code, scriptPath, allFiles);

  if (result.error) {
    console.error('Script error:', result.error);
    process.exit(1);
  }

  const shapeObjects = result.objects.filter((obj): obj is SceneObject & { shape: Shape } => !!obj.shape);

  if (shapeObjects.length === 0) {
    console.log('No shape objects found in script output.');
    return;
  }

  console.log(`\n=== Face Transformation History ===`);
  console.log(`Found ${shapeObjects.length} shape object(s)\n`);

  for (const obj of shapeObjects) {
    const shape = obj.shape;
    const faceNames = shape.faceNames();

    if (faceNames.length === 0) {
      console.log(`Object "${obj.name}": No named faces available`);
      continue;
    }

    console.log(`\nObject: "${obj.name}"`);
    console.log(`Available faces: ${faceNames.join(', ')}`);

    // If a specific face was requested, only show that one
    const facesToShow = targetFaceName ? faceNames.filter(n => n === targetFaceName) : faceNames;

    if (targetFaceName && facesToShow.length === 0) {
      console.log(`  Face "${targetFaceName}" not found on this object`);
      continue;
    }

    for (const faceName of facesToShow) {
      try {
        const history = shape.faceHistory(faceName);

        console.log(`\n  Face: ${history.faceName}`);
        console.log(`  Origin: ${history.origin.operation}`);
        if (history.origin.owner) {
          console.log(`  Owner ID: ${history.origin.owner.id}`);
        }

        if (history.query) {
          console.log(`  Query: ${history.query.kind}`);
        }

        if (history.transformations.length > 0) {
          console.log(`  Transformations (${history.transformations.length}):`);
          history.transformations.forEach((step, i) => {
            console.log(`    ${i + 1}. ${step.description}`);
          });
        } else {
          console.log(`  No transformations applied`);
        }
      } catch (err) {
        console.log(`  Error getting history for face "${faceName}": ${err}`);
      }
    }
  }

  console.log('\n');
}


#!/usr/bin/env node

/**
 * ForgeCAD CLI — Render a sketch .forge.js to SVG
 *
 * Usage: npx tsx cli/forge-svg.ts <script.forge.js> [output.svg]
 *
 * Uses the real forge engine — no code duplication.
 */

import { readFile, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';
import { buildConstraintSvgDocument, buildSketchSvgDocument } from './sketch-svg';

function usage(): never {
  console.error('Usage: forgecad export svg <script.forge.js> [output.svg]');
  process.exit(1);
}

function defaultSvgOutput(scriptPath: string): string {
  return scriptPath.replace(/\.(forge|sketch)\.js$/, '.svg').replace(/\.js$/, '.svg');
}

export async function runSvgCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = argv[0];
  if (!scriptPath) usage();
  const outputPath = argv[1] || defaultSvgOutput(scriptPath);
  if (resolve(outputPath) === resolve(scriptPath)) {
    console.error(`ERROR: output path would overwrite the input script. Specify an explicit output path.`);
    process.exit(1);
  }

  // Read script
  const code = await readFile(resolve(scriptPath), 'utf-8');

  // Collect project files with correct relative paths
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  // Initialize the real forge kernel
  await init();

  // Run the script through the real runner
  const result = runScript(code, fileName, allFiles);

  if (result.error) {
    console.error('Script error:', result.error);
    process.exit(1);
  }

  // Find the sketch result
  const sketchObj = result.objects.find((obj) => obj.sketch);
  if (!sketchObj?.sketch) {
    console.error('Script must return a Sketch');
    process.exit(1);
  }

  const sketch = sketchObj.sketch;

  // Use constraint SVG rendering for constraint sketches (wireframe + surfaces + labels)
  const meta = sketchObj.sketchMeta;
  if (meta) {
    const svg = buildConstraintSvgDocument(meta);
    await writeFile(resolve(outputPath), svg);
    const surfaceInfo = meta.surfaces?.length ? `  surfaces=${meta.surfaces.length}` : '';
    console.log(
      `✓ ${basename(outputPath)}  ${meta.status.toUpperCase()} DOF=${meta.dof}${surfaceInfo}  constraints=${meta.constraints.length}`,
    );
    return;
  }

  const svgDocument = buildSketchSvgDocument([{ name: sketchObj.name, sketch }]);

  await writeFile(resolve(outputPath), svgDocument.svg);

  const sz = [svgDocument.width.toFixed(1), svgDocument.height.toFixed(1)];
  console.log(`✓ ${basename(outputPath)}  ${sz[0]} × ${sz[1]} mm  area=${sketch.area().toFixed(1)}mm²  verts=${sketch.numVert()}`);
}

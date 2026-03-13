#!/usr/bin/env node

/**
 * ForgeCAD CLI — Render a .sketch.js to SVG
 *
 * Usage: npx tsx cli/forge-svg.ts <script.sketch.js> [output.svg]
 *
 * Uses the real forge engine — no code duplication.
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, basename } from 'path';
import { init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';
import { buildSketchSvgDocument } from './sketch-svg';

function usage(): never {
  console.error('Usage: forgecad export svg <script.sketch.js> [output.svg]');
  process.exit(1);
}

export async function runSvgCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = argv[0];
  if (!scriptPath) usage();
  const outputPath = argv[1] || scriptPath.replace(/\.sketch\.js$/, '.svg');

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

  const svgDocument = buildSketchSvgDocument([{ name: sketchObj.name, sketch }]);

  await writeFile(resolve(outputPath), svgDocument.svg);

  const sz = [svgDocument.width.toFixed(1), svgDocument.height.toFixed(1)];
  console.log(
    `✓ ${basename(outputPath)}  ${sz[0]} × ${sz[1]} mm  area=${sketch.area().toFixed(1)}mm²  verts=${sketch.numVert()}`,
  );
}

#!/usr/bin/env node

/**
 * ForgeCAD CLI — Export a sketch .forge.js to a single-page PDF with full constraint visualization.
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, basename } from 'path';
import { init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';
import { generateSketchPdf } from '../src/forge/sketch/exportSketchPdf';

function usage(): never {
  console.error('Usage: forgecad export sketch-pdf <script.forge.js> [output.pdf]');
  process.exit(1);
}

function defaultPdfOutput(scriptPath: string): string {
  return scriptPath.replace(/\.(forge|sketch)\.js$/, '.sketch.pdf').replace(/\.js$/, '.sketch.pdf');
}

export async function runSketchPdfCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = argv[0];
  if (!scriptPath) usage();
  const outputPath = argv[1] || defaultPdfOutput(scriptPath);
  if (resolve(outputPath) === resolve(scriptPath)) {
    console.error(`ERROR: output path would overwrite the input script. Specify an explicit output path.`);
    process.exit(1);
  }

  const code = await readFile(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();
  const result = runScript(code, fileName, allFiles);

  if (result.error) {
    console.error('Script error:', result.error);
    process.exit(1);
  }

  const sketchObj = result.objects.find((obj) => obj.sketch);
  if (!sketchObj?.sketch) {
    console.error('Script must return a Sketch');
    process.exit(1);
  }

  const meta = sketchObj.sketchMeta;
  if (!meta) {
    console.error('Script must return a constrained sketch (with sketchMeta). Use constrainedSketch() API.');
    process.exit(1);
  }

  const { pdf, pageWidth, pageHeight } = generateSketchPdf(meta);

  await writeFile(resolve(outputPath), pdf);

  const surfaceInfo = meta.surfaces?.length ? `  surfaces=${meta.surfaces.length}` : '';
  console.log(
    `\u2713 ${basename(outputPath)}  ${pageWidth.toFixed(3)}x${pageHeight.toFixed(3)}pt  ${meta.status.toUpperCase()} DOF=${meta.dof}${surfaceInfo}  constraints=${meta.constraints.length}`,
  );
}

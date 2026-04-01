#!/usr/bin/env node

/**
 * ForgeCAD CLI — Export a multi-view 2D drawing report PDF.
 *
 * Usage:
 *   npx tsx cli/forge-report.ts <script.forge.js> [output.pdf] [--dim-angle-tol <deg>]
 */

import { readFile, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { generateReportPdf, init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';

function argValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function usage(): never {
  console.error('Usage: forgecad export report <script.forge.js> [output.pdf] [--dim-angle-tol <deg>]');
  process.exit(1);
}

export async function runReportCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = argv[0];
  if (!scriptPath) usage();

  const defaultOut = scriptPath.replace(/\.(forge\.)?js$/, '.report.pdf');
  const outputPath = argv[1] && !argv[1].startsWith('--') ? argv[1] : defaultOut;
  const toleranceArg = argValue(argv, '--dim-angle-tol');
  const dimAngleToleranceDeg = toleranceArg != null ? Number(toleranceArg) : undefined;

  const source = await readFile(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();
  const result = runScript(source, fileName, allFiles);

  if (result.error) {
    console.error(`Script error: ${result.error}`);
    process.exit(1);
  }

  const title = basename(scriptPath).replace(/\.(forge\.)?js$/, '');
  const report = generateReportPdf(result, {
    title,
    includeDisassembled: true,
    dimensionDirectionToleranceDeg: dimAngleToleranceDeg,
  });

  await writeFile(resolve(outputPath), report.pdf);

  console.log(`✓ ${basename(outputPath)}`);
  console.log(`  Pages: ${report.pageCount}`);
  console.log(`  Components: ${report.componentCount}`);
  console.log(`  Views per page: ${report.viewCount}`);
  if (report.bomItemCount > 0) {
    console.log(`  BOM line items: ${report.bomItemCount}`);
  }
  if (dimAngleToleranceDeg != null && Number.isFinite(dimAngleToleranceDeg)) {
    console.log(`  Dimension angle tolerance: ${dimAngleToleranceDeg}°`);
  }
}

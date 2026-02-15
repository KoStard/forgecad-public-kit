#!/usr/bin/env node

/**
 * ForgeCAD CLI — Export a multi-view 2D drawing report PDF.
 *
 * Usage:
 *   npx tsx cli/forge-report.ts <script.forge.js> [output.pdf]
 */

import { readFile, writeFile } from 'fs/promises';
import { resolve, basename } from 'path';
import { init, runScript, generateReportPdf } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error('Usage: npx tsx cli/forge-report.ts <script.forge.js> [output.pdf]');
  process.exit(1);
}

const defaultOut = scriptPath.replace(/\.(forge\.)?js$/, '.report.pdf');
const outputPath = process.argv[3] || defaultOut;

async function main() {
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
  });

  await writeFile(resolve(outputPath), report.pdf);

  console.log(`✓ ${basename(outputPath)}`);
  console.log(`  Pages: ${report.pageCount}`);
  console.log(`  Components: ${report.componentCount}`);
  console.log(`  Views per page: ${report.viewCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

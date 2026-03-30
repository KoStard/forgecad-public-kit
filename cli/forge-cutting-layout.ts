#!/usr/bin/env node

/**
 * ForgeCAD CLI — Compute cutting layout and export PDF + print cut sequence.
 *
 * Usage:
 *   forgecad export cutting-layout <script.forge.js> [output.pdf]
 *     [--sheet-width <mm>] [--sheet-height <mm>] [--kerf <mm>]
 */

import { readFile, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import { formatCutSequence, generateCuttingLayoutPdf, getCollectedSheetStock, init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';

function argValue(argv: string[], name: string): string | undefined {
  const idx = argv.indexOf(name);
  if (idx === -1) return undefined;
  return argv[idx + 1];
}

function usage(): never {
  console.error(
    'Usage: forgecad export cutting-layout <script.forge.js> [output.pdf]\n' +
      '         [--sheet-width <mm>] [--sheet-height <mm>] [--kerf <mm>]',
  );
  process.exit(1);
}

/** Pick the smallest standard plywood sheet that fits the largest piece. */
function smartDefaults(entries: { width: number; height: number }[]): { w: number; h: number } {
  if (entries.length === 0) return { w: 2440, h: 1220 };
  let maxLong = 0;
  let maxShort = 0;
  for (const e of entries) {
    const long = Math.max(e.width, e.height);
    const short = Math.min(e.width, e.height);
    if (long > maxLong) maxLong = long;
    if (short > maxShort) maxShort = short;
  }
  const standards: [number, number][] = [
    [1220, 610],
    [1525, 1525],
    [1830, 1220],
    [2440, 1220],
    [2440, 1830],
    [3050, 1525],
  ];
  for (const [w, h] of standards) {
    if (w >= maxLong && h >= maxShort) return { w, h };
  }
  return {
    w: Math.max(2440, Math.ceil(maxLong / 100) * 100),
    h: Math.max(1220, Math.ceil(maxShort / 100) * 100),
  };
}

export async function runCuttingLayoutCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = argv[0];
  if (!scriptPath) usage();

  const defaultOut = scriptPath.replace(/\.(forge\.)?js$/, '.cutting-layout.pdf');
  const outputPath = argv[1] && !argv[1].startsWith('--') ? argv[1] : defaultOut;

  const sheetWidthArg = argValue(argv, '--sheet-width');
  const sheetHeightArg = argValue(argv, '--sheet-height');
  const kerfArg = argValue(argv, '--kerf');
  const kerf = kerfArg != null ? Number(kerfArg) : 3;

  const source = await readFile(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();
  const result = runScript(source, fileName, allFiles);

  if (result.error) {
    console.error(`Script error: ${result.error}`);
    process.exit(1);
  }

  const entries = result.sheetStock;
  if (!entries || entries.length === 0) {
    console.error('No sheetStock() declarations found in the script.');
    process.exit(1);
  }

  // Determine sheet size: explicit args > smart defaults
  const defaults = smartDefaults(entries);
  const sheetWidth = sheetWidthArg != null ? Number(sheetWidthArg) : defaults.w;
  const sheetHeight = sheetHeightArg != null ? Number(sheetHeightArg) : defaults.h;

  const pdfResult = generateCuttingLayoutPdf(entries, sheetWidth, sheetHeight, kerf);
  await writeFile(resolve(outputPath), pdfResult.pdf);

  const layout = pdfResult.layout;

  // CLI summary
  console.log(`\n  ${basename(outputPath)}`);
  console.log(`  ${layout.totalPieces} pieces on ${layout.totalSheets} sheet${layout.totalSheets > 1 ? 's' : ''}`);
  console.log(`  Stock: ${sheetWidth} x ${sheetHeight} mm | Kerf: ${kerf} mm`);
  console.log(`  Waste: ${layout.wastePercent.toFixed(1)}%`);

  // Cut sequence
  console.log('\n  CUT SEQUENCE');
  console.log(formatCutSequence(layout));
  console.log('');
}

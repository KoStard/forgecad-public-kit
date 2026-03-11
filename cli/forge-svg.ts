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

  // Generate SVG
  const polys = sketch.toPolygons();
  const b = sketch.bounds();
  const margin = 2;
  const minX = b.min[0] - margin;
  const minY = b.min[1] - margin;
  const w = b.max[0] - b.min[0] + margin * 2;
  const h = b.max[1] - b.min[1] + margin * 2;

  let paths = '';
  for (const poly of polys) {
    const d =
      poly
        .map(
          (p: number[], i: number) =>
            `${i === 0 ? 'M' : 'L'}${p[0].toFixed(3)},${(-p[1]).toFixed(3)}`,
        )
        .join(' ') + ' Z';
    paths += `  <path d="${d}" fill="#4488cc" stroke="#224466" stroke-width="0.3"/>\n`;
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX.toFixed(1)} ${(-b.max[1] - margin).toFixed(1)} ${w.toFixed(1)} ${h.toFixed(1)}" width="${Math.max(w * 4, 400)}" height="${Math.max(h * 4, 400)}">
  <rect x="${minX.toFixed(1)}" y="${(-b.max[1] - margin).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#2a2a2a"/>
${paths}</svg>`;

  await writeFile(resolve(outputPath), svg);

  const sz = [
    (b.max[0] - b.min[0]).toFixed(1),
    (b.max[1] - b.min[1]).toFixed(1),
  ];
  console.log(
    `✓ ${basename(outputPath)}  ${sz[0]} × ${sz[1]} mm  area=${sketch.area().toFixed(1)}mm²  verts=${sketch.numVert()}`,
  );
}

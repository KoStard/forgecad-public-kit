#!/usr/bin/env node
import { writeFileSync } from 'fs';
import { resolve, extname } from 'path';
import { runScript } from '../src/forge/headless';
import { initKernel } from '../src/forge/kernel';
import { collectProjectFiles } from './collect-files';

interface ParsedArgs {
  scriptPath: string;
  outputPath?: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  let scriptPath: string | undefined;
  let outputPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') {
      outputPath = argv[i + 1];
      if (!outputPath) throw new Error('--output requires a file path');
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    if (scriptPath) throw new Error('Only one .forge.js path can be provided');
    scriptPath = arg;
  }

  if (!scriptPath) {
    throw new Error('Usage: forgecad export gcode <script.forge.js> [--output path]');
  }

  return { scriptPath, outputPath };
}

function defaultOutputPath(scriptPath: string): string {
  const abs = resolve(scriptPath);
  const base = abs.slice(0, abs.length - extname(abs).length);
  const stem = base.endsWith('.forge') ? base.slice(0, -6) : base;
  return `${stem}.gcode`;
}

export async function runGcodeExportCli(argv: string[]): Promise<void> {
  const { scriptPath, outputPath } = parseArgs(argv);
  const code = (await import('fs')).readFileSync(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName, readBinaryFile } = collectProjectFiles(scriptPath);

  await initKernel();

  const result = runScript(code, fileName, allFiles, { readBinaryFile, allowEmptyResult: true });
  if (result.error) {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }

  // Find the first object with toolpath data
  const toolpathObj = result.objects.find((obj) => obj.toolpath);
  if (!toolpathObj || !toolpathObj.toolpath) {
    console.error('No G-code toolpath found in the script output.');
    console.error('The script must return a GCodeBuilder instance. Example:');
    console.error('  const g = gcode({ nozzle: 0.4 });');
    console.error('  g.preheat(); g.extrudeTo(10, 10, 0.2); g.cooldown();');
    console.error('  export default g;');
    process.exit(2);
  }

  const target = resolve(outputPath ?? defaultOutputPath(scriptPath));
  writeFileSync(target, toolpathObj.toolpath.gcode, 'utf-8');

  const tp = toolpathObj.toolpath;
  const extrudeSegs = tp.segments.filter((s) => s.extrude).length;
  const travelSegs = tp.segments.length - extrudeSegs;
  const minutes = Math.floor(tp.estimatedTimeSeconds / 60);
  const seconds = Math.round(tp.estimatedTimeSeconds % 60);

  console.log(`✓ Exported G-code to ${target}`);
  console.log(`  ${tp.segments.length} segments (${extrudeSegs} extrude, ${travelSegs} travel)`);
  console.log(`  Estimated time: ${minutes}m ${seconds}s`);
  console.log(`  Filament: ${tp.totalFilamentMm.toFixed(1)} mm`);
  console.log(`  Bounds: [${tp.bounds.min.map((v) => v.toFixed(1)).join(', ')}] → [${tp.bounds.max.map((v) => v.toFixed(1)).join(', ')}]`);
}

#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, extname, resolve } from 'path';
import { getCollectedRobotExport, init, runScript } from '../src/forge/headless';
import { buildUrdfRobotPackage } from '../src/forge/export/urdfExport';
import { collectProjectFiles } from './collect-files';

function parseArgs(argv: string[]): { scriptPath: string; outputPath?: string } {
  let scriptPath: string | undefined;
  let outputPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output') {
      outputPath = argv[i + 1];
      if (!outputPath) throw new Error('--output requires a directory path');
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
    throw new Error('Usage: npx tsx cli/forge-urdf.ts [--output dir] <script.forge.js>');
  }

  return { scriptPath, outputPath };
}

function defaultOutputPath(scriptPath: string): string {
  const abs = resolve(scriptPath);
  return abs.slice(0, abs.length - extname(abs).length) + '.urdfpkg';
}

export async function runUrdfCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { scriptPath, outputPath } = parseArgs(argv);
  const code = readFileSync(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();
  const result = runScript(code, fileName, allFiles);
  if (result.error) {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }

  const robot = getCollectedRobotExport();
  if (!robot) {
    console.error('URDF export requires the script to call robotExport({...}).');
    process.exit(2);
  }

  const packageOut = buildUrdfRobotPackage(robot);
  const targetDir = resolve(outputPath ?? defaultOutputPath(scriptPath));

  packageOut.files.forEach((file) => {
    const absPath = resolve(targetDir, file.path);
    mkdirSync(dirname(absPath), { recursive: true });
    if (file.text !== undefined) {
      writeFileSync(absPath, file.text, 'utf-8');
    } else if (file.bytes) {
      writeFileSync(absPath, Buffer.from(file.bytes));
    }
  });

  console.log(`\u2713 Exported URDF package to ${targetDir}`);
  console.log(`  urdf: ${packageOut.manifest.urdfPath}`);
  if (packageOut.manifest.warnings.length > 0) {
    console.log('  warnings:');
    packageOut.manifest.warnings.forEach((warning) => console.log(`    - ${warning}`));
  }
}

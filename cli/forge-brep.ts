#!/usr/bin/env node
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'fs';
import { basename, extname, join, resolve } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { init, runScript } from '../src/forge/headless';
import { buildBrepExportManifest } from '../src/forge/brepExport';
import { collectProjectFiles } from './collect-files';

type BrepFormat = 'step' | 'brep';

function parseArgs(argv: string[]) {
  let format: BrepFormat = 'step';
  let outputPath: string | undefined;
  let pythonPath: string | undefined;
  let scriptPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--format') {
      const value = argv[i + 1];
      if (value !== 'step' && value !== 'brep') {
        throw new Error(`--format must be "step" or "brep" (got ${value ?? 'missing'})`);
      }
      format = value;
      i += 1;
      continue;
    }
    if (arg === '--output') {
      outputPath = argv[i + 1];
      if (!outputPath) throw new Error('--output requires a path');
      i += 1;
      continue;
    }
    if (arg === '--python') {
      pythonPath = argv[i + 1];
      if (!pythonPath) throw new Error('--python requires a path');
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
    throw new Error('Usage: npx tsx cli/forge-brep.ts [--format step|brep] [--output path] [--python path] <script.forge.js>');
  }

  return { format, outputPath, pythonPath, scriptPath };
}

function defaultOutputPath(scriptPath: string, format: BrepFormat): string {
  const abs = resolve(scriptPath);
  return abs.slice(0, abs.length - extname(abs).length) + `.${format}`;
}

function resolvePythonExecutable(requested?: string): string {
  if (requested) return requested;
  if (process.env.FORGECAD_BREP_PYTHON) return process.env.FORGECAD_BREP_PYTHON;

  const localVenv = resolve('.venv-brep/bin/python');
  if (existsSync(localVenv)) return localVenv;
  return 'python3';
}

async function main() {
  const { format, outputPath, pythonPath, scriptPath } = parseArgs(process.argv.slice(2));
  const code = readFileSync(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();
  const result = runScript(code, fileName, allFiles);

  if (result.error) {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }

  const manifest = buildBrepExportManifest(result.objects);
  if (manifest.objects.length === 0 || manifest.unsupported.length > 0) {
    console.error('BREP export cannot proceed for this script.');
    if (manifest.objects.length > 0) {
      console.error(`  Exportable objects: ${manifest.objects.map((obj) => obj.name).join(', ')}`);
    }
    for (const item of manifest.unsupported) {
      const geom = item.geometryInfo
        ? ` [${item.geometryInfo.backend}/${item.geometryInfo.representation}/${item.geometryInfo.fidelity}/${item.geometryInfo.sources.join('+')}]`
        : '';
      console.error(`  - ${item.name}: ${item.reason}${geom}`);
    }
    process.exit(2);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'forgecad-brep-'));
  const manifestPath = join(tempDir, 'manifest.json');
  const finalOutput = resolve(outputPath ?? defaultOutputPath(scriptPath, format));
  const python = resolvePythonExecutable(pythonPath);
  writeFileSync(manifestPath, JSON.stringify({ format, objects: manifest.objects }, null, 2));

  const exporterScript = resolve('cli/forge-brep-export.py');
  const proc = spawnSync(
    python,
    [exporterScript, '--input', manifestPath, '--output', finalOutput, '--format', format],
    { stdio: 'inherit' },
  );

  rmSync(tempDir, { recursive: true, force: true });

  if (proc.error) {
    console.error(`Failed to launch Python exporter with "${python}": ${proc.error.message}`);
    process.exit(1);
  }
  if ((proc.status ?? 1) !== 0) {
    process.exit(proc.status ?? 1);
  }

  console.log(`✓ Exported ${manifest.objects.length} object(s) to ${finalOutput}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

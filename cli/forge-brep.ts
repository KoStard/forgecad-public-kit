#!/usr/bin/env node
import { spawnSync } from 'child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { extname, join, resolve } from 'path';
import { buildBrepExportManifest } from '../src/forge/export/brepExport';
import { init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';
import { resolvePackagePath } from './package-runtime';

type BrepFormat = 'step' | 'brep';

function parseArgs(argv: string[]) {
  let format: BrepFormat = 'step';
  let outputPath: string | undefined;
  let pythonPath: string | undefined;
  let uvPath: string | undefined;
  let scriptPath: string | undefined;
  let allowFaceted = false;

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
    if (arg === '--uv') {
      uvPath = argv[i + 1];
      if (!uvPath) throw new Error('--uv requires a path');
      i += 1;
      continue;
    }
    if (arg === '--allow-faceted') {
      allowFaceted = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    if (scriptPath) throw new Error('Only one .forge.js path can be provided');
    scriptPath = arg;
  }

  if (!scriptPath) {
    throw new Error(
      'Usage: npx tsx cli/forge-brep.ts [--format step|brep] [--output path] [--python path] [--uv path] [--allow-faceted] <script.forge.js>',
    );
  }

  return { format, outputPath, pythonPath, uvPath, scriptPath, allowFaceted };
}

function defaultOutputPath(scriptPath: string, format: BrepFormat): string {
  const abs = resolve(scriptPath);
  return abs.slice(0, abs.length - extname(abs).length) + `.${format}`;
}

function resolveUvExecutable(requested?: string): string {
  if (requested) return requested;
  if (process.env.FORGECAD_BREP_UV) return process.env.FORGECAD_BREP_UV;

  const localUv = resolve('.venv/bin/uv');
  if (existsSync(localUv)) return localUv;
  return 'uv';
}

export async function runBrepCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { format, outputPath, pythonPath, uvPath, scriptPath, allowFaceted } = parseArgs(argv);
  const code = readFileSync(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();
  const result = runScript(code, fileName, allFiles);

  if (result.error) {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }

  const manifest = buildBrepExportManifest(result.objects, { allowFaceted });
  if (manifest.objects.length === 0 || manifest.unsupported.length > 0) {
    console.error('BREP export cannot proceed for this script.');
    if (manifest.objects.length > 0) {
      console.error(`  Exportable objects: ${manifest.objects.map((obj) => obj.name).join(', ')}`);
    }
    if (manifest.skipped.length > 0) {
      console.error(`  Skipped non-solid objects: ${manifest.skipped.map((obj) => obj.name).join(', ')}`);
    }
    for (const item of manifest.unsupported) {
      const geom = item.geometryInfo
        ? ` [${item.geometryInfo.backend}/${item.geometryInfo.representation}/${item.geometryInfo.fidelity}/${item.geometryInfo.sources.join('+')}]`
        : '';
      console.error(`  - ${item.name}: ${item.reason}${geom}`);
    }
    if (!allowFaceted) {
      const facetable = manifest.unsupported.some((item) => item.geometryInfo?.representation === 'mesh-solid');
      if (facetable) {
        console.error('  Hint: retry with --allow-faceted to export closed mesh solids as faceted STEP/BREP.');
      }
    }
    process.exit(2);
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'forgecad-brep-'));
  const manifestPath = join(tempDir, 'manifest.json');
  const finalOutput = resolve(outputPath ?? defaultOutputPath(scriptPath, format));
  const uv = resolveUvExecutable(uvPath);
  writeFileSync(manifestPath, JSON.stringify({ format, objects: manifest.objects }, null, 2));

  if (manifest.skipped.length > 0) {
    console.error(`Skipping non-solid objects: ${manifest.skipped.map((obj) => obj.name).join(', ')}`);
  }
  if (manifest.fallbacks.length > 0) {
    console.error(`Using faceted fallback for: ${manifest.fallbacks.map((obj) => obj.name).join(', ')}`);
  }

  const exporterScript = resolvePackagePath(import.meta.url, 'cli', 'forge-brep-export.py');
  const uvArgs = ['run'];
  if (pythonPath) {
    uvArgs.push('--python', pythonPath);
  }
  uvArgs.push(exporterScript, '--input', manifestPath, '--output', finalOutput, '--format', format);
  const proc = spawnSync(uv, uvArgs, { stdio: 'inherit' });

  rmSync(tempDir, { recursive: true, force: true });

  if (proc.error) {
    console.error(`Failed to launch uv exporter with "${uv}": ${proc.error.message}`);
    process.exit(1);
  }
  if ((proc.status ?? 1) !== 0) {
    process.exit(proc.status ?? 1);
  }

  console.log(`✓ Exported ${manifest.objects.length} object(s) to ${finalOutput}`);
}

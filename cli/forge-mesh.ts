#!/usr/bin/env node
import { writeFileSync } from 'fs';
import { resolve, extname } from 'path';
import {
  runScript,
  build3mfBuffer,
  buildBinaryStl,
  validateMeshExportObjects,
  type MeshExportObject,
} from '../src/forge/headless';
import { initKernel, setActiveBackend, type ActiveBackend } from '../src/forge/kernel';
import { collectProjectFiles } from './collect-files';

type MeshFormat = '3mf' | 'stl';

interface ParsedArgs {
  scriptPath: string;
  outputPath?: string;
  quality?: 'default' | 'live' | 'high';
  backend?: ActiveBackend;
  validate?: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  let scriptPath: string | undefined;
  let outputPath: string | undefined;
  let quality: 'default' | 'live' | 'high' | undefined;
  let backend: ActiveBackend | undefined;
  let validate = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' || arg === '-o') {
      outputPath = argv[i + 1];
      if (!outputPath) throw new Error('--output requires a file path');
      i += 1;
      continue;
    }
    if (arg === '--quality' || arg === '-q') {
      const val = argv[i + 1];
      if (val !== 'default' && val !== 'live' && val !== 'high') {
        throw new Error('--quality must be default, live, or high');
      }
      quality = val;
      i += 1;
      continue;
    }
    if (arg === '--backend') {
      const val = argv[i + 1];
      if (val !== 'manifold' && val !== 'occt') {
        throw new Error('--backend must be manifold or occt');
      }
      backend = val;
      i += 1;
      continue;
    }
    if (arg === '--validate') {
      validate = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
    if (scriptPath) throw new Error('Only one .forge.js path can be provided');
    scriptPath = arg;
  }

  if (!scriptPath) {
    throw new Error('Usage: forgecad export <3mf|stl> <script.forge.js> [--output path] [--quality default|live|high] [--backend manifold|occt]');
  }

  return { scriptPath, outputPath, quality, backend, validate };
}

function defaultOutputPath(scriptPath: string, format: MeshFormat): string {
  const abs = resolve(scriptPath);
  const base = abs.slice(0, abs.length - extname(abs).length);
  // Strip .forge suffix if present (e.g., foo.forge.js → foo.3mf)
  const stem = base.endsWith('.forge') ? base.slice(0, -6) : base;
  return `${stem}.${format}`;
}

function extractMeshObjects(result: ReturnType<typeof runScript>): MeshExportObject[] {
  return result.objects
    .filter((obj) => obj.shape)
    .map((obj) => ({
      name: obj.name,
      shape: obj.shape!,
      color: obj.color,
    }));
}

function printMeshValidationReports(reports: ReturnType<typeof validateMeshExportObjects>): void {
  console.log('  Mesh validation:');
  reports.forEach((report) => {
    console.log(
      `    ${report.name}: ${report.vertices.toLocaleString()} vertices, ` +
      `${report.triangles.toLocaleString()} triangles, ` +
      `${report.connectedComponents.toLocaleString()} component(s), ` +
      `${report.nonManifoldEdges.toLocaleString()} non-manifold edge(s)`,
    );
    report.issues.forEach((issue) => {
      const prefix = issue.severity === 'error' ? 'ERROR' : 'WARN';
      console.log(`      ${prefix} ${issue.code}: ${issue.message}`);
    });
  });
}

export async function runMeshExportCli(
  format: MeshFormat,
  argv: string[],
): Promise<void> {
  const { scriptPath, outputPath, quality, backend, validate } = parseArgs(argv);
  const code = (await import('fs')).readFileSync(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName, readBinaryFile } = collectProjectFiles(scriptPath);

  await initKernel();
  if (backend) setActiveBackend(backend);

  const qualityPreset = quality && quality !== 'default' ? quality : undefined;
  const result = runScript(code, fileName, allFiles, { ...(qualityPreset ? { quality: qualityPreset } : {}), readBinaryFile });
  if (result.error) {
    console.error(`ERROR: ${result.error}`);
    process.exit(1);
  }

  const meshObjects = extractMeshObjects(result);
  if (meshObjects.length === 0) {
    console.error('No 3D shapes found in the script output.');
    process.exit(2);
  }

  const validationReports = validate ? validateMeshExportObjects(meshObjects) : [];
  const validationFailures = validationReports.flatMap((report) =>
    report.issues
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${report.name}: ${issue.message}`),
  );
  if (validationFailures.length > 0) {
    printMeshValidationReports(validationReports);
    console.error(`Mesh validation failed:\n${validationFailures.map((failure) => `  - ${failure}`).join('\n')}`);
    process.exit(3);
  }

  const target = resolve(outputPath ?? defaultOutputPath(scriptPath, format));
  const stem = target.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');

  if (format === '3mf') {
    const buffer = await build3mfBuffer(meshObjects, {
      title: stem,
      application: 'ForgeCAD',
      description: `ForgeCAD ${format.toUpperCase()} export`,
    });
    writeFileSync(target, Buffer.from(buffer));
  } else {
    const buffer = buildBinaryStl(meshObjects);
    writeFileSync(target, Buffer.from(buffer));
  }

  const stats = meshObjects.map((obj) => {
    const mesh = obj.shape.getMesh();
    return `  ${obj.name}: ${mesh.numTri.toLocaleString()} triangles`;
  });

  console.log(`✓ Exported ${format.toUpperCase()} to ${target}`);
  console.log(`  ${meshObjects.length} object(s)${quality ? ` [quality: ${quality}]` : ''}`);
  stats.forEach((line) => console.log(line));
  if (validate) {
    printMeshValidationReports(validationReports);
  }
}

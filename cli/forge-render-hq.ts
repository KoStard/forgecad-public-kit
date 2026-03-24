#!/usr/bin/env node
/**
 * ForgeCAD render-hq — High-quality rendering via Blender Cycles.
 *
 * Evaluates a .forge.js script, exports OBJ, spawns Blender in background
 * mode with a Python render script, and produces a path-traced PNG.
 */

import { writeFileSync, readFileSync, mkdtempSync, rmSync, existsSync } from 'fs';
import { resolve, dirname, join, extname } from 'path';
import { execFileSync, execSync } from 'child_process';
import { tmpdir } from 'os';
import {
  runScript,
  type MeshExportObject,
  type SceneConfig,
} from '../src/forge/headless';
import { buildObjString } from '../src/forge/export/exportMesh';
import { initKernel, setActiveBackend, type ActiveBackend } from '../src/forge/kernel';
import { collectProjectFiles } from './collect-files';
import { materializeNotebookPreviewScript } from './notebook-entry';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

type RenderPreset = 'studio' | 'outdoor' | 'dramatic' | 'clay' | 'wireframe' | 'glass' | 'metallic' | 'toon' | 'xray' | 'normals' | 'silhouette';

interface ParsedArgs {
  scriptPath: string;
  outputPath?: string;
  width: number;
  height: number;
  samples: number;
  preset: RenderPreset;
  engine: 'CYCLES' | 'BLENDER_EEVEE_NEXT';
  transparent: boolean;
  denoise: boolean;
  quality?: 'default' | 'live' | 'high';
  backend?: ActiveBackend;
  hdriPath?: string;
  video: boolean;
  videoFrames: number;
  videoFps: number;
  videoPitch: number;
}

const PRESETS: RenderPreset[] = ['studio', 'outdoor', 'dramatic', 'clay', 'wireframe', 'glass', 'metallic', 'toon', 'xray', 'normals', 'silhouette'];

function parseArgs(argv: string[]): ParsedArgs {
  let scriptPath: string | undefined;
  let outputPath: string | undefined;
  let width = 1920;
  let height = 1080;
  let samples = 256;
  let preset: RenderPreset = 'studio';
  let engine: 'CYCLES' | 'BLENDER_EEVEE_NEXT' = 'CYCLES';
  let transparent = false;
  let denoise = true;
  let quality: 'default' | 'live' | 'high' | undefined;
  let backend: ActiveBackend | undefined;
  let hdriPath: string | undefined;
  let video = false;
  let videoFrames = 72;
  let videoFps = 24;
  let videoPitch = 25;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === '--width' || arg === '-w') {
      width = parseInt(next, 10);
      if (!Number.isFinite(width) || width < 1) throw new Error('--width must be a positive integer');
      i += 1;
    } else if (arg === '--height' || arg === '-h') {
      height = parseInt(next, 10);
      if (!Number.isFinite(height) || height < 1) throw new Error('--height must be a positive integer');
      i += 1;
    } else if (arg === '--size' || arg === '-s') {
      const s = parseInt(next, 10);
      if (!Number.isFinite(s) || s < 1) throw new Error('--size must be a positive integer');
      width = s;
      height = s;
      i += 1;
    } else if (arg === '--samples') {
      samples = parseInt(next, 10);
      if (!Number.isFinite(samples) || samples < 1) throw new Error('--samples must be a positive integer');
      i += 1;
    } else if (arg === '--preset' || arg === '-p') {
      if (!PRESETS.includes(next as RenderPreset)) {
        throw new Error(`--preset must be one of: ${PRESETS.join(', ')}`);
      }
      preset = next as RenderPreset;
      i += 1;
    } else if (arg === '--engine') {
      if (next !== 'cycles' && next !== 'eevee') {
        throw new Error('--engine must be cycles or eevee');
      }
      engine = next === 'eevee' ? 'BLENDER_EEVEE_NEXT' : 'CYCLES';
      i += 1;
    } else if (arg === '--transparent') {
      transparent = true;
    } else if (arg === '--no-denoise') {
      denoise = false;
    } else if (arg === '--quality' || arg === '-q') {
      if (next !== 'default' && next !== 'live' && next !== 'high') {
        throw new Error('--quality must be default, live, or high');
      }
      quality = next;
      i += 1;
    } else if (arg === '--backend') {
      if (next !== 'manifold' && next !== 'occt') {
        throw new Error('--backend must be manifold or occt');
      }
      backend = next;
      i += 1;
    } else if (arg === '--hdri') {
      hdriPath = resolve(next);
      if (!existsSync(hdriPath)) throw new Error(`HDRI file not found: ${hdriPath}`);
      i += 1;
    } else if (arg === '--video') {
      video = true;
    } else if (arg === '--frames') {
      videoFrames = parseInt(next, 10);
      if (!Number.isFinite(videoFrames) || videoFrames < 2) throw new Error('--frames must be >= 2');
      i += 1;
    } else if (arg === '--fps') {
      videoFps = parseInt(next, 10);
      if (!Number.isFinite(videoFps) || videoFps < 1) throw new Error('--fps must be >= 1');
      i += 1;
    } else if (arg === '--pitch') {
      videoPitch = parseInt(next, 10);
      if (!Number.isFinite(videoPitch)) throw new Error('--pitch must be a number (degrees)');
      i += 1;
    } else if (arg === '--output' || arg === '-o') {
      outputPath = next;
      i += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    } else if (!scriptPath) {
      scriptPath = arg;
    } else if (!outputPath) {
      outputPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!scriptPath) {
    throw new Error(
      'Usage: forgecad render-hq <script.forge.js> [output.png] [options]\n' +
      '  --preset <studio|outdoor|dramatic|clay|wireframe|glass|metallic>\n' +
      '  --size <px>          Square output (sets both width and height)\n' +
      '  --width <px>         Output width (default: 1920)\n' +
      '  --height <px>        Output height (default: 1080)\n' +
      '  --samples <n>        Render samples (default: 256)\n' +
      '  --engine <cycles|eevee>  Render engine (default: cycles)\n' +
      '  --transparent        Transparent background\n' +
      '  --hdri <path.hdr>    Custom HDRI environment map\n' +
      '  --video              Render orbit turntable video (MP4)\n' +
      '  --frames <n>         Video frames (default: 72)\n' +
      '  --fps <n>            Video FPS (default: 24)\n' +
      '  --pitch <deg>        Camera pitch angle (default: 25)\n' +
      '  --quality <default|live|high>  Mesh tessellation quality\n' +
      '  --backend <manifold|occt>  Geometry backend',
    );
  }

  return { scriptPath, outputPath, width, height, samples, preset, engine, transparent, denoise, quality, backend, hdriPath, video, videoFrames, videoFps, videoPitch };
}

// ---------------------------------------------------------------------------
// Blender detection
// ---------------------------------------------------------------------------

function findBlender(): string {
  // Check PATH first
  try {
    const which = execSync('which blender 2>/dev/null', { encoding: 'utf-8' }).trim();
    if (which) return which;
  } catch { /* not in PATH */ }

  // Common macOS locations
  const macPaths = [
    '/Applications/Blender.app/Contents/MacOS/Blender',
    `${process.env.HOME}/Applications/Blender.app/Contents/MacOS/Blender`,
  ];
  for (const p of macPaths) {
    if (existsSync(p)) return p;
  }

  // Linux common paths
  const linuxPaths = ['/usr/bin/blender', '/snap/bin/blender', '/usr/local/bin/blender'];
  for (const p of linuxPaths) {
    if (existsSync(p)) return p;
  }

  throw new Error(
    'Blender not found. Install it:\n' +
    '  macOS:  brew install --cask blender\n' +
    '  Linux:  sudo apt install blender  (or snap install blender)\n' +
    '  All:    https://www.blender.org/download/',
  );
}

// ---------------------------------------------------------------------------
// Default output path
// ---------------------------------------------------------------------------

function defaultOutputPath(scriptPath: string, video: boolean): string {
  const abs = resolve(scriptPath);
  const base = abs.slice(0, abs.length - extname(abs).length);
  const stem = base.endsWith('.forge') ? base.slice(0, -6) : base;
  return `${stem}-hq.${video ? 'mp4' : 'png'}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function runRenderHqCli(argv: string[]): Promise<void> {
  const args = parseArgs(argv);
  const materialized = materializeNotebookPreviewScript(args.scriptPath);

  try {
    const scriptPath = resolve(materialized.runnablePath);
    const code = readFileSync(scriptPath, 'utf-8');
    const { allFiles, fileName, readBinaryFile } = collectProjectFiles(materialized.runnablePath);

    // Initialize geometry kernel
    console.log('Evaluating ForgeCAD script...');
    await initKernel();
    if (args.backend) setActiveBackend(args.backend);

    const qualityPreset = args.quality && args.quality !== 'default' ? args.quality : undefined;
    const result = runScript(code, fileName, allFiles, {
      ...(qualityPreset ? { quality: qualityPreset } : {}),
      readBinaryFile,
    });

    if (result.error) {
      console.error(`Script error: ${result.error}`);
      process.exit(1);
    }

    // Extract mesh objects
    const meshObjects: MeshExportObject[] = result.objects
      .filter((obj) => obj.shape)
      .map((obj) => ({
        name: obj.name,
        shape: obj.shape!,
        color: obj.color,
      }));

    if (meshObjects.length === 0) {
      console.error('No 3D shapes found in the script output.');
      process.exit(2);
    }

    // Export OBJ to temp directory
    const tmpDir = mkdtempSync(join(tmpdir(), 'forgecad-hq-'));
    const objPath = join(tmpDir, 'model.obj');
    const configPath = join(tmpDir, 'config.json');
    const outputPath = resolve(args.outputPath ?? defaultOutputPath(args.scriptPath, args.video));

    console.log(`Exporting ${meshObjects.length} object(s) to OBJ...`);
    const objString = buildObjString(meshObjects);
    writeFileSync(objPath, objString, 'utf-8');

    // Build Blender config
    const sceneConfig: SceneConfig | null = result.sceneConfig;
    const blenderConfig: Record<string, unknown> = {
      obj_path: objPath,
      output_path: outputPath,
      width: args.width,
      height: args.height,
      samples: args.samples,
      engine: args.engine,
      preset: args.preset,
      background: typeof sceneConfig?.background === 'string' ? sceneConfig.background : '#252526',
      transparent: args.transparent,
      denoise: args.denoise,
      objects: meshObjects.map((obj) => ({
        name: obj.name,
        color: obj.color ?? '#5b9bd5',
      })),
    };

    // Map ForgeCAD scene camera to Blender config
    if (sceneConfig?.camera) {
      blenderConfig.camera = {
        position: sceneConfig.camera.position,
        target: sceneConfig.camera.target,
        fov: sceneConfig.camera.fov ?? 45,
      };
    }

    if (args.hdriPath) {
      blenderConfig.hdri_path = args.hdriPath;
    }

    if (args.video) {
      blenderConfig.video = {
        frames: args.videoFrames,
        fps: args.videoFps,
        pitch_deg: args.videoPitch,
        output_path: outputPath,
        frame_dir: join(tmpDir, 'frames'),
      };
    }

    writeFileSync(configPath, JSON.stringify(blenderConfig, null, 2), 'utf-8');

    // Find Blender and render
    const blenderPath = findBlender();
    // Resolve render.py relative to the source tree (not the bundled dist-cli/).
    // import.meta.url points to dist-cli/forgecad.js after bundling, so we go
    // up one level to the project root, then into cli/blender/.
    const cliDir = dirname(new URL(import.meta.url).pathname);
    const projectRoot = dirname(cliDir);
    const renderScript = join(projectRoot, 'cli', 'blender', 'render.py');

    const modeLabel = args.video ? `video (${args.videoFrames} frames @ ${args.videoFps}fps)` : 'still';
    console.log(`Rendering ${modeLabel} with Blender (${args.engine}, ${args.samples} samples, ${args.width}x${args.height})...`);
    console.log(`  Preset: ${args.preset}`);
    console.log(`  Engine: ${blenderPath}`);

    let blenderStdout = '';
    let blenderStderr = '';
    try {
      const result2 = execFileSync(blenderPath, [
        '--background',
        '--python', renderScript,
        '--', configPath,
      ], {
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: args.video ? 3_600_000 : 600_000, // 1 hour for video, 10 min for still
        maxBuffer: 50 * 1024 * 1024,
      });
      blenderStdout = result2?.toString() ?? '';
    } catch (err: any) {
      blenderStdout = err.stdout?.toString() ?? '';
      blenderStderr = err.stderr?.toString() ?? '';

      // Check if render actually succeeded despite exit code
      if (!blenderStdout.includes('Saved to')) {
        // Extract Python tracebacks from stderr
        if (blenderStderr.includes('Traceback') || blenderStderr.includes('Error')) {
          const lines = blenderStderr.split('\n');
          const errorStart = lines.findIndex((l: string) => l.includes('Traceback'));
          if (errorStart >= 0) {
            console.error('Blender error:');
            lines.slice(errorStart).forEach((l: string) => console.error(`  ${l}`));
          } else {
            console.error('Blender failed (last 10 lines):');
            lines.slice(-10).forEach((l: string) => console.error(`  ${l}`));
          }
        }
        process.exit(3);
      }
    }

    // Show key Blender info
    for (const line of blenderStdout.split('\n')) {
      if (line.includes('GPU rendering') || line.includes('CPU rendering')) {
        console.log(`  ${line.trim()}`);
      }
    }

    // Cleanup temp files
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* best effort */ }

    if (existsSync(outputPath)) {
      const stats = (await import('fs')).statSync(outputPath);
      const sizeMb = (stats.size / 1024 / 1024).toFixed(1);
      console.log(`\n✓ Rendered to ${outputPath} (${sizeMb} MB)`);
      console.log(`  ${meshObjects.length} object(s), ${args.width}x${args.height}, ${args.samples} samples`);
    } else {
      console.error(`\nRender failed — output file not created at ${outputPath}`);
      process.exit(3);
    }
  } finally {
    materialized.cleanup();
  }
}

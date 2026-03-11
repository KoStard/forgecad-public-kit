#!/usr/bin/env node

/**
 * ForgeCAD CLI — Render a .forge.js script to PNG(s)
 *
 * Usage:
 *   forgecad render <script.forge.js|notebook.forge-notebook.json> [output.png]
 *
 * Options (via env):
 *   FORGE_ANGLES=front,side,top,iso   Which angles to render (default: all four)
 *   FORGE_SIZE=1024                    Image size in px (default: 1024)
 *   FORGE_PORT=5173                    Dev server port (default: 5173)
 *
 * The CLI auto-starts the Vite dev server if not already running,
 * and stops it when done. No manual setup needed.
 *
 * Requires: puppeteer-core + Chrome/Chromium installed on the system.
 */

import puppeteer from 'puppeteer-core';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { resolve, basename, dirname, join, extname } from 'path';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { execSync } from 'child_process';
import { createServer } from 'net';
import { packageRootFrom, spawnPackageVite } from './package-runtime';
import {
  materializeNotebookPreviewScript,
  replaceRenderableInputExtension,
} from './notebook-entry';

// --- Config ---

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];
const DEFAULT_PORT = parseInt(process.env.FORGE_PORT || '5173', 10);
const DEFAULT_SIZE = parseInt(process.env.FORGE_SIZE || '1024', 10);
const DEFAULT_ANGLES = (process.env.FORGE_ANGLES || 'front,side,top,iso').split(',').map(s => s.trim()).filter(Boolean);

function resolveChromePath(explicitPath) {
  if (explicitPath && existsSync(explicitPath)) return explicitPath;
  return CHROME_PATHS.find(p => existsSync(p)) || null;
}

function usage() {
  return `ForgeCAD Renderer

Usage:
  forgecad render <script.forge.js|notebook.forge-notebook.json> [output.png] [options]

Options:
  --angles <front,side,top,iso>   Which standard angles to render (default: ${DEFAULT_ANGLES.join(',')})
  --size <px>                     Image size in pixels (default: ${DEFAULT_SIZE})
  --port <n>                      Vite dev server port (default: ${DEFAULT_PORT})
  --camera <spec>                 Camera spec, e.g. proj=perspective;pos=120,80,120;target=0,0,0;up=0,0,1
  --scene <json>                  Scene state JSON copied from the viewport; includes camera and object overrides
  --background <color>            Canvas background override
  --chrome-path <path>            Chrome executable path
  -h, --help                      Show this help

Environment variables:
  FORGE_ANGLES=front,side,top,iso
  FORGE_SIZE=1024
  FORGE_PORT=5173
  CHROME_PATH=/path/to/chrome`;
}

function readValue(argv, idx, flag) {
  const next = argv[idx + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return next;
}

function parseCli(argv) {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    console.log(usage());
    process.exit(0);
  }

  let scriptPath;
  let outputBase;
  let angles = DEFAULT_ANGLES;
  let size = DEFAULT_SIZE;
  let port = DEFAULT_PORT;
  let chromePath = process.env.CHROME_PATH;
  let cameraSpec;
  let sceneSpec;
  let background;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--angles') {
      angles = readValue(argv, i, arg).split(',').map(s => s.trim()).filter(Boolean);
      i += 1;
      continue;
    }
    if (arg === '--size') {
      size = parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--port') {
      port = parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--camera') {
      cameraSpec = readValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--scene') {
      sceneSpec = readValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--background') {
      background = readValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--chrome-path') {
      chromePath = readValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!scriptPath) {
      scriptPath = arg;
    } else if (!outputBase) {
      outputBase = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!scriptPath) {
    throw new Error('Missing input .forge.js or .forge-notebook.json path');
  }
  if (!Number.isFinite(size) || size < 128 || size > 4096) {
    throw new Error(`--size must be between 128 and 4096 (got ${size})`);
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be between 1 and 65535 (got ${port})`);
  }
  if (angles.length === 0) {
    throw new Error('At least one render angle is required.');
  }

  return {
    scriptPath,
    outputBase: outputBase || replaceRenderableInputExtension(scriptPath, '.png'),
    angles,
    size,
    port,
    chromePath: resolveChromePath(chromePath),
    cameraSpec,
    sceneSpec,
    background,
  };
}

// Collect all project files recursively with correct relative paths
// (mirrors collect-files.ts logic for plain Node)

const FORGE_EXTS = ['.forge.js', '.sketch.js', '.js', '.svg'];
const isForgeFile = (f) => FORGE_EXTS.some(ext => f.endsWith(ext));

function collectRec(dir, root) {
  const result = {};
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules') {
      Object.assign(result, collectRec(full, root));
    } else if (stat.isFile() && isForgeFile(entry)) {
      const rel = full.slice(root.length + 1); // relative path
      result[rel] = readFileSync(full, 'utf-8');
    }
  }
  return result;
}

function findProjectRoot(sp) {
  const absScript = resolve(sp);
  const scriptDir = dirname(absScript);
  let root = scriptDir;
  let candidate = dirname(scriptDir);
  for (let i = 0; i < 2; i++) {
    if (candidate === root) break;
    try {
      const entries = readdirSync(candidate);
      const hasDirectForge = entries.some(e => {
        try { return statSync(join(candidate, e)).isFile() && isForgeFile(e); }
        catch { return false; }
      });
      if (hasDirectForge) { root = candidate; candidate = dirname(candidate); }
      else break;
    } catch { break; }
  }
  return root;
}

// --- Dev server management ---

async function isPortOpen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));  // port in use = server running
    server.once('listening', () => { server.close(); resolve(true); }); // port free = no server
    server.listen(port, '127.0.0.1');
  });
}

let viteProcess = null;

async function ensureDevServer(port) {
  const portFree = await isPortOpen(port);
  if (!portFree) return; // already running

  console.log('Starting Vite dev server...');
  viteProcess = spawnPackageVite(import.meta.url, ['--port', String(port)], {
    cwd: packageRootFrom(import.meta.url),
    stdio: 'pipe',
    detached: false,
  });

  // Wait for server to be ready
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Vite startup timeout')), 15000);
    viteProcess.stdout.on('data', (data) => {
      if (data.toString().includes('ready')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    viteProcess.on('error', (e) => { clearTimeout(timeout); reject(e); });
  });
}

function stopDevServer() {
  if (viteProcess) {
    viteProcess.kill();
    viteProcess = null;
  }
}

export async function runRenderCli(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseCli(argv);
  } catch (err) {
    console.error(String(err));
    console.error('');
    console.error(usage());
    process.exit(1);
  }

  if (!options.chromePath) {
    console.error('No Chrome found. Set CHROME_PATH env variable or pass --chrome-path.');
    process.exit(1);
  }

  const scriptPath = options.scriptPath;
  const outputBase = options.outputBase;
  const materialized = materializeNotebookPreviewScript(scriptPath);

  try {
    const inputPath = materialized.runnablePath;
    const code = await readFile(resolve(inputPath), 'utf-8');
    const projectRoot = findProjectRoot(inputPath);
    const allFiles = collectRec(projectRoot, projectRoot);
    const scriptFileName = resolve(inputPath).slice(projectRoot.length + 1);

    await ensureDevServer(options.port);

    const browser = await puppeteer.launch({
      headless: true,
      executablePath: options.chromePath,
      args: ['--no-sandbox', '--disable-gpu-sandbox'],
    });

    const page = await browser.newPage();

    try {
      const url = `http://localhost:${options.port}/cli/render.html`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
      await page.waitForFunction('window.__forgeReady === true', { timeout: 10000 });

      const result = await page.evaluate((scriptCode, files, scriptName, renderOptions) => {
        return window.__forgeRender(scriptCode, {
          angles: renderOptions.angles,
          size: renderOptions.size,
          allFiles: files,
          fileName: scriptName,
          cameraSpec: renderOptions.cameraSpec,
          sceneSpec: renderOptions.sceneSpec,
          background: renderOptions.background,
        });
      }, code, allFiles, scriptFileName, {
        angles: options.angles,
        size: options.size,
        cameraSpec: options.cameraSpec || null,
        sceneSpec: options.sceneSpec || null,
        background: options.background || null,
      });

      if (!result.ok) {
        console.error('Script error:', result.error);
        process.exit(1);
      }

      const ext = extname(outputBase) || '.png';
      const base = outputBase.endsWith(ext) ? outputBase.slice(0, -ext.length) : outputBase;
      const renderAngles = Object.keys(result.renders);

      const savedFiles = [];
      for (const [angle, png] of Object.entries(result.renders)) {
        const filename = renderAngles.length === 1
          ? outputBase
          : `${base}_${angle}${ext}`;
        const b64 = png.replace(/^data:image\/png;base64,/, '');
        await writeFile(resolve(filename), Buffer.from(b64, 'base64'));
        savedFiles.push(basename(filename));
      }

      const bb = result.bbox;
      const sz = [
        (bb.max[0] - bb.min[0]).toFixed(1),
        (bb.max[1] - bb.min[1]).toFixed(1),
        (bb.max[2] - bb.min[2]).toFixed(1),
      ];

      console.log(`\n✓ ForgeCAD Render Complete`);
      console.log(`  Script: ${basename(scriptPath)}`);
      console.log(`  Images: ${savedFiles.join(', ')}`);
      console.log(`  Size:   ${sz[0]} × ${sz[1]} × ${sz[2]} mm`);
      console.log(`  Volume: ${result.volume.toFixed(1)} mm³`);
      if (bb.min[0] != null) {
        console.log(`  Bounds: [${bb.min.map(v => v.toFixed(1))}] → [${bb.max.map(v => v.toFixed(1))}]`);
      }

      if (result.params.length > 0) {
        console.log(`  Params:`);
        for (const p of result.params) {
          console.log(`    ${p.name} = ${p.value}${p.unit ? ' ' + p.unit : ''} (${p.min}–${p.max})`);
        }
      }
    } finally {
      await browser.close();
    }
  } finally {
    stopDevServer();
    materialized.cleanup();
  }
}

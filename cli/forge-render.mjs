#!/usr/bin/env node

/**
 * ForgeCAD CLI — Render a .forge.js script to PNG(s)
 *
 * Usage:
 *   node cli/forge-render.mjs <script.forge.js> [output.png]
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
import { existsSync } from 'fs';
import { spawn, execSync } from 'child_process';
import { createServer } from 'net';

// --- Config ---

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
];
const chromePath = process.env.CHROME_PATH || CHROME_PATHS.find(p => existsSync(p));
if (!chromePath) {
  console.error('No Chrome found. Set CHROME_PATH env variable.');
  process.exit(1);
}

const PORT = parseInt(process.env.FORGE_PORT || '5173');
const SIZE = parseInt(process.env.FORGE_SIZE || '1024');
const ANGLES = (process.env.FORGE_ANGLES || 'front,side,top,iso').split(',').map(s => s.trim());

// --- Args ---

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error(`ForgeCAD Renderer

Usage: node cli/forge-render.mjs <script.forge.js> [output.png]

Renders a ForgeCAD script to PNG image(s) with metadata.
Multiple angles are rendered by default (front, side, top, isometric).

Environment variables:
  FORGE_ANGLES=front,side,top,iso   Angles to render (default: all)
  FORGE_SIZE=1024                    Image size in pixels
  FORGE_PORT=5173                    Vite dev server port
  CHROME_PATH=/path/to/chrome        Chrome executable path`);
  process.exit(1);
}

const outputBase = process.argv[3] || scriptPath.replace(/\.(forge\.)?js$/, '.png');
const code = await readFile(resolve(scriptPath), 'utf-8');

// Collect all project files recursively with correct relative paths
// (mirrors collect-files.ts logic for plain Node)
import { readdirSync, readFileSync, statSync } from 'fs';

const FORGE_EXTS = ['.forge.js', '.sketch.js'];
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

const projectRoot = findProjectRoot(scriptPath);
const allFiles = collectRec(projectRoot, projectRoot);
const scriptFileName = resolve(scriptPath).slice(projectRoot.length + 1);

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

async function ensureDevServer() {
  const portFree = await isPortOpen(PORT);
  if (!portFree) return; // already running

  console.log('Starting Vite dev server...');
  const projectRoot = resolve(dirname(new URL(import.meta.url).pathname), '..');
  viteProcess = spawn('npx', ['vite', '--port', String(PORT)], {
    cwd: projectRoot,
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

// --- Main ---

try {
  await ensureDevServer();

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
  });

  const page = await browser.newPage();

  try {
    const url = `http://localhost:${PORT}/cli/render.html`;
    await page.goto(url, { waitUntil: 'networkidle0', timeout: 15000 });
    await page.waitForFunction('window.__forgeReady === true', { timeout: 10000 });

    // Execute script and get renders for all angles
    const result = await page.evaluate((scriptCode, files, scriptName, angles, size) => {
      return window.__forgeRender(scriptCode, { angles, size, allFiles: files, fileName: scriptName });
    }, code, allFiles, scriptFileName, ANGLES, SIZE);

    if (!result.ok) {
      console.error('Script error:', result.error);
      process.exit(1);
    }

    // Save images
    const ext = extname(outputBase);
    const base = outputBase.slice(0, -ext.length);

    const savedFiles = [];
    for (const [angle, png] of Object.entries(result.renders)) {
      const filename = result.renders.length === 1
        ? outputBase
        : `${base}_${angle}${ext}`;
      const b64 = png.replace(/^data:image\/png;base64,/, '');
      await writeFile(resolve(filename), Buffer.from(b64, 'base64'));
      savedFiles.push(basename(filename));
    }

    // Print results
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
}

#!/usr/bin/env node

/**
 * ForgeCAD CLI — Render a 2D sketch .forge.js to PNG
 *
 * Usage: forgecad render sketch <script.forge.js> [output.png] [options]
 *
 * Uses the same SVG generation pipeline as `export svg`, then screenshots
 * it via a headless browser. No Vite dev server required.
 */

import { existsSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { basename, resolve } from 'path';
import puppeteer from 'puppeteer-core';
import { init, runScript } from '../src/forge/headless';
import { collectProjectFiles } from './collect-files';
import { buildConstraintSvgDocument, buildSketchSvgDocument } from './sketch-svg';

const CHROME_PATHS: Record<string, string[]> = {
  darwin: [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ],
  linux: [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/brave-browser',
    '/snap/bin/chromium',
  ],
  win32: [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
  ],
};

function findChromePath(explicitPath?: string): string | null {
  if (explicitPath && existsSync(explicitPath)) return explicitPath;
  const candidates = CHROME_PATHS[process.platform] ?? [];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function defaultPngOutput(scriptPath: string): string {
  return scriptPath.replace(/\.(forge|sketch)\.js$/, '.png').replace(/\.js$/, '.png');
}

function usage(): never {
  console.error('Usage: forgecad render sketch <script.forge.js> [output.png] [--size <px>] [--chrome-path <path>]');
  process.exit(1);
}

interface RenderSketchOptions {
  scriptPath: string;
  outputPath: string;
  size: number;
  chromePath?: string;
  background: string;
}

function parseCli(argv: string[]): RenderSketchOptions {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) usage();

  let scriptPath: string | undefined;
  let outputPath: string | undefined;
  let size = 1024;
  let chromePath: string | undefined = process.env.CHROME_PATH;
  let background = '#2a2a2a';

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--size') {
      size = parseInt(argv[++i], 10);
      continue;
    }
    if (arg === '--chrome-path') {
      chromePath = argv[++i];
      continue;
    }
    if (arg === '--background') {
      background = argv[++i];
      continue;
    }
    if (arg.startsWith('--')) throw new Error(`Unknown option: ${arg}`);
    if (!scriptPath) scriptPath = arg;
    else if (!outputPath) outputPath = arg;
    else throw new Error(`Unexpected argument: ${arg}`);
  }

  if (!scriptPath) usage();
  if (!Number.isFinite(size) || size < 128 || size > 4096)
    throw new Error(`--size must be between 128 and 4096 (got ${size})`);

  return {
    scriptPath: scriptPath!,
    outputPath: outputPath ?? defaultPngOutput(scriptPath!),
    size,
    chromePath,
    background,
  };
}

function svgToHtml(svg: string, background: string): string {
  // Strip fixed width/height attributes so the SVG scales to fill the viewport.
  // The viewBox is preserved so aspect ratio is maintained via CSS.
  const scaledSvg = svg.replace(/<svg([^>]*)\s(width|height)="[^"]*"/g, (_m, before) => `<svg${before}`);
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; background: ${background}; overflow: hidden; }
  body { display: flex; align-items: center; justify-content: center; }
  svg { width: 100%; height: 100%; object-fit: contain; }
</style>
</head>
<body>${scaledSvg}</body>
</html>`;
}

export async function runRender2dCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  let options: RenderSketchOptions;
  try {
    options = parseCli(argv);
  } catch (err) {
    console.error(String(err));
    usage();
  }

  const chromePath = findChromePath(options!.chromePath);
  if (!chromePath) {
    console.error('No Chrome found. Set CHROME_PATH env variable or pass --chrome-path.');
    process.exit(1);
  }

  const { scriptPath, outputPath, size, background } = options!;

  const code = await readFile(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();

  const result = runScript(code, fileName, allFiles);
  if (result.error) {
    console.error('Script error:', result.error);
    process.exit(1);
  }

  const sketchObj = result.objects.find((obj) => obj.sketch);
  if (!sketchObj?.sketch) {
    console.error('Script must return a Sketch');
    process.exit(1);
  }

  const meta = sketchObj.sketchMeta;
  const svg = meta
    ? buildConstraintSvgDocument(meta)
    : buildSketchSvgDocument([{ name: sketchObj.name, sketch: sketchObj.sketch }]).svg;

  const html = svgToHtml(svg, background);

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: chromePath,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: size, height: size });
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const png = await page.screenshot({ type: 'png', fullPage: false });
    await writeFile(resolve(outputPath), png);
  } finally {
    await browser.close();
  }

  const info = meta
    ? `${meta.status.toUpperCase()} DOF=${meta.dof} constraints=${meta.constraints.length}`
    : `area=${sketchObj.sketch.area().toFixed(1)}mm²`;

  console.log(`✓ ${basename(outputPath)}  ${size}×${size}px  ${info}`);
}

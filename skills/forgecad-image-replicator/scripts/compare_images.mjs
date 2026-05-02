#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import puppeteer from 'puppeteer-core';

const CHROME_PATHS = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/snap/bin/chromium',
];

const MIME_BY_EXT = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.bmp', 'image/bmp'],
  ['.svg', 'image/svg+xml'],
]);

function usage() {
  return `Usage:
  compare_images.mjs <reference-image> <forgecad-render> <output.png> [options]

Options:
  --height <px>             Panel height in pixels (default: 900)
  --panel-width <px>        Panel width in pixels (default: max input aspect at --height)
  --gap <px>                Gap between panels (default: 16)
  --padding <px>            Outer padding (default: 16)
  --background <color>      Canvas background (default: #111111)
  --fit <contain|cover>     Fit mode inside equal panels (default: contain)
  --labels <left,right>     Labels (default: Reference,ForgeCAD)
  --no-labels               Disable label band
  --chrome-path <path>      Chrome or Chromium executable
  -h, --help                Show help`;
}

function readValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parsePositiveInt(raw, label) {
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive integer.`);
  }
  return value;
}

function parseArgs(argv) {
  if (argv.includes('-h') || argv.includes('--help')) {
    console.log(usage());
    process.exit(0);
  }

  const positionals = [];
  const options = {
    height: 900,
    panelWidth: null,
    gap: 16,
    padding: 16,
    background: '#111111',
    fit: 'contain',
    labels: ['Reference', 'ForgeCAD'],
    chromePath: process.env.CHROME_PATH || null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--height') {
      options.height = parsePositiveInt(readValue(argv, i, arg), '--height');
      i += 1;
    } else if (arg === '--panel-width') {
      options.panelWidth = parsePositiveInt(readValue(argv, i, arg), '--panel-width');
      i += 1;
    } else if (arg === '--gap') {
      options.gap = parsePositiveInt(readValue(argv, i, arg), '--gap');
      i += 1;
    } else if (arg === '--padding') {
      options.padding = parsePositiveInt(readValue(argv, i, arg), '--padding');
      i += 1;
    } else if (arg === '--background') {
      options.background = readValue(argv, i, arg);
      i += 1;
    } else if (arg === '--fit') {
      const fit = readValue(argv, i, arg);
      if (fit !== 'contain' && fit !== 'cover') {
        throw new Error('--fit must be contain or cover.');
      }
      options.fit = fit;
      i += 1;
    } else if (arg === '--labels') {
      const labels = readValue(argv, i, arg)
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
      if (labels.length !== 2) {
        throw new Error('--labels must contain two comma-separated labels.');
      }
      options.labels = labels;
      i += 1;
    } else if (arg === '--no-labels') {
      options.labels = null;
    } else if (arg === '--chrome-path') {
      options.chromePath = readValue(argv, i, arg);
      i += 1;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (positionals.length !== 3) {
    throw new Error(`Expected reference, render, and output paths.\n\n${usage()}`);
  }

  return {
    referencePath: resolve(positionals[0]),
    renderPath: resolve(positionals[1]),
    outputPath: resolve(positionals[2]),
    ...options,
  };
}

function commandPath(name) {
  try {
    const found = execFileSync(process.platform === 'win32' ? 'where' : 'which', [name], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
      .split(/\r?\n/)[0];
    return found || null;
  } catch {
    return null;
  }
}

function resolveChromePath(explicitPath) {
  if (explicitPath && existsSync(explicitPath)) return explicitPath;
  for (const candidate of CHROME_PATHS) {
    if (existsSync(candidate)) return candidate;
  }
  for (const candidate of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'brave-browser', 'microsoft-edge', 'chrome']) {
    const found = commandPath(candidate);
    if (found && existsSync(found)) return found;
  }
  return null;
}

async function imageDataUrl(path) {
  if (!existsSync(path)) {
    throw new Error(`Image not found: ${path}`);
  }
  const ext = extname(path).toLowerCase();
  const mime = MIME_BY_EXT.get(ext);
  if (!mime) {
    throw new Error(`Unsupported image extension "${ext}" for ${path}`);
  }
  const bytes = await readFile(path);
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const chromePath = resolveChromePath(options.chromePath);
  if (!chromePath) {
    throw new Error('Chrome or Chromium was not found. Pass --chrome-path or set CHROME_PATH.');
  }

  const [referenceUrl, renderUrl] = await Promise.all([imageDataUrl(options.referencePath), imageDataUrl(options.renderPath)]);
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu-sandbox'],
  });

  try {
    const page = await browser.newPage();
    const result = await page.evaluate(
      async (payload) => {
        const loadImage = (src) =>
          new Promise((resolveImage, rejectImage) => {
            const img = new Image();
            img.onload = () => resolveImage(img);
            img.onerror = () => rejectImage(new Error('Failed to decode image'));
            img.src = src;
          });

        const [reference, render] = await Promise.all([loadImage(payload.referenceUrl), loadImage(payload.renderUrl)]);
        const panelHeight = payload.height;
        const maxAspect = Math.max(reference.naturalWidth / reference.naturalHeight, render.naturalWidth / render.naturalHeight);
        const panelWidth = payload.panelWidth ?? Math.ceil(panelHeight * maxAspect);
        const labelHeight = payload.labels ? 34 : 0;
        const canvasWidth = payload.padding * 2 + panelWidth * 2 + payload.gap;
        const canvasHeight = payload.padding * 2 + labelHeight + panelHeight;
        const canvas = document.createElement('canvas');
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = payload.background;
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);

        const drawLabel = (text, x) => {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.font = '600 18px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textBaseline = 'top';
          ctx.fillText(text, x, payload.padding + 4);
        };

        const drawPanel = (img, x, y) => {
          const scale =
            payload.fit === 'cover'
              ? Math.max(panelWidth / img.naturalWidth, panelHeight / img.naturalHeight)
              : Math.min(panelWidth / img.naturalWidth, panelHeight / img.naturalHeight);
          const width = img.naturalWidth * scale;
          const height = img.naturalHeight * scale;
          const dx = x + (panelWidth - width) * 0.5;
          const dy = y + (panelHeight - height) * 0.5;

          ctx.save();
          ctx.beginPath();
          ctx.rect(x, y, panelWidth, panelHeight);
          ctx.clip();
          ctx.drawImage(img, dx, dy, width, height);
          ctx.restore();

          ctx.strokeStyle = 'rgba(255,255,255,0.25)';
          ctx.lineWidth = 1;
          ctx.strokeRect(x + 0.5, y + 0.5, panelWidth - 1, panelHeight - 1);
        };

        const leftX = payload.padding;
        const rightX = payload.padding + panelWidth + payload.gap;
        const panelY = payload.padding + labelHeight;
        if (payload.labels) {
          drawLabel(payload.labels[0], leftX);
          drawLabel(payload.labels[1], rightX);
        }
        drawPanel(reference, leftX, panelY);
        drawPanel(render, rightX, panelY);

        return {
          png: canvas.toDataURL('image/png'),
          width: canvasWidth,
          height: canvasHeight,
        };
      },
      {
        referenceUrl,
        renderUrl,
        height: options.height,
        panelWidth: options.panelWidth,
        gap: options.gap,
        padding: options.padding,
        background: options.background,
        fit: options.fit,
        labels: options.labels,
      },
    );

    const png = Buffer.from(result.png.replace(/^data:image\/png;base64,/, ''), 'base64');
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, png);
    console.log(`Wrote ${options.outputPath} (${result.width}x${result.height})`);
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

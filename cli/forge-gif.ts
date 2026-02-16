#!/usr/bin/env node

/**
 * ForgeCAD CLI — Orbit GIF renderer for .forge.js scripts.
 *
 * Produces a two-pass 360 animation:
 *   1) Solid view orbit
 *   2) Wireframe view orbit
 *
 * Usage:
 *   npx tsx cli/forge-gif.ts <script.forge.js> [output.gif] [options]
 */

import puppeteer from 'puppeteer-core';
import { spawn, execSync, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
import { collectProjectFiles } from './collect-files';

const { GIFEncoder, quantize, applyPalette } = gifenc;

type OrbitMode = 'solid' | 'wireframe';

interface CliOptions {
  scriptPath: string;
  outputPath: string;
  size: number;
  fps: number;
  framesPerTurn: number;
  holdFrames: number;
  pitchDeg: number;
  background: string;
  port: number;
  chromePath?: string;
}

interface BrowserOrbitInitResult {
  ok: boolean;
  error?: string;
  bbox?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  volume?: number;
  params?: unknown[];
}

interface BrowserOrbitFrameResult {
  ok: boolean;
  error?: string;
  png?: string;
}

const DEFAULTS = {
  size: parseIntEnv('FORGE_GIF_SIZE', 720),
  fps: parseIntEnv('FORGE_GIF_FPS', 18),
  framesPerTurn: parseIntEnv('FORGE_GIF_FRAMES_PER_TURN', 54),
  holdFrames: parseIntEnv('FORGE_GIF_HOLD_FRAMES', 4),
  pitchDeg: parseFloatEnv('FORGE_GIF_PITCH_DEG', 18),
  background: process.env.FORGE_GIF_BACKGROUND || '#252526',
  port: parseIntEnv('FORGE_PORT', 5173),
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function usage(): string {
  return `ForgeCAD GIF Renderer

Usage:
  npx tsx cli/forge-gif.ts <script.forge.js> [output.gif] [options]

Options:
  --size <px>                Output resolution per frame (default: ${DEFAULTS.size})
  --fps <n>                  GIF frame rate (default: ${DEFAULTS.fps})
  --frames-per-turn <n>      Frames for each 360° orbit pass (default: ${DEFAULTS.framesPerTurn})
  --hold-frames <n>          Freeze frames before each pass (default: ${DEFAULTS.holdFrames})
  --pitch <deg>              Camera pitch in degrees (default: ${DEFAULTS.pitchDeg})
  --background <color>       Canvas background, e.g. #1f1f24 (default: ${DEFAULTS.background})
  --port <n>                 Vite dev server port (default: ${DEFAULTS.port})
  --chrome-path <path>       Chrome/Chromium executable path
  -h, --help                 Show this help

Environment fallbacks:
  FORGE_GIF_SIZE, FORGE_GIF_FPS, FORGE_GIF_FRAMES_PER_TURN,
  FORGE_GIF_HOLD_FRAMES, FORGE_GIF_PITCH_DEG, FORGE_GIF_BACKGROUND,
  FORGE_PORT, CHROME_PATH`;
}

function parseCli(argv: string[]): CliOptions {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    console.log(usage());
    process.exit(0);
  }

  let scriptPath: string | undefined;
  let outputPath: string | undefined;

  let size = DEFAULTS.size;
  let fps = DEFAULTS.fps;
  let framesPerTurn = DEFAULTS.framesPerTurn;
  let holdFrames = DEFAULTS.holdFrames;
  let pitchDeg = DEFAULTS.pitchDeg;
  let background = DEFAULTS.background;
  let port = DEFAULTS.port;
  let chromePath = process.env.CHROME_PATH;

  const readValue = (idx: number, flag: string): string => {
    const next = argv[idx + 1];
    if (!next || next.startsWith('--')) {
      throw new Error(`Missing value for ${flag}`);
    }
    return next;
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--size') {
      size = Number.parseInt(readValue(i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--fps') {
      fps = Number.parseInt(readValue(i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--frames-per-turn') {
      framesPerTurn = Number.parseInt(readValue(i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--hold-frames') {
      holdFrames = Number.parseInt(readValue(i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--pitch') {
      pitchDeg = Number.parseFloat(readValue(i, arg));
      i += 1;
      continue;
    }
    if (arg === '--background') {
      background = readValue(i, arg);
      i += 1;
      continue;
    }
    if (arg === '--port') {
      port = Number.parseInt(readValue(i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--chrome-path') {
      chromePath = readValue(i, arg);
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    if (!scriptPath) {
      scriptPath = arg;
    } else if (!outputPath) {
      outputPath = arg;
    } else {
      throw new Error(`Unexpected argument: ${arg}`);
    }
  }

  if (!scriptPath) {
    throw new Error('Missing input .forge.js path');
  }

  if (!Number.isFinite(size) || size < 128 || size > 4096) {
    throw new Error(`--size must be between 128 and 4096 (got ${size})`);
  }
  if (!Number.isFinite(fps) || fps < 1 || fps > 60) {
    throw new Error(`--fps must be between 1 and 60 (got ${fps})`);
  }
  if (!Number.isFinite(framesPerTurn) || framesPerTurn < 12 || framesPerTurn > 720) {
    throw new Error(`--frames-per-turn must be between 12 and 720 (got ${framesPerTurn})`);
  }
  if (!Number.isFinite(holdFrames) || holdFrames < 0 || holdFrames > 300) {
    throw new Error(`--hold-frames must be between 0 and 300 (got ${holdFrames})`);
  }
  if (!Number.isFinite(pitchDeg) || pitchDeg < -80 || pitchDeg > 80) {
    throw new Error(`--pitch must be between -80 and 80 degrees (got ${pitchDeg})`);
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be between 1 and 65535 (got ${port})`);
  }

  const defaultOut = scriptPath.replace(/\.(forge\.)?js$/, '.orbit.gif');

  return {
    scriptPath,
    outputPath: outputPath || defaultOut,
    size,
    fps,
    framesPerTurn,
    holdFrames,
    pitchDeg,
    background,
    port,
    chromePath,
  };
}

function findChromePath(explicitPath?: string): string | null {
  if (explicitPath && existsSync(explicitPath)) return explicitPath;

  const candidatesByPlatform: Record<string, string[]> = {
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
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ],
  };

  const staticCandidates = candidatesByPlatform[process.platform] || [];
  for (const candidate of staticCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  const binaryCandidates = [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'brave-browser',
    'microsoft-edge',
    'chrome',
  ];

  for (const bin of binaryCandidates) {
    try {
      const cmd = process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`;
      const found = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (found && existsSync(found)) return found;
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function decodePngDataUrl(dataUrl: string): { width: number; height: number; data: Uint8Array } {
  const raw = dataUrl.replace(/^data:image\/png;base64,/, '');
  const buffer = Buffer.from(raw, 'base64');
  const png = PNG.sync.read(buffer);
  return {
    width: png.width,
    height: png.height,
    data: new Uint8Array(png.data.buffer, png.data.byteOffset, png.data.byteLength),
  };
}

async function fetchRenderHtml(port: number): Promise<boolean> {
  const url = `http://localhost:${port}/cli/render.html`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 1200);

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return false;
    const html = await res.text();
    return html.includes('ForgeCAD Headless Render') && html.includes('id="canvas"');
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitForRenderHtml(port: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fetchRenderHtml(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function ensureDevServer(port: number): Promise<ChildProcess | null> {
  if (await fetchRenderHtml(port)) return null;

  const proc = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['vite', '--port', String(port), '--strictPort'], {
    cwd: repoRoot,
    stdio: 'pipe',
    detached: false,
  });

  let startupOutput = '';
  const captureOutput = (chunk: Buffer | string): void => {
    startupOutput += String(chunk);
    if (startupOutput.length > 4000) {
      startupOutput = startupOutput.slice(-4000);
    }
  };
  proc.stdout?.on('data', captureOutput);
  proc.stderr?.on('data', captureOutput);

  let exitedEarly = false;
  proc.once('exit', () => {
    exitedEarly = true;
  });

  const ready = await waitForRenderHtml(port, 30000);
  if (!ready) {
    proc.kill();
    const detail = startupOutput.trim();
    if (exitedEarly) {
      throw new Error(
        detail
          ? `Failed to start Vite dev server (process exited before becoming ready).\n${detail}`
          : 'Failed to start Vite dev server (process exited before becoming ready).',
      );
    }
    throw new Error(
      detail
        ? `Timed out waiting for Vite on port ${port}.\n${detail}`
        : `Timed out waiting for Vite on port ${port}.`,
    );
  }

  return proc;
}

async function stopDevServer(proc: ChildProcess | null): Promise<void> {
  if (!proc || proc.killed) return;
  proc.kill('SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (!proc.killed) {
    proc.kill('SIGKILL');
  }
}

async function isPortFree(port: number): Promise<boolean> {
  const probe = (host: string): Promise<boolean> => {
    return new Promise((resolvePort) => {
      const server = createServer();
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRNOTAVAIL') {
          resolvePort(true);
        } else {
          resolvePort(false);
        }
      });
      server.once('listening', () => {
        server.close(() => resolvePort(true));
      });
      server.listen(port, host);
    });
  };

  const ipv4Free = await probe('127.0.0.1');
  const ipv6Free = await probe('::1');
  return ipv4Free && ipv6Free;
}

async function findFreePort(startPort: number, maxAttempts = 30): Promise<number | null> {
  let candidate = Math.max(1024, startPort);
  for (let i = 0; i < maxAttempts; i += 1) {
    if (await isPortFree(candidate)) return candidate;
    candidate += 1;
  }
  return null;
}

async function captureAndEncodeGif(page: puppeteer.Page, options: CliOptions): Promise<{ frameCount: number }> {
  const delayMs = Math.max(20, Math.round(1000 / options.fps));
  const encoder = GIFEncoder();

  const modePlan: Array<{ mode: OrbitMode; total: number }> = [
    { mode: 'solid', total: options.holdFrames + options.framesPerTurn },
    { mode: 'wireframe', total: options.holdFrames + options.framesPerTurn },
  ];

  const totalFrames = modePlan.reduce((sum, pass) => sum + pass.total, 0);
  let frameIndex = 0;

  const writeFrame = async (mode: OrbitMode, turn: number): Promise<void> => {
    const frame = await page.evaluate((payload) => {
      return (window as any).__forgeOrbitFrame(payload) as BrowserOrbitFrameResult;
    }, { mode, turn, pitchDeg: options.pitchDeg });

    if (!frame?.ok || !frame.png) {
      throw new Error(frame?.error || 'Failed to capture frame');
    }

    const decoded = decodePngDataUrl(frame.png);
    const palette = quantize(decoded.data, 256);
    const indexed = applyPalette(decoded.data, palette);

    if (frameIndex === 0) {
      encoder.writeFrame(indexed, decoded.width, decoded.height, {
        palette,
        delay: delayMs,
        repeat: 0,
      });
    } else {
      encoder.writeFrame(indexed, decoded.width, decoded.height, {
        palette,
        delay: delayMs,
      });
    }

    frameIndex += 1;
    const step = Math.max(1, Math.floor(totalFrames / 12));
    if (frameIndex % step === 0 || frameIndex === totalFrames) {
      console.log(`  frame ${frameIndex}/${totalFrames}`);
    }
  };

  for (const pass of modePlan) {
    for (let i = 0; i < options.holdFrames; i += 1) {
      await writeFrame(pass.mode, 0);
    }
    for (let i = 0; i < options.framesPerTurn; i += 1) {
      const turn = i / options.framesPerTurn;
      await writeFrame(pass.mode, turn);
    }
  }

  encoder.finish();

  const output = resolve(options.outputPath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, Buffer.from(encoder.bytes()));

  return { frameCount: totalFrames };
}

async function main(): Promise<void> {
  let options: CliOptions;

  try {
    options = parseCli(process.argv.slice(2));
  } catch (err) {
    console.error(String(err));
    console.error('');
    console.error(usage());
    process.exit(1);
  }

  const chromePath = findChromePath(options.chromePath);
  if (!chromePath) {
    console.error('No Chrome/Chromium executable found. Set CHROME_PATH or pass --chrome-path.');
    process.exit(1);
  }

  const input = resolve(options.scriptPath);
  const source = await readFile(input, 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(input);

  let activePort = options.port;
  const forgeAlreadyRunning = await fetchRenderHtml(activePort);
  if (!forgeAlreadyRunning && !(await isPortFree(activePort))) {
    const fallbackPort = await findFreePort(activePort + 1);
    if (fallbackPort == null) {
      throw new Error(`Port ${activePort} is occupied and no free fallback port was found.`);
    }
    console.log(`Port ${activePort} is occupied by another service. Using ${fallbackPort} instead.`);
    activePort = fallbackPort;
  }

  let viteProc: ChildProcess | null = null;
  let browser: puppeteer.Browser | null = null;

  try {
    if (!forgeAlreadyRunning) {
      console.log(`Starting Vite on :${activePort} ...`);
    }
    viteProc = await ensureDevServer(activePort);

    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-gpu-sandbox'],
    });

    const page = await browser.newPage();
    const url = `http://localhost:${activePort}/cli/render.html`;

    await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
    await page.waitForFunction('window.__forgeReady === true', { timeout: 10000 });

    const init = await page.evaluate((payload) => {
      return (window as any).__forgeOrbitInit(payload.code, payload.options) as BrowserOrbitInitResult;
    }, {
      code: source,
      options: {
        size: options.size,
        allFiles,
        fileName,
        background: options.background,
      },
    });

    if (!init?.ok) {
      throw new Error(init?.error || 'Script failed to initialize in renderer');
    }

    console.log(`Rendering orbit GIF: ${basename(options.outputPath)}`);
    console.log(`  size=${options.size}px fps=${options.fps} frames/turn=${options.framesPerTurn}`);
    console.log(`  passes=solid+wireframe pitch=${options.pitchDeg}°`);

    const out = await captureAndEncodeGif(page, options);

    await page.evaluate(() => {
      return (window as any).__forgeOrbitDispose();
    });

    const bb = init.bbox;
    if (bb) {
      const sx = (bb.max[0] - bb.min[0]).toFixed(1);
      const sy = (bb.max[1] - bb.min[1]).toFixed(1);
      const sz = (bb.max[2] - bb.min[2]).toFixed(1);
      console.log(`✓ GIF complete`);
      console.log(`  file: ${resolve(options.outputPath)}`);
      console.log(`  frames: ${out.frameCount}`);
      console.log(`  size: ${sx} × ${sy} × ${sz} mm`);
      if (typeof init.volume === 'number') {
        console.log(`  volume: ${init.volume.toFixed(1)} mm³`);
      }
    } else {
      console.log(`✓ GIF complete: ${resolve(options.outputPath)} (${out.frameCount} frames)`);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopDevServer(viteProc);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

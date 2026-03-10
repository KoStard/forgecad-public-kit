#!/usr/bin/env node

/**
 * ForgeCAD CLI — animated capture renderer for GIF and MP4 exports.
 *
 * Supported capture styles:
 *   - orbit: moving camera around the model
 *   - animation: fixed camera while a jointsView clip plays
 *
 * The GIF path prefers ffmpeg when available for better palette generation.
 * It falls back to the previous pure-JS encoder when ffmpeg is unavailable.
 */

import puppeteer from 'puppeteer-core';
import { spawn, execSync, type ChildProcess, type ChildProcessWithoutNullStreams } from 'child_process';
import { once } from 'events';
import { existsSync } from 'fs';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { resolve, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'net';
import { PNG } from 'pngjs';
import gifenc from 'gifenc';
import { collectProjectFiles } from './collect-files';
import { parseCameraCliSpec, type ViewportCameraState } from '../src/capture/cameraState';

const { GIFEncoder, quantize, applyPalette } = gifenc;

type OutputFormat = 'gif' | 'mp4';
type CaptureType = 'orbit' | 'animation';
type FrameMode = 'solid' | 'wireframe';
type EncoderPreference = 'auto' | 'ffmpeg' | 'js';
type ForgeQualityChoice = 'default' | 'live' | 'high';

interface CaptureCliEntryConfig {
  command: string;
  defaultFormat: OutputFormat;
}

interface CliOptions {
  scriptPath: string;
  outputPath: string;
  format: OutputFormat;
  capture: CaptureType;
  renderMode: FrameMode;
  includeWireframePass: boolean;
  size: number;
  pixelRatio: number;
  fps: number;
  framesPerTurn: number;
  holdFrames: number;
  pitchDeg?: number;
  animationName?: string;
  animationLoops: number;
  cutPlanes: string[];
  background: string;
  quality: ForgeQualityChoice;
  encoder: EncoderPreference;
  crf: number;
  port: number;
  chromePath?: string;
  ffmpegPath?: string;
  camera?: ViewportCameraState;
  listOnly: boolean;
}

interface BrowserCaptureInitResult {
  ok: boolean;
  error?: string;
  bbox?: {
    min: [number, number, number];
    max: [number, number, number];
  };
  volume?: number;
  params?: unknown[];
  animations?: Array<{
    name: string;
    duration: number;
    loop: boolean;
  }>;
  defaultAnimation?: string | null;
  selectedAnimation?: string | null;
  cutPlanes?: string[];
}

interface BrowserCaptureFrameResult {
  ok: boolean;
  error?: string;
  png?: string;
}

interface CaptureFrameStep {
  mode: FrameMode;
  turn: number;
  cameraMotion: 'orbit' | 'fixed';
  animationProgress?: number;
}

interface CaptureRunSummary {
  frameCount: number;
  width: number;
  height: number;
  encoder: 'ffmpeg' | 'js';
}

const DEFAULTS = {
  size: parseIntEnv(['FORGE_CAPTURE_SIZE', 'FORGE_GIF_SIZE'], 960),
  pixelRatio: parseFloatEnv(['FORGE_CAPTURE_PIXEL_RATIO'], 2),
  fps: parseIntEnv(['FORGE_CAPTURE_FPS', 'FORGE_GIF_FPS'], 24),
  framesPerTurn: parseIntEnv(['FORGE_CAPTURE_FRAMES_PER_TURN', 'FORGE_GIF_FRAMES_PER_TURN'], 72),
  holdFrames: parseIntEnv(['FORGE_CAPTURE_HOLD_FRAMES', 'FORGE_GIF_HOLD_FRAMES'], 6),
  pitchDeg: parseOptionalFloatEnv(['FORGE_CAPTURE_PITCH_DEG', 'FORGE_GIF_PITCH_DEG']),
  background: process.env.FORGE_CAPTURE_BACKGROUND || process.env.FORGE_GIF_BACKGROUND || '#252526',
  quality: parseQualityEnv(process.env.FORGE_CAPTURE_QUALITY) || 'high',
  animationLoops: parseIntEnv(['FORGE_CAPTURE_ANIMATION_LOOPS'], 1),
  crf: parseIntEnv(['FORGE_CAPTURE_CRF'], 18),
  port: parseIntEnv(['FORGE_PORT'], 5173),
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseIntEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw == null) continue;
    const parsed = Number.parseInt(raw, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseFloatEnv(names: string[], fallback: number): number {
  for (const name of names) {
    const raw = process.env[name];
    if (raw == null) continue;
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseOptionalFloatEnv(names: string[]): number | undefined {
  for (const name of names) {
    const raw = process.env[name];
    if (raw == null) continue;
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function parseQualityEnv(raw: string | undefined): ForgeQualityChoice | null {
  if (raw === 'default' || raw === 'live' || raw === 'high') return raw;
  return null;
}

function usage(config: CaptureCliEntryConfig): string {
  const defaultPitch = DEFAULTS.pitchDeg == null ? 'copied camera pitch or 18' : String(DEFAULTS.pitchDeg);
  return `ForgeCAD Capture Renderer

Usage:
  npx tsx ${config.command} <script.forge.js> [output.${config.defaultFormat}] [options]

Options:
  --format <gif|mp4>           Output format (default: ${config.defaultFormat})
  --capture <orbit|animation>  Camera motion preset (default: orbit)
  --animation <name>           Select a jointsView animation clip
  --animation-loops <n>        Repeat the selected clip this many times (default: ${DEFAULTS.animationLoops})
  --cut-plane <name>           Enable a named cut plane (repeatable)
  --camera <spec>              Camera spec, e.g. proj=perspective;pos=120,80,120;target=0,0,0;up=0,0,1
  --render-mode <solid|wireframe>
                               Primary render mode (default: solid)
  --include-wireframe-pass     Append a second wireframe pass
  --no-wireframe-pass          Disable the extra wireframe pass
  --size <px>                  Output frame size (default: ${DEFAULTS.size})
  --pixel-ratio <n>            Render supersampling factor (default: ${DEFAULTS.pixelRatio})
  --fps <n>                    Output frame rate (default: ${DEFAULTS.fps})
  --frames-per-turn <n>        Frames for one orbit turn (default: ${DEFAULTS.framesPerTurn})
  --hold-frames <n>            Freeze frames before each pass (default: ${DEFAULTS.holdFrames})
  --pitch <deg>                Orbit pitch override (default: ${defaultPitch})
  --background <color>         Canvas background (default: ${DEFAULTS.background})
  --quality <default|live|high>
                               Forge quality preset used for export (default: ${DEFAULTS.quality})
  --encoder <auto|ffmpeg|js>   GIF encoder strategy (default: auto)
  --crf <n>                    MP4 quality for ffmpeg/libx264, lower is better (default: ${DEFAULTS.crf})
  --port <n>                   Vite port (default: ${DEFAULTS.port})
  --chrome-path <path>         Chrome/Chromium executable path
  --ffmpeg-path <path>         ffmpeg executable path
  --list                       Print available animations and cut planes, then exit
  -h, --help                   Show this help

Examples:
  npm run gif -- examples/cup.forge.js
  npm run record -- examples/api/runtime-joints-view.forge.js out/step.mp4 --capture animation --animation Step
  npm run gif -- examples/3d-printer.forge.js out/section.gif --cut-plane "Front Section"
  npm run record -- examples/cup.forge.js out/camera.mp4 --camera "proj=perspective;pos=200,-160,120;target=0,0,20;up=0,0,1"`;
}

function parseFormat(value: string): OutputFormat {
  if (value === 'gif' || value === 'mp4') return value;
  throw new Error(`Unknown format "${value}". Expected gif or mp4.`);
}

function parseCaptureType(value: string): CaptureType {
  if (value === 'orbit' || value === 'animation') return value;
  throw new Error(`Unknown capture type "${value}". Expected orbit or animation.`);
}

function parseFrameMode(value: string): FrameMode {
  if (value === 'solid' || value === 'wireframe') return value;
  throw new Error(`Unknown render mode "${value}". Expected solid or wireframe.`);
}

function parseEncoder(value: string): EncoderPreference {
  if (value === 'auto' || value === 'ffmpeg' || value === 'js') return value;
  throw new Error(`Unknown encoder "${value}". Expected auto, ffmpeg, or js.`);
}

function readValue(argv: string[], idx: number, flag: string): string {
  const next = argv[idx + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return next;
}

function inferFormatFromPath(path: string | undefined): OutputFormat | null {
  if (!path) return null;
  const ext = extname(path).toLowerCase();
  if (ext === '.gif') return 'gif';
  if (ext === '.mp4') return 'mp4';
  return null;
}

function defaultOutputPath(scriptPath: string, format: OutputFormat, capture: CaptureType): string {
  const suffix = capture === 'animation' ? 'animation' : 'orbit';
  return scriptPath.replace(/\.(forge\.)?js$/, `.${suffix}.${format}`);
}

function parseCli(argv: string[], config: CaptureCliEntryConfig): CliOptions {
  if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) {
    console.log(usage(config));
    process.exit(0);
  }

  let scriptPath: string | undefined;
  let outputPath: string | undefined;
  let explicitFormat: OutputFormat | undefined;
  let capture: CaptureType = 'orbit';
  let renderMode: FrameMode = 'solid';
  let includeWireframePass: boolean | undefined;
  let size = DEFAULTS.size;
  let pixelRatio = DEFAULTS.pixelRatio;
  let fps = DEFAULTS.fps;
  let framesPerTurn = DEFAULTS.framesPerTurn;
  let holdFrames = DEFAULTS.holdFrames;
  let pitchDeg = DEFAULTS.pitchDeg;
  let animationName: string | undefined;
  let animationLoops = DEFAULTS.animationLoops;
  const cutPlanes: string[] = [];
  let background = DEFAULTS.background;
  let quality = DEFAULTS.quality;
  let encoder: EncoderPreference = 'auto';
  let crf = DEFAULTS.crf;
  let port = DEFAULTS.port;
  let chromePath = process.env.CHROME_PATH;
  let ffmpegPath = process.env.FFMPEG_PATH;
  let camera: ViewportCameraState | undefined;
  let listOnly = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--format') {
      explicitFormat = parseFormat(readValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--capture') {
      capture = parseCaptureType(readValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--animation') {
      animationName = readValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--animation-loops') {
      animationLoops = Number.parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--cut-plane') {
      cutPlanes.push(readValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--camera') {
      camera = parseCameraCliSpec(readValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--render-mode') {
      renderMode = parseFrameMode(readValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--include-wireframe-pass') {
      includeWireframePass = true;
      continue;
    }
    if (arg === '--no-wireframe-pass') {
      includeWireframePass = false;
      continue;
    }
    if (arg === '--size') {
      size = Number.parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--pixel-ratio') {
      pixelRatio = Number.parseFloat(readValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--fps') {
      fps = Number.parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--frames-per-turn') {
      framesPerTurn = Number.parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--hold-frames') {
      holdFrames = Number.parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--pitch') {
      pitchDeg = Number.parseFloat(readValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--background') {
      background = readValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--quality') {
      const value = readValue(argv, i, arg);
      if (value !== 'default' && value !== 'live' && value !== 'high') {
        throw new Error(`Unknown quality "${value}". Expected default, live, or high.`);
      }
      quality = value;
      i += 1;
      continue;
    }
    if (arg === '--encoder') {
      encoder = parseEncoder(readValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--crf') {
      crf = Number.parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--port') {
      port = Number.parseInt(readValue(argv, i, arg), 10);
      i += 1;
      continue;
    }
    if (arg === '--chrome-path') {
      chromePath = readValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--ffmpeg-path') {
      ffmpegPath = readValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--list') {
      listOnly = true;
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

  const inferredFormat = inferFormatFromPath(outputPath);
  const format = explicitFormat ?? inferredFormat ?? config.defaultFormat;

  if (explicitFormat && inferredFormat && explicitFormat !== inferredFormat) {
    throw new Error(`Output extension "${extname(outputPath!)}" does not match --format ${explicitFormat}.`);
  }

  const normalizedOutput = outputPath || defaultOutputPath(scriptPath, format, capture);

  if (!Number.isFinite(size) || size < 128 || size > 4096) {
    throw new Error(`--size must be between 128 and 4096 (got ${size})`);
  }
  if (!Number.isFinite(pixelRatio) || pixelRatio < 1 || pixelRatio > 4) {
    throw new Error(`--pixel-ratio must be between 1 and 4 (got ${pixelRatio})`);
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
  if (pitchDeg !== undefined && (!Number.isFinite(pitchDeg) || pitchDeg < -80 || pitchDeg > 80)) {
    throw new Error(`--pitch must be between -80 and 80 degrees (got ${pitchDeg})`);
  }
  if (!Number.isFinite(animationLoops) || animationLoops < 1 || animationLoops > 32) {
    throw new Error(`--animation-loops must be between 1 and 32 (got ${animationLoops})`);
  }
  if (!Number.isFinite(crf) || crf < 0 || crf > 51) {
    throw new Error(`--crf must be between 0 and 51 (got ${crf})`);
  }
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`--port must be between 1 and 65535 (got ${port})`);
  }
  if (format === 'mp4' && size % 2 !== 0) {
    throw new Error(`MP4 output requires an even --size because of yuv420p encoding (got ${size}).`);
  }
  if (format === 'mp4' && encoder === 'js') {
    throw new Error('MP4 output requires ffmpeg; the JS encoder is GIF-only.');
  }

  return {
    scriptPath,
    outputPath: normalizedOutput,
    format,
    capture,
    renderMode,
    includeWireframePass: includeWireframePass ?? (format === 'gif' && capture === 'orbit'),
    size,
    pixelRatio,
    fps,
    framesPerTurn,
    holdFrames,
    pitchDeg,
    animationName,
    animationLoops,
    cutPlanes,
    background,
    quality,
    encoder,
    crf,
    port,
    chromePath,
    ffmpegPath,
    camera,
    listOnly,
  };
}

function findExecutablePath(
  explicitPath: string | undefined,
  staticCandidates: string[],
  binCandidates: string[],
): string | null {
  if (explicitPath && existsSync(explicitPath)) return explicitPath;

  for (const candidate of staticCandidates) {
    if (existsSync(candidate)) return candidate;
  }

  for (const bin of binCandidates) {
    try {
      const cmd = process.platform === 'win32' ? `where ${bin}` : `command -v ${bin}`;
      const found = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (found && existsSync(found)) return found;
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function findChromePath(explicitPath?: string): string | null {
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

  return findExecutablePath(explicitPath, candidatesByPlatform[process.platform] || [], [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
    'brave-browser',
    'microsoft-edge',
    'chrome',
  ]);
}

function findFfmpegPath(explicitPath?: string): string | null {
  const candidatesByPlatform: Record<string, string[]> = {
    darwin: ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'],
    linux: ['/usr/bin/ffmpeg', '/snap/bin/ffmpeg'],
    win32: [],
  };
  return findExecutablePath(explicitPath, candidatesByPlatform[process.platform] || [], ['ffmpeg']);
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
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function loadCaptureRuntime(page: puppeteer.Page, port: number): Promise<boolean> {
  const url = `http://localhost:${port}/cli/render.html`;
  await page.goto(url, { waitUntil: 'networkidle0', timeout: 20000 });
  await page.waitForFunction('window.__forgeReady === true', { timeout: 10000 });
  return page.evaluate(() => typeof (window as any).__forgeCaptureInit === 'function');
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
  const probe = (host: string): Promise<boolean> => (
    new Promise((resolvePort) => {
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
    })
  );

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

function resolveLoopProgress(index: number, totalFrames: number, loops: number): number {
  if (totalFrames <= 1) return 0;
  if (index === totalFrames - 1) return 1;
  const absolute = (index / (totalFrames - 1)) * loops;
  return absolute - Math.floor(absolute);
}

function buildFramePlan(options: CliOptions, init: BrowserCaptureInitResult): CaptureFrameStep[] {
  const steps: CaptureFrameStep[] = [];
  const hasSelectedAnimation = Boolean(init.selectedAnimation);
  const selectedAnimationMeta = init.animations?.find((entry) => entry.name === init.selectedAnimation);

  if (options.capture === 'animation' && !hasSelectedAnimation) {
    const available = init.animations?.map((entry) => entry.name).join(', ') || '(none)';
    throw new Error(`This script does not expose an animation clip for capture. Available animations: ${available}`);
  }

  const motionFrames = options.capture === 'animation'
    ? Math.max(2, Math.round((selectedAnimationMeta?.duration ?? 1) * options.animationLoops * options.fps))
    : options.framesPerTurn;

  const passModes: FrameMode[] = [options.renderMode];
  if (options.includeWireframePass && options.renderMode !== 'wireframe') {
    passModes.push('wireframe');
  }

  for (const mode of passModes) {
    for (let i = 0; i < options.holdFrames; i += 1) {
      steps.push({
        mode,
        turn: 0,
        cameraMotion: options.capture === 'animation' ? 'fixed' : 'orbit',
        animationProgress: hasSelectedAnimation ? 0 : undefined,
      });
    }

    for (let i = 0; i < motionFrames; i += 1) {
      steps.push({
        mode,
        turn: options.capture === 'orbit' ? i / motionFrames : 0,
        cameraMotion: options.capture === 'animation' ? 'fixed' : 'orbit',
        animationProgress: hasSelectedAnimation
          ? resolveLoopProgress(i, motionFrames, options.animationLoops)
          : undefined,
      });
    }
  }

  return steps;
}

function startFfmpegEncoder(
  ffmpegPath: string,
  format: OutputFormat,
  outputPath: string,
  width: number,
  height: number,
  fps: number,
  crf: number,
): { proc: ChildProcessWithoutNullStreams; done: Promise<void> } {
  const args = format === 'gif'
    ? [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-video_size', `${width}x${height}`,
      '-framerate', String(fps),
      '-i', 'pipe:0',
      '-filter_complex', 'split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a',
      '-loop', '0',
      outputPath,
    ]
    : [
      '-y',
      '-f', 'rawvideo',
      '-pix_fmt', 'rgba',
      '-video_size', `${width}x${height}`,
      '-framerate', String(fps),
      '-i', 'pipe:0',
      '-an',
      '-c:v', 'libx264',
      '-preset', 'slow',
      '-crf', String(crf),
      '-pix_fmt', 'yuv420p',
      '-movflags', '+faststart',
      outputPath,
    ];

  const proc = spawn(ffmpegPath, args, {
    cwd: repoRoot,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let stderr = '';
  proc.stderr.on('data', (chunk) => {
    stderr += String(chunk);
    if (stderr.length > 12000) {
      stderr = stderr.slice(-12000);
    }
  });

  const done = new Promise<void>((resolveDone, rejectDone) => {
    proc.once('error', rejectDone);
    proc.once('close', (code) => {
      if (code === 0) {
        resolveDone();
      } else {
        rejectDone(new Error(stderr.trim() || `ffmpeg exited with code ${code}`));
      }
    });
  });

  return { proc, done };
}

async function writeFrameToProcess(proc: ChildProcessWithoutNullStreams, data: Uint8Array): Promise<void> {
  const buffer = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (proc.stdin.write(buffer)) return;
  await once(proc.stdin, 'drain');
}

function resolveEncoderMode(
  format: OutputFormat,
  preference: EncoderPreference,
  ffmpegPath: string | null,
): 'ffmpeg' | 'js' {
  if (format === 'mp4') {
    if (!ffmpegPath) {
      throw new Error('MP4 output requires ffmpeg. Install ffmpeg or pass --ffmpeg-path.');
    }
    return 'ffmpeg';
  }
  if (preference === 'js') return 'js';
  if (preference === 'ffmpeg') {
    if (!ffmpegPath) {
      throw new Error('GIF export requested ffmpeg explicitly, but ffmpeg was not found.');
    }
    return 'ffmpeg';
  }
  return ffmpegPath ? 'ffmpeg' : 'js';
}

async function captureAndEncode(
  page: puppeteer.Page,
  options: CliOptions,
  framePlan: CaptureFrameStep[],
  encoderMode: 'ffmpeg' | 'js',
  ffmpegPath: string | null,
): Promise<CaptureRunSummary> {
  let gifEncoder: ReturnType<typeof GIFEncoder> | null = null;
  let ffmpegProc: ChildProcessWithoutNullStreams | null = null;
  let ffmpegDone: Promise<void> | null = null;
  let width = 0;
  let height = 0;

  const output = resolve(options.outputPath);
  await mkdir(dirname(output), { recursive: true });

  for (let i = 0; i < framePlan.length; i += 1) {
    const step = framePlan[i];
    const frame = await page.evaluate((payload) => {
      return (window as any).__forgeCaptureFrame(payload) as BrowserCaptureFrameResult;
    }, {
      mode: step.mode,
      turn: step.turn,
      pitchDeg: options.pitchDeg,
      cameraMotion: step.cameraMotion,
      animationProgress: step.animationProgress,
    });

    if (!frame?.ok || !frame.png) {
      throw new Error(frame?.error || 'Failed to capture frame');
    }

    const decoded = decodePngDataUrl(frame.png);
    if (i === 0) {
      width = decoded.width;
      height = decoded.height;
      if (encoderMode === 'ffmpeg') {
        if (!ffmpegPath) {
          throw new Error('ffmpeg encoder selected without a resolved ffmpeg path.');
        }
        const started = startFfmpegEncoder(ffmpegPath, options.format, output, width, height, options.fps, options.crf);
        ffmpegProc = started.proc;
        ffmpegDone = started.done;
      } else {
        gifEncoder = GIFEncoder();
      }
    } else if (decoded.width !== width || decoded.height !== height) {
      throw new Error(`Frame ${i + 1} changed size from ${width}x${height} to ${decoded.width}x${decoded.height}.`);
    }

    if (encoderMode === 'ffmpeg') {
      if (!ffmpegProc) {
        throw new Error('ffmpeg encoder was not initialized.');
      }
      await writeFrameToProcess(ffmpegProc, decoded.data);
    } else {
      if (!gifEncoder) {
        throw new Error('GIF encoder was not initialized.');
      }
      const palette = quantize(decoded.data, 256);
      const indexed = applyPalette(decoded.data, palette);
      gifEncoder.writeFrame(indexed, decoded.width, decoded.height, {
        palette,
        delay: Math.max(20, Math.round(1000 / options.fps)),
        repeat: i === 0 ? 0 : undefined,
      });
    }

    const stepSize = Math.max(1, Math.floor(framePlan.length / 12));
    if ((i + 1) % stepSize === 0 || i + 1 === framePlan.length) {
      console.log(`  frame ${i + 1}/${framePlan.length}`);
    }
  }

  if (encoderMode === 'ffmpeg') {
    if (!ffmpegProc || !ffmpegDone) {
      throw new Error('ffmpeg encoder did not start.');
    }
    ffmpegProc.stdin.end();
    await ffmpegDone;
  } else {
    if (!gifEncoder) {
      throw new Error('GIF encoder did not start.');
    }
    gifEncoder.finish();
    await writeFile(output, Buffer.from(gifEncoder.bytes()));
  }

  return {
    frameCount: framePlan.length,
    width,
    height,
    encoder: encoderMode,
  };
}

function printList(scriptPath: string, init: BrowserCaptureInitResult): void {
  const animations = init.animations ?? [];
  const cutPlanes = init.cutPlanes ?? [];

  console.log(`Capture options for ${basename(scriptPath)}:`);
  console.log(`  animations: ${animations.length === 0 ? '(none)' : animations.map((entry) => {
    const isDefault = init.defaultAnimation === entry.name ? ' [default]' : '';
    return `${entry.name}${isDefault}`;
  }).join(', ')}`);
  console.log(`  cut planes: ${cutPlanes.length === 0 ? '(none)' : cutPlanes.join(', ')}`);
}

function printSummary(options: CliOptions, init: BrowserCaptureInitResult, encoderMode: 'ffmpeg' | 'js'): void {
  const lines = [
    `${options.format.toUpperCase()} capture: ${basename(options.outputPath)}`,
    `  capture=${options.capture} render=${options.renderMode}${options.includeWireframePass && options.renderMode !== 'wireframe' ? '+wireframe' : ''}`,
    `  size=${options.size}px render-scale=${options.pixelRatio}x fps=${options.fps} quality=${options.quality} encoder=${encoderMode}`,
  ];

  if (init.selectedAnimation) {
    lines.push(`  animation=${init.selectedAnimation} loops=${options.animationLoops}`);
  }
  if (options.cutPlanes.length > 0) {
    lines.push(`  cut-planes=${options.cutPlanes.join(', ')}`);
  }
  if (options.camera) {
    lines.push(`  camera=custom (${options.camera.projectionMode})`);
  }
  if (options.capture === 'orbit') {
    lines.push(`  orbit-frames=${options.framesPerTurn} hold=${options.holdFrames} pitch=${options.pitchDeg ?? 'auto'}°`);
  }

  lines.forEach((line) => console.log(line));
}

export async function runCaptureCli(config: CaptureCliEntryConfig): Promise<void> {
  let options: CliOptions;

  try {
    options = parseCli(process.argv.slice(2), config);
  } catch (err) {
    console.error(String(err));
    console.error('');
    console.error(usage(config));
    process.exit(1);
  }

  const chromePath = findChromePath(options.chromePath);
  if (!chromePath) {
    console.error('No Chrome/Chromium executable found. Set CHROME_PATH or pass --chrome-path.');
    process.exit(1);
  }

  const ffmpegPath = findFfmpegPath(options.ffmpegPath);
  const encoderMode = resolveEncoderMode(options.format, options.encoder, ffmpegPath);

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
      try {
        viteProc = await ensureDevServer(activePort);
      } catch (err) {
        const message = String(err);
        const isPortConflict = message.includes('already in use') || message.includes('EADDRINUSE');
        if (!isPortConflict) throw err;

        const fallbackPort = await findFreePort(activePort + 1);
        if (fallbackPort == null) throw err;

        console.log(`Port ${activePort} failed to start due to a port conflict. Retrying on ${fallbackPort} ...`);
        activePort = fallbackPort;
        viteProc = await ensureDevServer(activePort);
      }
    }
    if (forgeAlreadyRunning) {
      viteProc = await ensureDevServer(activePort);
    }

    browser = await puppeteer.launch({
      headless: true,
      executablePath: chromePath,
      args: ['--no-sandbox', '--disable-gpu-sandbox'],
    });

    const page = await browser.newPage();
    let captureRuntimeReady = await loadCaptureRuntime(page, activePort);

    if (!captureRuntimeReady && !viteProc) {
      const fallbackPort = await findFreePort(activePort + 1);
      if (fallbackPort != null) {
        console.log(`Existing server on :${activePort} is missing capture APIs. Starting a fresh server on :${fallbackPort} ...`);
        activePort = fallbackPort;
        viteProc = await ensureDevServer(activePort);
        captureRuntimeReady = await loadCaptureRuntime(page, activePort);
      }
    }

    if (!captureRuntimeReady) {
      throw new Error('Capture runtime did not initialize. Restart the Forge dev server and try again.');
    }

    const init = await page.evaluate((payload) => {
      return (window as any).__forgeCaptureInit(payload.code, payload.options) as BrowserCaptureInitResult;
    }, {
      code: source,
      options: {
        size: options.size,
        pixelRatio: options.pixelRatio,
        quality: options.quality,
        allFiles,
        fileName,
        background: options.background,
        enabledCutPlanes: options.cutPlanes,
        camera: options.camera ?? null,
        animationName: options.animationName ?? null,
        capture: options.capture,
      },
    });

    if (!init?.ok) {
      throw new Error(init?.error || 'Script failed to initialize in renderer');
    }

    if (options.listOnly) {
      printList(options.scriptPath, init);
      await page.evaluate(() => (window as any).__forgeCaptureDispose());
      return;
    }

    const framePlan = buildFramePlan(options, init);
    printSummary(options, init, encoderMode);

    if (options.format === 'gif' && encoderMode === 'js') {
      console.log('  ffmpeg not found; using the fallback 256-color JS GIF encoder.');
    }

    const out = await captureAndEncode(page, options, framePlan, encoderMode, ffmpegPath);

    await page.evaluate(() => (window as any).__forgeCaptureDispose());

    const bb = init.bbox;
    if (bb) {
      const sx = (bb.max[0] - bb.min[0]).toFixed(1);
      const sy = (bb.max[1] - bb.min[1]).toFixed(1);
      const sz = (bb.max[2] - bb.min[2]).toFixed(1);
      console.log(`✓ ${options.format.toUpperCase()} complete`);
      console.log(`  file: ${resolve(options.outputPath)}`);
      console.log(`  frames: ${out.frameCount}`);
      console.log(`  raster: ${out.width} x ${out.height}`);
      console.log(`  size: ${sx} x ${sy} x ${sz} mm`);
      if (typeof init.volume === 'number') {
        console.log(`  volume: ${init.volume.toFixed(1)} mm³`);
      }
    } else {
      console.log(`✓ ${options.format.toUpperCase()} complete: ${resolve(options.outputPath)} (${out.frameCount} frames)`);
    }
  } finally {
    if (browser) {
      await browser.close();
    }
    await stopDevServer(viteProc);
  }
}

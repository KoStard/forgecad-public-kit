#!/usr/bin/env node

import { type ChildProcess } from 'child_process';
import { resolve } from 'path';
import { packageRootFrom, resolvePackagePath, spawnPackageVite } from './package-runtime';

interface StudioOptions {
  blank: boolean;
  open: boolean;
  strictPort: boolean;
  port?: number;
  host?: string;
  projectPath?: string;
}

function usage(): never {
  console.error(`ForgeCAD Studio

Usage:
  forgecad studio
  forgecad studio <project-path>
  forgecad studio --blank

Options:
  --blank         Start without a project folder
  --port <n>      Bind Vite to a specific port
  --host [host]   Expose the dev server on the network
  --open          Open a browser window automatically
  --strict-port   Fail instead of selecting another port
  -h, --help      Show this help`);
  process.exit(0);
}

function readOptionalHost(argv: string[], index: number): { host?: string; consumed: number } {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) {
    return { host: '0.0.0.0', consumed: 0 };
  }
  return { host: value, consumed: 1 };
}

function parseStudioArgs(argv: string[]): StudioOptions {
  if (argv.length === 0) {
    return { blank: false, open: false, strictPort: false };
  }
  if (argv.includes('-h') || argv.includes('--help')) usage();

  const options: StudioOptions = {
    blank: false,
    open: false,
    strictPort: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--blank') {
      options.blank = true;
      continue;
    }
    if (arg === '--open') {
      options.open = true;
      continue;
    }
    if (arg === '--strict-port') {
      options.strictPort = true;
      continue;
    }
    if (arg === '--port') {
      const raw = argv[i + 1];
      if (!raw) throw new Error('--port requires a value');
      const port = Number.parseInt(raw, 10);
      if (!Number.isFinite(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid port: ${raw}`);
      }
      options.port = port;
      i += 1;
      continue;
    }
    if (arg === '--host') {
      const host = readOptionalHost(argv, i);
      options.host = host.host;
      i += host.consumed;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.projectPath) {
      throw new Error('Only one project path can be provided.');
    }
    options.projectPath = resolve(arg);
  }

  if (options.blank && options.projectPath) {
    throw new Error('Choose either a project path or --blank, not both.');
  }

  return options;
}

function toViteArgs(options: StudioOptions): string[] {
  const args: string[] = [];
  if (options.port != null) {
    args.push('--port', String(options.port));
  }
  if (options.host) {
    args.push('--host', options.host);
  }
  if (options.open) {
    args.push('--open');
  }
  if (options.strictPort) {
    args.push('--strictPort');
  }
  return args;
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolveExit, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolveExit(code ?? 0));
  });
}

export async function runStudioCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseStudioArgs(argv);
  const projectPath = options.blank
    ? undefined
    : options.projectPath ?? resolvePackagePath(import.meta.url, 'examples');

  const child = spawnPackageVite(import.meta.url, toViteArgs(options), {
    cwd: packageRootFrom(import.meta.url),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(projectPath ? { FORGE_PROJECT: projectPath } : {}),
    },
  });

  const code = await waitForExit(child);
  if (code !== 0) {
    process.exit(code);
  }
}

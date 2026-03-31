#!/usr/bin/env node

import { type ChildProcess } from 'child_process';
import { resolve, dirname, basename } from 'path';
import { statSync } from 'fs';
import { packageRootFrom, resolvePackagePath, spawnPackageVite } from './package-runtime';

interface DevOptions {
  blank: boolean;
  open: boolean;
  strictPort: boolean;
  port?: number;
  host?: string;
  projectPath?: string;
  initialFile?: string;
}

function usage(): never {
  console.error(`ForgeCAD Dev Server

Usage:
  forgecad dev
  forgecad dev <project-path>
  forgecad dev --blank

Starts the Vite development server with live reload. No build step required.
For the production server (requires \`npm run build\`), use \`forgecad studio\`.

Options:
  --blank         Start without a project folder
  --port <n>      Bind to a specific port (default: 5173)
  --host [host]   Expose the server on the network
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

function parseDevArgs(argv: string[]): DevOptions {
  if (argv.length === 0) {
    return { blank: false, open: false, strictPort: false };
  }
  if (argv.includes('-h') || argv.includes('--help')) usage();

  const options: DevOptions = { blank: false, open: false, strictPort: false };

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
      if (!Number.isFinite(port) || port < 1 || port > 65535) throw new Error(`Invalid port: ${raw}`);
      options.port = port;
      i += 1;
      continue;
    }
    if (arg === '--host') {
      const h = readOptionalHost(argv, i);
      options.host = h.host;
      i += h.consumed;
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    if (options.projectPath) throw new Error('Only one project path can be provided.');
    const resolved = resolve(arg);
    // If the path points to a file, use its directory as the project root and
    // record the filename so the UI can open it immediately on startup.
    let isFile = false;
    try {
      isFile = statSync(resolved).isFile();
    } catch {
      // path doesn't exist yet – treat as directory
    }
    if (isFile) {
      options.projectPath = dirname(resolved);
      options.initialFile = basename(resolved);
    } else {
      options.projectPath = resolved;
    }
  }

  if (options.blank && options.projectPath) {
    throw new Error('Choose either a project path or --blank, not both.');
  }

  return options;
}

function toViteArgs(options: DevOptions): string[] {
  const args: string[] = [];
  if (options.port != null) args.push('--port', String(options.port));
  if (options.host) args.push('--host', options.host);
  if (options.open) args.push('--open');
  if (options.strictPort) args.push('--strictPort');
  return args;
}

function waitForExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 0));
  });
}

export async function runDevCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const options = parseDevArgs(argv);
  const projectDir = options.blank ? null : (options.projectPath ?? resolvePackagePath(import.meta.url, 'examples'));

  const child = spawnPackageVite(import.meta.url, toViteArgs(options), {
    cwd: packageRootFrom(import.meta.url),
    stdio: 'inherit',
    env: {
      ...process.env,
      ...(projectDir ? { FORGE_PROJECT: projectDir } : {}),
      ...(options.initialFile ? { FORGE_FILE: options.initialFile } : {}),
    },
  });

  const code = await waitForExit(child);
  if (code !== 0) process.exit(code);
}

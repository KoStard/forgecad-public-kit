#!/usr/bin/env node
import { readFileSync } from 'fs';
import { spawn, type ChildProcess } from 'child_process';
import { createServer } from 'net';
import { dirname, relative, resolve } from 'path';
import { fileURLToPath } from 'url';
import { stdin as input } from 'node:process';
import { findProjectRoot } from './collect-files';

type NotebookOutput =
  | {
    output_type: 'stream';
    name: 'stdout' | 'stderr';
    text: string[];
  }
  | {
    output_type: 'display_data';
    data: { 'text/plain': string[] };
  }
  | {
    output_type: 'error';
    evalue: string;
    traceback: string[];
  };

interface NotebookResponse {
  cellId: string | null;
  filename: string;
  notebookText: string;
  outputs: NotebookOutput[];
  summary: {
    error: string | null;
    objectCount: number;
    paramNames: string[];
    timeMs: number;
  };
}

interface ParsedCli {
  command: 'append' | 'run';
  target: string;
  afterCellId?: string;
  cellId?: string;
  code?: string;
  filePath?: string;
  serverBase?: string;
  port: number;
}

interface ServerHandle {
  baseUrl: string;
  process: ChildProcess | null;
  requestTarget: string;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PORT = parseInt(process.env.FORGE_PORT || '5173', 10);

function usage(exitCode = 0): never {
  console.error(`Usage:
  npm run notebook -- <notebook.forge-notebook.json> --code "show(box(40, 20, 10));"
  npm run notebook -- <notebook.forge-notebook.json> --file /tmp/cell.js
  cat /tmp/cell.js | npm run notebook -- <notebook.forge-notebook.json>
  npm run notebook -- <notebook.forge-notebook.json>

Explicit subcommands are still available:
  npm run notebook -- append <notebook.forge-notebook.json> [--code "..."] [--file path] [--after cell-id]
  npm run notebook -- run <notebook.forge-notebook.json> [cell-id]

Options:
  --server <url>   Reuse an existing Forge server instead of auto-starting one
  --port <n>       Preferred port when auto-starting a server (default: ${DEFAULT_PORT})`);
  process.exit(exitCode);
}

function getOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], flag: string): boolean {
  return args.includes(flag);
}

function parsePort(value: string | undefined): number {
  const raw = value ?? String(DEFAULT_PORT);
  const port = Number.parseInt(raw, 10);
  if (!Number.isFinite(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid port: ${raw}`);
  }
  return port;
}

function parseCli(argv: string[]): ParsedCli {
  if (argv.length === 0 || hasFlag(argv, '-h') || hasFlag(argv, '--help')) usage();

  const explicitCommand = argv[0] === 'append' || argv[0] === 'run' ? argv[0] : null;
  const targetIndex = explicitCommand ? 1 : 0;
  const target = argv[targetIndex];
  if (!target || target.startsWith('--')) usage(1);

  const serverBase = getOption(argv, '--server');
  const port = parsePort(getOption(argv, '--port'));
  const code = getOption(argv, '--code');
  const filePath = getOption(argv, '--file');
  const afterCellId = getOption(argv, '--after');

  let command: 'append' | 'run';
  if (explicitCommand) {
    command = explicitCommand;
  } else if (code || filePath || !process.stdin.isTTY) {
    command = 'append';
  } else {
    command = 'run';
  }

  const cellId = command === 'run'
    ? argv[targetIndex + 1] && !argv[targetIndex + 1].startsWith('--')
      ? argv[targetIndex + 1]
      : undefined
    : undefined;

  return {
    command,
    target,
    afterCellId: command === 'append' ? afterCellId : undefined,
    cellId,
    code,
    filePath,
    serverBase,
    port,
  };
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    input.setEncoding('utf8');
    input.on('data', (chunk) => {
      data += chunk;
    });
    input.on('end', () => resolve(data));
    input.on('error', reject);
  });
}

async function resolveCellSource(cli: ParsedCli): Promise<string> {
  if (cli.code) return cli.code;
  if (cli.filePath) return readFileSync(cli.filePath, 'utf-8');
  if (!process.stdin.isTTY) {
    const stdinValue = await readStdin();
    if (stdinValue.trim().length > 0) return stdinValue;
  }
  throw new Error('Provide cell source with --code, --file, or stdin.');
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  try {
    return await fetchJson<T>(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Notebook request failed at ${url}. ${message}`);
  }
}

async function canReachServer(baseUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 1500);
    await fetchJson<Record<string, string>>(`${baseUrl}/api/files`, {
      signal: ctrl.signal,
    });
    clearTimeout(timeout);
    return true;
  } catch {
    return false;
  }
}

function startPortProbe(port: number): Promise<boolean> {
  return new Promise((resolvePort) => {
    const server = createServer();
    server.once('error', () => resolvePort(false));
    server.once('listening', () => {
      server.close(() => resolvePort(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

function parseLocalUrl(chunk: string): string | null {
  const localLine = chunk.split('\n').find((line) => line.includes('Local:'));
  if (!localLine) return null;
  const match = localLine.match(/https?:\/\/[^\s]+/);
  if (!match) return null;
  return match[0].replace(/\/+$/, '');
}

async function startServer(projectDir: string, preferredPort: number): Promise<Pick<ServerHandle, 'baseUrl' | 'process'>> {
  const localPortFree = await startPortProbe(preferredPort);
  const args = ['vite', '--port', String(preferredPort), '--', projectDir];
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const child = spawn(command, args, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      FORCE_COLOR: '0',
    },
  });

  return new Promise<ServerHandle>((resolveHandle, reject) => {
    let settled = false;
    let output = '';
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error(`Timed out starting Forge server.\n${output.trim()}`));
    }, 20000);

    const consume = (chunk: Buffer | string) => {
      const text = chunk.toString();
      output += text;
      const localUrl = parseLocalUrl(text) || parseLocalUrl(output);
      if (!localUrl || settled) return;
      settled = true;
      clearTimeout(timeout);
      resolveHandle({ baseUrl: localUrl, process: child });
    };

    child.stdout?.on('data', consume);
    child.stderr?.on('data', consume);
    child.once('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.once('exit', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const portMessage = localPortFree ? '' : ` Port ${preferredPort} was already occupied.`;
      reject(new Error(`Forge server exited before becoming ready (code ${code ?? 'unknown'}).${portMessage}\n${output.trim()}`));
    });
  });
}

async function ensureServer(cli: ParsedCli): Promise<ServerHandle> {
  const explicitBase = cli.serverBase || process.env.FORGE_NOTEBOOK_SERVER;
  if (explicitBase) {
    const baseUrl = explicitBase.replace(/\/+$/, '');
    if (!(await canReachServer(baseUrl))) {
      throw new Error(`Could not reach Forge server at ${baseUrl}.`);
    }
    return { baseUrl, process: null, requestTarget: cli.target };
  }

  const defaultBase = `http://localhost:${cli.port}`;
  if (await canReachServer(defaultBase)) {
    return { baseUrl: defaultBase, process: null, requestTarget: cli.target };
  }

  const projectDir = findProjectRoot(cli.target);
  const handle = await startServer(projectDir, cli.port);
  if (!(await canReachServer(handle.baseUrl))) {
    handle.process?.kill();
    throw new Error(`Started Forge server at ${handle.baseUrl}, but it did not respond to notebook requests.`);
  }
  const requestTarget = relative(projectDir, resolve(cli.target)).replace(/\\/g, '/');
  return {
    ...handle,
    requestTarget,
  };
}

function stopServer(handle: ServerHandle): void {
  if (!handle.process) return;
  handle.process.kill();
}

function printOutputs(payload: NotebookResponse): void {
  console.log(`Notebook: ${payload.filename}`);
  if (payload.cellId) console.log(`Cell: ${payload.cellId}`);
  payload.outputs.forEach((output) => {
    if (output.output_type === 'stream') {
      output.text.forEach((line) => console.log(line));
      return;
    }
    if (output.output_type === 'display_data') {
      output.data['text/plain'].forEach((line) => console.log(line));
      return;
    }
    console.error(output.evalue);
    output.traceback.forEach((line) => console.error(line));
  });
}

async function main() {
  const cli = parseCli(process.argv.slice(2));
  const server = await ensureServer(cli);

  try {
    if (cli.command === 'append') {
      const source = await resolveCellSource(cli);
      const payload = await postJson<NotebookResponse>(`${server.baseUrl}/api/notebook/append-cell`, {
        filename: server.requestTarget,
        source,
        afterCellId: cli.afterCellId,
      });
      printOutputs(payload);
      return;
    }

    const payload = await postJson<NotebookResponse>(`${server.baseUrl}/api/notebook/execute`, {
      filename: server.requestTarget,
      cellId: cli.cellId,
    });
    printOutputs(payload);
  } finally {
    stopServer(server);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

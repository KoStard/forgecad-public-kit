#!/usr/bin/env node
import { readFileSync } from 'fs';
import { stdin as input } from 'node:process';

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

function usage(): never {
  console.error(`Usage:
  npx tsx cli/forge-notebook.ts append <notebook.forge-notebook.json> [--code "..."] [--file path] [--after cell-id] [--server url]
  npx tsx cli/forge-notebook.ts run <notebook.forge-notebook.json> [cell-id] [--server url]`);
  process.exit(1);
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

async function resolveCellSource(args: string[]): Promise<string> {
  const codeIndex = args.indexOf('--code');
  if (codeIndex !== -1) {
    const value = args[codeIndex + 1];
    if (!value) throw new Error('Missing value for --code');
    return value;
  }

  const fileIndex = args.indexOf('--file');
  if (fileIndex !== -1) {
    const filePath = args[fileIndex + 1];
    if (!filePath) throw new Error('Missing value for --file');
    return readFileSync(filePath, 'utf-8');
  }

  if (!process.stdin.isTTY) {
    const stdinValue = await readStdin();
    if (stdinValue.trim().length > 0) return stdinValue;
  }

  throw new Error('Provide cell source with --code, --file, or stdin.');
}

function getOption(args: string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  return args[index + 1];
}

function getServerBase(args: string[]): string {
  return getOption(args, '--server')
    || process.env.FORGE_NOTEBOOK_SERVER
    || `http://127.0.0.1:${process.env.FORGE_PORT || '5173'}`;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to reach ForgeCAD server at ${url}. ${message}`);
  }

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed (${response.status})`);
  }
  return payload as T;
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
  const args = process.argv.slice(2);
  const command = args[0];
  const target = args[1];
  if (!command || !target) usage();

  const serverBase = getServerBase(args).replace(/\/+$/, '');

  if (command === 'append') {
    const source = await resolveCellSource(args);
    const afterCellId = getOption(args, '--after');
    const payload = await postJson<NotebookResponse>(`${serverBase}/api/notebook/append-cell`, {
      filename: target,
      source,
      afterCellId,
    });
    printOutputs(payload);
    return;
  }

  if (command === 'run') {
    const maybeCellId = args[2] && !args[2].startsWith('--') ? args[2] : undefined;
    const payload = await postJson<NotebookResponse>(`${serverBase}/api/notebook/execute`, {
      filename: target,
      cellId: maybeCellId,
    });
    printOutputs(payload);
    return;
  }

  usage();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

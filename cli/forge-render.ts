#!/usr/bin/env node

import { spawn } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  materializeNotebookPreviewScript,
  replaceRenderableInputExtension,
} from './notebook-entry';

const VALUE_FLAGS = new Set([
  '--angles',
  '--size',
  '--port',
  '--camera',
  '--scene',
  '--background',
  '--chrome-path',
]);

interface ParsedRenderArgs {
  scriptArgIndex: number;
  outputArgIndex: number | null;
}

function parseRenderableArgs(argv: string[]): ParsedRenderArgs | null {
  let scriptArgIndex = -1;
  let outputArgIndex: number | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (VALUE_FLAGS.has(arg)) {
      index += 1;
      continue;
    }
    if (arg === '-h' || arg === '--help') {
      continue;
    }
    if (arg.startsWith('--')) {
      continue;
    }

    if (scriptArgIndex === -1) {
      scriptArgIndex = index;
    } else if (outputArgIndex == null) {
      outputArgIndex = index;
    } else {
      break;
    }
  }

  if (scriptArgIndex === -1) return null;
  return { scriptArgIndex, outputArgIndex };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const parsed = parseRenderableArgs(argv);
  if (!parsed) {
    const renderScript = resolve(dirname(fileURLToPath(import.meta.url)), 'forge-render.mjs');
    const passthrough = spawn(process.execPath, [renderScript, ...argv], { stdio: 'inherit' });
    passthrough.on('exit', (code, signal) => {
      if (signal) process.kill(process.pid, signal);
      process.exit(code ?? 1);
    });
    return;
  }

  const originalPath = argv[parsed.scriptArgIndex];
  const materialized = materializeNotebookPreviewScript(originalPath);
  const nextArgs = [...argv];
  nextArgs[parsed.scriptArgIndex] = materialized.runnablePath;

  if (materialized.didMaterialize && parsed.outputArgIndex == null) {
    nextArgs.splice(parsed.scriptArgIndex + 1, 0, replaceRenderableInputExtension(originalPath, '.png'));
  }

  const renderScript = resolve(dirname(fileURLToPath(import.meta.url)), 'forge-render.mjs');

  try {
    await new Promise<void>((resolveRun, reject) => {
      const child = spawn(process.execPath, [renderScript, ...nextArgs], { stdio: 'inherit' });
      child.once('error', reject);
      child.once('exit', (code, signal) => {
        if (signal) {
          reject(new Error(`Render process terminated with signal ${signal}`));
          return;
        }
        if ((code ?? 0) !== 0) {
          reject(new Error(`Render process exited with code ${code ?? 1}`));
          return;
        }
        resolveRun();
      });
    });
  } finally {
    materialized.cleanup();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

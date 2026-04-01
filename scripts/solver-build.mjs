#!/usr/bin/env node
/**
 * Cross-shell solver build script.
 *
 * Finds wasm-pack (PATH or ~/.cargo/bin), builds the Rust solver to WASM.
 * Works on bash, zsh, fish, or any shell — no `source ~/.cargo/env` needed.
 *
 * Usage:
 *   node scripts/solver-build.mjs [--release] [--if-missing]
 *
 * Flags:
 *   --release      Build with full optimisation (LTO, opt-level=3)
 *   --if-missing   Only build if solver/pkg/solver.js doesn't exist
 */

import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { execFileSync, execSync } from 'child_process';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const SOLVER_PKG = join(ROOT, 'solver', 'pkg', 'solver.js');

const args = process.argv.slice(2);
const release = args.includes('--release');
const ifMissing = args.includes('--if-missing');

if (ifMissing && existsSync(SOLVER_PKG)) {
  process.exit(0);
}

// ─── Find wasm-pack ──────────────────────────────────────────────────────────

function findBinary(name) {
  // 1. Check PATH
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${cmd} ${name}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch {}

  // 2. Check ~/.cargo/bin/ (rustup installs here)
  const cargoBin = join(homedir(), '.cargo', 'bin', name);
  if (existsSync(cargoBin)) return cargoBin;

  return null;
}

const wasmPack = findBinary('wasm-pack');
if (!wasmPack) {
  console.error(`\n  ✖ wasm-pack not found.\n`);
  console.error(`  Install it with:  cargo install wasm-pack`);
  console.error(`  Or see:           https://rustwasm.github.io/wasm-pack/installer/\n`);

  // Check if cargo itself is missing
  if (!findBinary('cargo')) {
    console.error(`  (cargo is also missing — install Rust first: https://rustup.rs)\n`);
  }
  process.exit(1);
}

// ─── Build ───────────────────────────────────────────────────────────────────

const mode = release ? 'release' : 'dev';
const modeFlag = release ? '--release' : '--dev';

console.log(`  ⚙ Building solver (${mode})…`);

try {
  execFileSync(wasmPack, [
    'build', 'solver',
    '--target', 'web',
    '--out-dir', 'pkg',
    modeFlag,
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      // Ensure cargo is on PATH even if shell profile wasn't sourced
      PATH: `${join(homedir(), '.cargo', 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    },
  });
} catch (err) {
  console.error(`\n  ✖ Solver build failed.\n`);
  process.exit(1);
}

console.log(`  ✔ Solver built (${mode})`);

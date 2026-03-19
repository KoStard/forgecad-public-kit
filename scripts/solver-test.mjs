#!/usr/bin/env node
/**
 * Cross-shell solver test runner.
 * Finds cargo and runs `cargo test` for the solver crate.
 */

import { existsSync } from 'fs';
import { resolve, join } from 'path';
import { execFileSync, execSync } from 'child_process';
import { homedir } from 'os';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');

function findBinary(name) {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execSync(`${cmd} ${name}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    if (result) return result.split('\n')[0].trim();
  } catch {}
  const cargoBin = join(homedir(), '.cargo', 'bin', name);
  if (existsSync(cargoBin)) return cargoBin;
  return null;
}

const cargo = findBinary('cargo');
if (!cargo) {
  console.error(`\n  ✖ cargo not found. Install Rust: https://rustup.rs\n`);
  process.exit(1);
}

try {
  execFileSync(cargo, ['test', '--manifest-path', 'solver/Cargo.toml'], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${join(homedir(), '.cargo', 'bin')}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH}`,
    },
  });
} catch {
  process.exit(1);
}

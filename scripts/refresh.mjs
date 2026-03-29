#!/usr/bin/env node
/**
 * Rebuild all derived artifacts in correct dependency order.
 *
 * Dependency graph:
 *   build:cli            (independent)
 *   build:solver --if-missing  (independent, skips if already built)
 *   gen:types → gen:docs → build:skill:forgecad → build:docs  (sequential chain)
 *
 * Independent branches run in parallel. Exits non-zero if any step fails.
 *
 * Usage:
 *   node scripts/refresh.mjs              # full refresh + type-check
 *   node scripts/refresh.mjs --no-cli     # skip CLI rebuild
 *   node scripts/refresh.mjs --no-check   # skip tsc type-check
 *   npm run refresh
 */

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { resolve, dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const skipCli = process.argv.includes('--no-cli');

function run(label, cmd) {
  const t0 = performance.now();
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'pipe' });
    const ms = Math.round(performance.now() - t0);
    console.log(`  \u2714 ${label} (${ms}ms)`);
    return true;
  } catch (e) {
    const ms = Math.round(performance.now() - t0);
    console.error(`  \u2716 ${label} failed (${ms}ms)`);
    const stderr = e.stderr?.toString().trim();
    if (stderr) console.error(`    ${stderr.split('\n').join('\n    ')}`);
    return false;
  }
}

async function main() {
  const t0 = performance.now();
  console.log('Refreshing derived artifacts...\n');

  // Run independent tasks in parallel, types chain sequentially
  const parallel = [];

  if (!skipCli) {
    parallel.push(
      new Promise((res) => res(run('build:cli', 'npx tsup cli/forgecad.ts --format esm --platform node --target node20 --out-dir dist-cli --clean --sourcemap --external typescript')))
    );
  }

  parallel.push(
    new Promise((res) => res(run('build:solver', 'node scripts/solver-build.mjs --if-missing')))
  );

  // Types → docs → skill chain (must be sequential)
  parallel.push(
    (async () => {
      if (!run('gen:types', 'node scripts/gen-forge-types.mjs')) return false;
      if (!run('gen:docs', 'node scripts/gen-api-docs.mjs')) return false;
      if (!run('build:skill', 'node scripts/build-forgecad-skill.mjs')) return false;
      if (!run('build:docs', 'node scripts/build-docs-site.mjs')) return false;
      return true;
    })()
  );

  const results = await Promise.all(parallel);
  let allOk = results.every((r) => r !== false);

  // Type-check after all artifacts are rebuilt — catches the same errors CI would
  if (allOk && !process.argv.includes('--no-check')) {
    console.log('');
    if (!run('tsc --noEmit', 'npx tsc --noEmit')) allOk = false;
  }

  const totalMs = Math.round(performance.now() - t0);
  console.log(`\n${allOk ? 'Done' : 'Completed with errors'} (${totalMs}ms)`);

  if (!allOk) process.exit(1);
}

main();

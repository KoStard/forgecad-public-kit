#!/usr/bin/env node
/**
 * Repo invariant suite.
 *
 * This is the closest thing ForgeCAD currently has to a traditional unit-test
 * entrypoint: a single assertion-based runner over the curated CLI checks.
 */
import { execSync } from 'child_process';
import { runCheckApiContractsCli } from './check-api-contracts';
import { runCheckBrepExportCli } from './check-brep-export';
import { runCheckCompilerCli } from './check-compiler';
import { runCheckConstraintsCli } from './check-constraints';
import { runCheckDimensionsCli } from './check-dimensions';
import { runCheckExamplesCli } from './check-examples';
import { runCheckJsModulesCli } from './check-js-modules';
import { runCheckOcctLowerCli } from './check-occt-lower';
import { runCheckPlacementReferencesCli } from './check-placement-references';
import { runCheckQueryPropagationCli } from './check-query-propagation';
import { runCheckTextCli } from './check-text';
import { runCheckTransformsCli } from './check-transforms';

/* ── Animated progress ─────────────────────────────────────────────── */

const BRAILLE_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const ANSI = {
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  clearLine: '\x1b[2K',
  cursorUp: '\x1b[1A',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
};

interface Stage {
  label: string;
  insight: string;
  run: () => Promise<void>;
}

const STAGES: Stage[] = [
  { label: 'Constraints', insight: 'solver convergence & snapshot fidelity', run: () => runCheckConstraintsCli([]) },
  { label: 'Transforms', insight: 'matrix composition & assembly trees', run: () => runCheckTransformsCli() },
  { label: 'Dimensions', insight: 'parametric dimension propagation', run: () => runCheckDimensionsCli() },
  { label: 'Placement refs', insight: 'reference stability across edits', run: () => runCheckPlacementReferencesCli() },
  { label: 'JS modules', insight: 'import graph & bundle hygiene', run: () => runCheckJsModulesCli() },
  { label: 'BREP export', insight: 'solid topology & face-history integrity', run: () => runCheckBrepExportCli() },
  { label: 'Compiler', insight: 'AST snapshots & code-gen correctness', run: () => runCheckCompilerCli([]) },
  { label: 'Query propagation', insight: 'reactive data-flow graph consistency', run: () => runCheckQueryPropagationCli([]) },
  { label: 'Examples', insight: 'example gallery architecture gate', run: () => runCheckExamplesCli([]) },
  { label: 'API contracts', insight: 'public script API surface stability', run: () => runCheckApiContractsCli() },
  { label: 'Text', insight: 'text2d rendering contracts', run: () => runCheckTextCli() },
  { label: 'OCCT lowerer', insight: 'compile-plan → OCCT geometry invariants', run: () => runCheckOcctLowerCli() },
  {
    label: 'Lint & format',
    insight: 'Biome lint + formatting consistency',
    run: async () => {
      execSync('npx biome check .', { stdio: 'pipe' });
    },
  },
];

function progressBar(done: number, total: number, width: number): string {
  const filled = Math.round((done / total) * width);
  const empty = width - filled;
  const bar = '\x1b[32m' + '━'.repeat(filled) + '\x1b[2m' + '─'.repeat(empty) + '\x1b[0m';
  return bar;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

type StageResult = { label: string; durationMs: number; ok: boolean; error?: string };

/**
 * Render a live spinner line showing current stage progress.
 * Returns a cleanup function that stops the animation.
 */
function startSpinner(stage: Stage, index: number, total: number): () => void {
  const isTTY = process.stdout.isTTY;
  if (!isTTY) {
    process.stdout.write(`[${index + 1}/${total}] ${stage.label} ...\n`);
    return () => {};
  }

  let frame = 0;
  const startMs = Date.now();

  const render = () => {
    const spinner = `${ANSI.cyan}${BRAILLE_FRAMES[frame % BRAILLE_FRAMES.length]}${ANSI.reset}`;
    const bar = progressBar(index, total, 20);
    const pct = `${Math.round((index / total) * 100)}%`;
    const elapsed = formatDuration(Date.now() - startMs);
    const line =
      `${ANSI.clearLine}\r` +
      `  ${spinner} ${bar} ${ANSI.dim}${pct}${ANSI.reset}  ` +
      `${ANSI.bold}${stage.label}${ANSI.reset} ` +
      `${ANSI.dim}— ${stage.insight}${ANSI.reset} ` +
      `${ANSI.dim}(${elapsed})${ANSI.reset}`;
    process.stdout.write(line);
    frame++;
  };

  render();
  const interval = setInterval(render, 80);

  return () => {
    clearInterval(interval);
    process.stdout.write(`${ANSI.clearLine}\r`);
  };
}

function printStageResult(result: StageResult, index: number, total: number) {
  const icon = result.ok ? `${ANSI.green}✓${ANSI.reset}` : `${ANSI.red}✗${ANSI.reset}`;
  const dur = `${ANSI.dim}${formatDuration(result.durationMs)}${ANSI.reset}`;
  const counter = `${ANSI.dim}[${index + 1}/${total}]${ANSI.reset}`;
  console.log(`  ${icon} ${counter} ${result.label} ${dur}`);
}

function printSummary(results: StageResult[], totalMs: number) {
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const slowest = results.reduce((a, b) => (a.durationMs > b.durationMs ? a : b));

  console.log('');
  console.log(`  ${progressBar(results.length, results.length, 20)} ${ANSI.bold}100%${ANSI.reset}`);
  console.log('');

  if (failed === 0) {
    console.log(
      `  ${ANSI.green}${ANSI.bold}✓ Invariant suite passed${ANSI.reset} ${ANSI.dim}— ${passed} checks in ${formatDuration(totalMs)}${ANSI.reset}`,
    );
  } else {
    console.log(
      `  ${ANSI.red}${ANSI.bold}✗ Suite failed${ANSI.reset} ${ANSI.dim}— ${passed} passed, ${failed} failed in ${formatDuration(totalMs)}${ANSI.reset}`,
    );
  }
  console.log(`  ${ANSI.dim}slowest: ${slowest.label} (${formatDuration(slowest.durationMs)})${ANSI.reset}`);
  console.log('');
}

/* ── Runner ────────────────────────────────────────────────────────── */

export async function runCheckSuiteCli(): Promise<void> {
  const isTTY = process.stdout.isTTY;
  if (isTTY) process.stdout.write(ANSI.hideCursor);

  console.log('');
  console.log(`  ${ANSI.bold}ForgeCAD Invariant Suite${ANSI.reset} ${ANSI.dim}(${STAGES.length} checks)${ANSI.reset}`);
  console.log('');

  const results: StageResult[] = [];
  const suiteStart = Date.now();

  for (let i = 0; i < STAGES.length; i++) {
    const stage = STAGES[i];
    const stopSpinner = startSpinner(stage, i, STAGES.length);
    const t0 = Date.now();
    let ok = true;
    let error: string | undefined;
    try {
      await stage.run();
    } catch (err) {
      ok = false;
      error = (err as Error).message;
    }
    stopSpinner();
    const result: StageResult = { label: stage.label, durationMs: Date.now() - t0, ok, error };
    results.push(result);
    printStageResult(result, i, STAGES.length);
    if (!ok && error) {
      console.error(`    ${ANSI.red}${error}${ANSI.reset}`);
    }
  }

  const totalMs = Date.now() - suiteStart;
  printSummary(results, totalMs);

  if (isTTY) process.stdout.write(ANSI.showCursor);

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    process.exit(1);
  }
}

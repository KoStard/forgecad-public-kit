#!/usr/bin/env node
/**
 * Debug helper: inspect compiler routing, exact lowering, and runtime snapshots.
 *
 * Usage:
 *   forgecad debug compiler <script.forge.js> [--compact]
 */
import { init } from '../src/forge/headless';
import { inspectCompilerScene, loadCompilerInspectionInput } from './compiler-inspection';

function usage(): never {
  console.error('Usage: forgecad debug compiler <script.forge.js> [--compact]');
  process.exit(1);
}

export async function runDebugCompilerCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = argv.find((arg) => !arg.startsWith('--'));
  if (!scriptPath) usage();

  const compact = argv.includes('--compact');

  await init();
  const inspection = inspectCompilerScene(loadCompilerInspectionInput(scriptPath));
  console.log(JSON.stringify(inspection, null, compact ? 0 : 2));
}

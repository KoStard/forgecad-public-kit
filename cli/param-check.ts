#!/usr/bin/env node
/**
 * ForgeCAD CLI — Parameter Collision Detection (Static Analysis)
 *
 * Samples each parameter across its range and checks for:
 * 1. Runtime errors at certain values
 * 2. Degenerate geometry (volume ≈ 0)
 * 3. New collisions between parts that didn't collide at defaults
 *
 * Usage: npx tsx cli/param-check.ts <script.forge.js> [--samples N]
 */
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { init, runScript } from '../src/forge/headless';
import type { Shape } from '../src/forge/kernel';
import { setParamOverrides } from '../src/forge/params';
import type { RunResult, SceneObject } from '../src/forge/runner';
import { collectProjectFiles } from './collect-files';

interface Issue {
  param: string;
  value: number;
  type: 'error' | 'degenerate' | 'collision';
  detail: string;
}

type ShapeEntry = { name: string; shape: Shape; min: number[]; max: number[]; groupName?: string };

function getShapeEntries(result: RunResult): ShapeEntry[] {
  return result.objects
    .filter((o: SceneObject) => o.shape)
    .map((o: SceneObject) => {
      const bb = o.shape!.boundingBox();
      return { name: o.name, shape: o.shape!, min: bb.min as number[], max: bb.max as number[], groupName: o.groupName };
    });
}

function bboxOverlap(a: ShapeEntry, b: ShapeEntry): boolean {
  return [0, 1, 2].every((k) => a.min[k] < b.max[k] + 0.1 && a.max[k] > b.min[k] - 0.1);
}

/** Find collision pairs → set of "nameA|nameB" strings, skipping intra-group */
function findCollisions(entries: ShapeEntry[]): Map<string, number> {
  const collisions = new Map<string, number>();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i],
        b = entries[j];
      if (a.groupName && a.groupName === b.groupName) continue; // same group — skip
      if (!bboxOverlap(a, b)) continue;
      try {
        const hit = a.shape.intersect(b.shape);
        if (!hit.isEmpty()) {
          const vol = hit.volume();
          if (vol > 0.1) {
            const key = [a.name, b.name].sort().join(' ∩ ');
            collisions.set(key, vol);
          }
        }
      } catch {
        /* skip degenerate intersection */
      }
    }
  }
  return collisions;
}

function usage(): never {
  console.error('Usage: forgecad check params <script.forge.js> [--samples N]');
  process.exit(1);
}

export async function runParamCheckCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const scriptPath = argv[0];
  if (!scriptPath) usage();

  const samplesArg = argv.indexOf('--samples');
  const numSamples = samplesArg >= 0 ? parseInt(argv[samplesArg + 1], 10) : 8;
  const code = readFileSync(resolve(scriptPath), 'utf-8');
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();

  // 1. Run at defaults to get baseline
  setParamOverrides({});
  const baseline = runScript(code, fileName, allFiles);
  if (baseline.error) {
    console.error('ERROR at defaults:', baseline.error);
    process.exit(1);
  }

  const params = baseline.params;
  if (params.length === 0) {
    console.log('No parameters found — nothing to check.');
    process.exit(0);
  }

  console.log(`✓ Baseline: ${baseline.objects.length} objects, ${params.length} params`);
  console.log(`  Params: ${params.map((p) => `${p.name}=${p.value} [${p.min}..${p.max}]`).join(', ')}`);

  // Baseline collisions (these are "expected" — don't report them again)
  const baselineEntries = getShapeEntries(baseline);
  const baselineCollisions = findCollisions(baselineEntries);
  if (baselineCollisions.size > 0) {
    console.log(`  Baseline collisions (expected):`);
    for (const [pair, vol] of baselineCollisions) {
      console.log(`    ${pair}: ${vol.toFixed(1)}mm³`);
    }
  }

  // Baseline volumes per object (to detect degenerate)
  const baselineVolumes = new Map<string, number>();
  for (const e of baselineEntries) {
    baselineVolumes.set(e.name, e.shape.volume());
  }

  // 2. For each param, sample across its range
  const issues: Issue[] = [];
  const _totalRuns = params.length * numSamples;
  let runCount = 0;

  for (const p of params) {
    const range = p.max - p.min;
    if (range <= 0) continue;

    for (let s = 0; s < numSamples; s++) {
      const t = s / (numSamples - 1); // 0..1
      let value = p.min + t * range;
      if (p.integer) value = Math.round(value);
      if (Math.abs(value - p.value) < (p.step || 0.01)) continue; // skip default

      runCount++;
      const overrides: Record<string, number> = {};
      overrides[p.name] = value;
      setParamOverrides(overrides);

      try {
        const result = runScript(code, fileName, allFiles);

        if (result.error) {
          issues.push({
            param: p.name,
            value,
            type: 'error',
            detail: result.error,
          });
          continue;
        }

        // Check for degenerate geometry
        const entries = getShapeEntries(result);
        for (const e of entries) {
          const vol = e.shape.volume();
          const baseVol = baselineVolumes.get(e.name) ?? 0;
          if (vol < 0.01 && baseVol > 1) {
            issues.push({
              param: p.name,
              value,
              type: 'degenerate',
              detail: `${e.name} has volume ${vol.toFixed(3)}mm³ (was ${baseVol.toFixed(1)}mm³ at default)`,
            });
          }
        }

        // Check for new collisions
        if (entries.length > 1) {
          const collisions = findCollisions(entries);
          for (const [pair, vol] of collisions) {
            if (!baselineCollisions.has(pair)) {
              issues.push({
                param: p.name,
                value,
                type: 'collision',
                detail: `${pair} (shared vol: ${vol.toFixed(1)}mm³)`,
              });
            }
          }
        }
      } catch (e: any) {
        issues.push({
          param: p.name,
          value,
          type: 'error',
          detail: e.message || String(e),
        });
      }
    }
  }

  // Reset overrides
  setParamOverrides({});

  // 3. Report
  console.log(`\n✓ Checked ${runCount} parameter samples (${numSamples} per param)`);

  if (issues.length === 0) {
    console.log('✓ No issues found — all parameter values produce valid geometry.');
    return;
  }

  // Group issues by param
  const byParam = new Map<string, Issue[]>();
  for (const issue of issues) {
    const list = byParam.get(issue.param) || [];
    list.push(issue);
    byParam.set(issue.param, list);
  }

  console.log(`\n⚠ Found ${issues.length} issues across ${byParam.size} parameters:\n`);

  for (const [paramName, paramIssues] of byParam) {
    console.log(`  Parameter "${paramName}":`);

    // Group by type and find ranges
    const errors = paramIssues.filter((i) => i.type === 'error');
    const degenerates = paramIssues.filter((i) => i.type === 'degenerate');
    const collisions = paramIssues.filter((i) => i.type === 'collision');

    if (errors.length > 0) {
      const vals = errors.map((e) => e.value).sort((a, b) => a - b);
      console.log(`    ❌ Runtime error at values: ${vals.map((v) => v.toFixed(1)).join(', ')}`);
      // Show first unique error
      const uniqueErrors = [...new Set(errors.map((e) => e.detail))];
      for (const err of uniqueErrors.slice(0, 2)) {
        console.log(`       ${err}`);
      }
    }

    if (degenerates.length > 0) {
      const vals = degenerates.map((e) => e.value).sort((a, b) => a - b);
      console.log(`    ⚠ Degenerate geometry at values: ${vals.map((v) => v.toFixed(1)).join(', ')}`);
      for (const d of degenerates.slice(0, 2)) {
        console.log(`       ${d.detail}`);
      }
    }

    if (collisions.length > 0) {
      const vals = collisions.map((e) => e.value).sort((a, b) => a - b);
      console.log(`    💥 New collision at values: ${vals.map((v) => v.toFixed(1)).join(', ')}`);
      // Deduplicate collision pairs
      const seen = new Set<string>();
      for (const c of collisions) {
        if (!seen.has(c.detail)) {
          seen.add(c.detail);
          console.log(`       ${c.detail}`);
        }
      }
    }

    console.log('');
  }
}

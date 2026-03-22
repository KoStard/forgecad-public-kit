#!/usr/bin/env node
/**
 * Backend parity checker.
 *
 * Runs every .forge.js file with both Manifold and OCCT backends,
 * compares geometric outputs (volume, surface area, bounding box),
 * and writes a structured report.
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative, join, basename, dirname } from 'path';
import { init, runScript } from '../src/forge/headless';
import { setActiveBackend, type ActiveBackend } from '../src/forge/kernel';
import { collectProjectFiles } from './collect-files';

/* ── Types ─────────────────────────────────────────────────────────── */

interface ShapeMetrics {
  volume: number;
  surfaceArea: number;
  bboxMin: [number, number, number];
  bboxMax: [number, number, number];
  numTri: number;
  isEmpty: boolean;
}

interface ObjectResult {
  name: string;
  manifold: ShapeMetrics | null;
  occt: ShapeMetrics | null;
}

interface FileResult {
  file: string;
  manifoldError: string | null;
  occtError: string | null;
  manifoldTimeMs: number;
  occtTimeMs: number;
  objects: ObjectResult[];
  score: number; // 0-100 similarity
  issues: string[];
}

/* ── Helpers ───────────────────────────────────────────────────────── */

function collectForgeFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      let stat;
      try { stat = statSync(full); } catch { continue; }
      if (stat.isDirectory() && !entry.startsWith('.') && entry !== 'node_modules' && entry !== 'dist') {
        results.push(...collectForgeFiles(full));
      } else if (stat.isFile() && entry.endsWith('.forge.js')) {
        results.push(full);
      }
    }
  } catch { /* directory doesn't exist */ }
  return results;
}

function extractMetrics(shape: any): ShapeMetrics | null {
  try {
    const bb = shape.boundingBox();
    return {
      volume: shape.volume(),
      surfaceArea: shape.surfaceArea(),
      bboxMin: [bb.min[0], bb.min[1], bb.min[2]],
      bboxMax: [bb.max[0], bb.max[1], bb.max[2]],
      numTri: shape.numTri(),
      isEmpty: shape.isEmpty(),
    };
  } catch {
    return null;
  }
}

function relDiff(a: number, b: number): number {
  if (a === 0 && b === 0) return 0;
  const denom = Math.max(Math.abs(a), Math.abs(b));
  if (denom < 1e-10) return 0;
  return Math.abs(a - b) / denom;
}

function compareMetrics(m: ShapeMetrics, o: ShapeMetrics): { score: number; issues: string[] } {
  const issues: string[] = [];
  let penalty = 0;

  // Volume comparison (most important)
  const volDiff = relDiff(m.volume, o.volume);
  if (volDiff > 0.01) {
    issues.push(`volume: manifold=${m.volume.toFixed(2)} occt=${o.volume.toFixed(2)} (${(volDiff * 100).toFixed(1)}% diff)`);
    penalty += Math.min(volDiff * 100, 40);
  }

  // Surface area comparison
  const saDiff = relDiff(m.surfaceArea, o.surfaceArea);
  if (saDiff > 0.05) {
    issues.push(`surfaceArea: manifold=${m.surfaceArea.toFixed(2)} occt=${o.surfaceArea.toFixed(2)} (${(saDiff * 100).toFixed(1)}% diff)`);
    penalty += Math.min(saDiff * 50, 20);
  }

  // Bounding box comparison
  for (let i = 0; i < 3; i++) {
    const axis = ['x', 'y', 'z'][i];
    const minDiff = Math.abs(m.bboxMin[i] - o.bboxMin[i]);
    const maxDiff = Math.abs(m.bboxMax[i] - o.bboxMax[i]);
    const span = Math.max(Math.abs(m.bboxMax[i] - m.bboxMin[i]), Math.abs(o.bboxMax[i] - o.bboxMin[i]), 1);
    if (minDiff / span > 0.01) {
      issues.push(`bbox.min.${axis}: manifold=${m.bboxMin[i].toFixed(2)} occt=${o.bboxMin[i].toFixed(2)} (delta ${minDiff.toFixed(2)})`);
      penalty += Math.min(minDiff / span * 30, 10);
    }
    if (maxDiff / span > 0.01) {
      issues.push(`bbox.max.${axis}: manifold=${m.bboxMax[i].toFixed(2)} occt=${o.bboxMax[i].toFixed(2)} (delta ${maxDiff.toFixed(2)})`);
      penalty += Math.min(maxDiff / span * 30, 10);
    }
  }

  // Empty mismatch
  if (m.isEmpty !== o.isEmpty) {
    issues.push(`isEmpty: manifold=${m.isEmpty} occt=${o.isEmpty}`);
    penalty += 50;
  }

  return { score: Math.max(0, 100 - penalty), issues };
}

function runWithBackend(
  backend: ActiveBackend,
  code: string,
  fileName: string,
  allFiles: Record<string, string>,
): { error: string | null; objects: { name: string; metrics: ShapeMetrics | null }[]; timeMs: number } {
  setActiveBackend(backend);
  const t0 = Date.now();
  let result;
  try {
    result = runScript(code, fileName, allFiles);
  } catch (err: any) {
    return { error: err.message || String(err), objects: [], timeMs: Date.now() - t0 };
  }
  const timeMs = Date.now() - t0;
  if (result.error) {
    return { error: result.error, objects: [], timeMs };
  }
  const objects = result.objects
    .filter((o: any) => o.shape)
    .map((o: any) => ({ name: o.name || o.id || 'unnamed', metrics: extractMetrics(o.shape) }));
  return { error: null, objects, timeMs };
}

/* ── Main ──────────────────────────────────────────────────────────── */

export async function runCheckBackendParityCli(args: string[] = []): Promise<void> {
  await init();

  const EXAMPLE_DIR = resolve(process.cwd(), 'examples');
  const PERSONAL_DIR = '/Users/kostard/Projects/CAD/PersonalForgeCADProjects';

  // Collect files
  let files: string[] = [];
  if (args.length > 0) {
    // Run specific files
    files = args.map(f => resolve(f));
  } else {
    files = [
      ...collectForgeFiles(EXAMPLE_DIR),
      ...collectForgeFiles(PERSONAL_DIR),
    ];
  }

  console.log(`\nBackend parity check: ${files.length} files\n`);

  const results: FileResult[] = [];
  let passed = 0;
  let failed = 0;
  let errored = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const shortName = file.startsWith(EXAMPLE_DIR)
      ? 'examples/' + relative(EXAMPLE_DIR, file)
      : file.startsWith(PERSONAL_DIR)
        ? 'personal/' + relative(PERSONAL_DIR, file)
        : basename(file);

    // Load file and sibling files for imports
    const { allFiles, fileName } = collectProjectFiles(file);
    const code = readFileSync(file, 'utf-8');

    // Run both backends
    const manifold = runWithBackend('manifold', code, fileName, allFiles);
    const occt = runWithBackend('occt', code, fileName, allFiles);

    // Restore default
    setActiveBackend('manifold');

    // Compare
    const fileResult: FileResult = {
      file: shortName,
      manifoldError: manifold.error,
      occtError: occt.error,
      manifoldTimeMs: manifold.timeMs,
      occtTimeMs: occt.timeMs,
      objects: [],
      score: 100,
      issues: [],
    };

    if (manifold.error && occt.error) {
      fileResult.score = -1; // both error
      fileResult.issues.push(`BOTH_ERROR: manifold="${manifold.error}" occt="${occt.error}"`);
      errored++;
    } else if (manifold.error) {
      fileResult.score = -2; // manifold-only error
      fileResult.issues.push(`MANIFOLD_ERROR: ${manifold.error}`);
      errored++;
    } else if (occt.error) {
      fileResult.score = -3; // occt-only error
      fileResult.issues.push(`OCCT_ERROR: ${occt.error}`);
      errored++;
    } else {
      // Both succeeded — compare objects
      const maxObjs = Math.max(manifold.objects.length, occt.objects.length);
      if (manifold.objects.length !== occt.objects.length) {
        fileResult.issues.push(`object count: manifold=${manifold.objects.length} occt=${occt.objects.length}`);
      }

      let totalScore = 0;
      let scored = 0;
      for (let j = 0; j < maxObjs; j++) {
        const mObj = manifold.objects[j];
        const oObj = occt.objects[j];
        const objResult: ObjectResult = {
          name: mObj?.name || oObj?.name || `object-${j}`,
          manifold: mObj?.metrics || null,
          occt: oObj?.metrics || null,
        };

        if (mObj?.metrics && oObj?.metrics) {
          const cmp = compareMetrics(mObj.metrics, oObj.metrics);
          totalScore += cmp.score;
          scored++;
          objResult.manifold = mObj.metrics;
          objResult.occt = oObj.metrics;
          for (const issue of cmp.issues) {
            fileResult.issues.push(`[${objResult.name}] ${issue}`);
          }
        } else if (mObj?.metrics && !oObj?.metrics) {
          fileResult.issues.push(`[${objResult.name}] OCCT produced no metrics`);
          totalScore += 0;
          scored++;
        } else if (!mObj?.metrics && oObj?.metrics) {
          fileResult.issues.push(`[${objResult.name}] Manifold produced no metrics`);
          totalScore += 0;
          scored++;
        }

        fileResult.objects.push(objResult);
      }

      fileResult.score = scored > 0 ? Math.round(totalScore / scored) : 100;

      if (fileResult.score >= 95) passed++;
      else failed++;
    }

    // Progress
    const icon = fileResult.score >= 95 ? '✓' : fileResult.score >= 0 ? '✗' : '⚠';
    const scoreStr = fileResult.score >= 0 ? `${fileResult.score}%` : 'ERR';
    const brief = fileResult.issues.length > 0 ? ` — ${fileResult.issues[0]}` : '';
    console.log(`  ${icon} [${i + 1}/${files.length}] ${shortName}: ${scoreStr}${brief}`);

    results.push(fileResult);
  }

  // Sort by score (worst first)
  results.sort((a, b) => a.score - b.score);

  // Summary
  console.log(`\n─── Summary ───`);
  console.log(`  Total:   ${files.length}`);
  console.log(`  Passed:  ${passed} (≥95% parity)`);
  console.log(`  Failed:  ${failed} (<95% parity)`);
  console.log(`  Errored: ${errored}`);

  // Write report
  const reportPath = resolve(process.cwd(), 'docs/temporary/projects/2026/03/22/backend-parity-report.md');
  const report = generateReport(results, { passed, failed, errored, total: files.length });
  writeFileSync(reportPath, report, 'utf-8');
  console.log(`\n  Report written to: ${reportPath}\n`);
}

function generateReport(
  results: FileResult[],
  summary: { passed: number; failed: number; errored: number; total: number },
): string {
  const lines: string[] = [];
  lines.push('# Backend Parity Report: Manifold vs OCCT');
  lines.push('');
  lines.push(`**Date**: ${new Date().toISOString().split('T')[0]}`);
  lines.push(`**Files tested**: ${summary.total}`);
  lines.push(`**Passed (≥95%)**: ${summary.passed}`);
  lines.push(`**Failed (<95%)**: ${summary.failed}`);
  lines.push(`**Errored**: ${summary.errored}`);
  lines.push('');

  // OCCT-only errors (most actionable)
  const occtErrors = results.filter(r => r.score === -3);
  if (occtErrors.length > 0) {
    lines.push('## OCCT-Only Errors');
    lines.push('');
    lines.push('Files that work with Manifold but crash with OCCT:');
    lines.push('');
    lines.push('| File | Error |');
    lines.push('|------|-------|');
    for (const r of occtErrors) {
      const err = r.occtError?.replace(/\n/g, ' ').slice(0, 120) || '';
      lines.push(`| ${r.file} | ${err} |`);
    }
    lines.push('');
  }

  // Manifold-only errors
  const manifoldErrors = results.filter(r => r.score === -2);
  if (manifoldErrors.length > 0) {
    lines.push('## Manifold-Only Errors');
    lines.push('');
    lines.push('| File | Error |');
    lines.push('|------|-------|');
    for (const r of manifoldErrors) {
      const err = r.manifoldError?.replace(/\n/g, ' ').slice(0, 120) || '';
      lines.push(`| ${r.file} | ${err} |`);
    }
    lines.push('');
  }

  // Both errors
  const bothErrors = results.filter(r => r.score === -1);
  if (bothErrors.length > 0) {
    lines.push('## Both Backends Error');
    lines.push('');
    lines.push('| File | Manifold Error | OCCT Error |');
    lines.push('|------|---------------|------------|');
    for (const r of bothErrors) {
      const mErr = r.manifoldError?.replace(/\n/g, ' ').slice(0, 80) || '';
      const oErr = r.occtError?.replace(/\n/g, ' ').slice(0, 80) || '';
      lines.push(`| ${r.file} | ${mErr} | ${oErr} |`);
    }
    lines.push('');
  }

  // Geometry mismatches (sorted worst-first)
  const mismatches = results.filter(r => r.score >= 0 && r.score < 95);
  if (mismatches.length > 0) {
    lines.push('## Geometry Mismatches');
    lines.push('');
    lines.push('Files where both backends succeed but produce different geometry:');
    lines.push('');
    for (const r of mismatches) {
      lines.push(`### ${r.file} — ${r.score}%`);
      lines.push('');
      for (const issue of r.issues) {
        lines.push(`- ${issue}`);
      }
      lines.push('');
    }
  }

  // Passing files
  const passing = results.filter(r => r.score >= 95);
  if (passing.length > 0) {
    lines.push('## Passing Files (≥95% parity)');
    lines.push('');
    lines.push('| File | Score | Manifold ms | OCCT ms |');
    lines.push('|------|-------|-------------|---------|');
    for (const r of passing) {
      lines.push(`| ${r.file} | ${r.score}% | ${r.manifoldTimeMs} | ${r.occtTimeMs} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

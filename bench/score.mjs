#!/usr/bin/env node
/**
 * ForgeCAD Benchmark — Scoring Module
 *
 * Scores a candidate .forge.js solution against a reference model using
 * spatial validators: 3D IoU, volume match, bounding-box match, surface-area match.
 *
 * Can be used standalone or imported by the runner.
 *
 * Usage:
 *   node bench/score.mjs <challenge-dir> <solution.forge.js>
 *
 * The challenge directory must contain a reference.forge.js file.
 */

import { readFileSync, writeFileSync, unlinkSync, existsSync, mkdirSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve, dirname, basename, extname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const FORGECAD_CLI = join(PROJECT_ROOT, 'dist-cli', 'forgecad.js');

// ---------------------------------------------------------------------------
// Scoring harness — a .forge.js script that imports both reference and
// candidate, computes spatial similarity metrics, and outputs structured JSON.
// ---------------------------------------------------------------------------

const SCORING_HARNESS = `
// Auto-generated scoring harness — do not edit
// Compares candidate (solution.forge.js) against reference (reference.forge.js)

function round(v) { return Math.round(v * 100) / 100; }

// ---- Load candidate (with error handling) ----
let candidate = null;
let loadError = null;
try {
  candidate = require("./solution.forge.js");
} catch (e) {
  loadError = e.message || String(e);
}

if (loadError || !candidate || candidate.isEmpty()) {
  const result = {
    error: loadError || "Empty or null shape returned",
    overall: 0,
    breakdown: {
      iou:         { score: 0, weight: 0.50 },
      volume:      { score: 0, weight: 0.20 },
      bbox:        { score: 0, weight: 0.15 },
      surfaceArea: { score: 0, weight: 0.15 },
    },
    candidateMetrics: null,
    referenceMetrics: null,
  };
  console.warn("BENCH_SCORE:" + JSON.stringify(result));
  return box(1, 1, 1); // must return something
}

// ---- Load reference ----
const reference = require("./reference.forge.js");

// ---- Gather metrics ----
const refVol  = reference.volume();
const candVol = candidate.volume();
const refSA   = reference.surfaceArea();
const candSA  = candidate.surfaceArea();
const refBB   = reference.boundingBox();
const candBB  = candidate.boundingBox();

const refSize  = [refBB.max[0]-refBB.min[0], refBB.max[1]-refBB.min[1], refBB.max[2]-refBB.min[2]];
const candSize = [candBB.max[0]-candBB.min[0], candBB.max[1]-candBB.min[1], candBB.max[2]-candBB.min[2]];

// Sort dimensions descending for orientation-independent comparison
const refSorted  = [...refSize].sort((a, b) => b - a);
const candSorted = [...candSize].sort((a, b) => b - a);

// ---- Validator 1: Volume similarity ----
const volScore = Math.min(refVol, candVol) / Math.max(refVol, candVol || 0.001);

// ---- Validator 2: Bounding-box similarity (orientation-independent) ----
let bboxErr = 0, bboxSum = 0;
for (let i = 0; i < 3; i++) {
  bboxErr += Math.abs(refSorted[i] - candSorted[i]);
  bboxSum += refSorted[i];
}
const bboxScore = Math.max(0, 1 - bboxErr / (bboxSum || 0.001));

// ---- Validator 3: Surface-area similarity ----
const saScore = Math.min(refSA, candSA) / Math.max(refSA, candSA || 0.001);

// ---- Validator 4: 3D IoU (Intersection over Union) ----
// Center both shapes at origin to remove trivial translation offset,
// but preserve orientation (the AI should match orientation from images).
let iouScore = 0;
let iouError = null;
try {
  const refC  = [(refBB.min[0]+refBB.max[0])/2, (refBB.min[1]+refBB.max[1])/2, (refBB.min[2]+refBB.max[2])/2];
  const candC = [(candBB.min[0]+candBB.max[0])/2, (candBB.min[1]+candBB.max[1])/2, (candBB.min[2]+candBB.max[2])/2];

  const refCentered  = reference.translate(-refC[0], -refC[1], -refC[2]);
  const candCentered = candidate.translate(-candC[0], -candC[1], -candC[2]);

  const inter = intersection(refCentered, candCentered);
  const uni   = union(refCentered, candCentered);

  const interVol = inter.isEmpty() ? 0 : inter.volume();
  const uniVol   = uni.isEmpty() ? 0.001 : uni.volume();
  iouScore = interVol / uniVol;
} catch (e) {
  iouError = e.message || String(e);
}

// ---- Weighted overall score ----
const W = { iou: 0.50, volume: 0.20, bbox: 0.15, surfaceArea: 0.15 };
const overall = W.iou * iouScore + W.volume * volScore + W.bbox * bboxScore + W.surfaceArea * saScore;

const result = {
  overall: Math.round(overall * 1000) / 10, // percentage 0-100
  breakdown: {
    iou:         { score: round(iouScore), weight: W.iou, error: iouError },
    volume:      { score: round(volScore), weight: W.volume, ref: round(refVol), cand: round(candVol) },
    bbox:        { score: round(bboxScore), weight: W.bbox, ref: refSorted.map(round), cand: candSorted.map(round) },
    surfaceArea: { score: round(saScore), weight: W.surfaceArea, ref: round(refSA), cand: round(candSA) },
  },
  referenceMetrics: {
    volume: round(refVol),
    surfaceArea: round(refSA),
    bbox: { size: refSize.map(round), min: refBB.min, max: refBB.max },
  },
  candidateMetrics: {
    volume: round(candVol),
    surfaceArea: round(candSA),
    bbox: { size: candSize.map(round), min: candBB.min, max: candBB.max },
  },
};

// ---- Pretty-print scorecard ----
console.warn("");
console.warn("\\u2554\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2557");
console.warn("\\u2551              SPATIAL SCORING                         \\u2551");
console.warn("\\u255f\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2562");
console.warn("\\u2551  3D IoU:         " + (iouScore*100).toFixed(1).padStart(5) + "%  (weight " + W.iou + ")" + (iouError ? " ERR" : "") + "       \\u2551");
console.warn("\\u2551  Volume match:   " + (volScore*100).toFixed(1).padStart(5) + "%  (weight " + W.volume + ")" + "                \\u2551");
console.warn("\\u2551  BBox match:     " + (bboxScore*100).toFixed(1).padStart(5) + "%  (weight " + W.bbox + ")" + "                \\u2551");
console.warn("\\u2551  Surface area:   " + (saScore*100).toFixed(1).padStart(5) + "%  (weight " + W.surfaceArea + ")" + "                \\u2551");
console.warn("\\u255f\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2500\\u2562");
console.warn("\\u2551  OVERALL: " + result.overall.toFixed(1) + "%" + "                                        \\u2551");
console.warn("\\u255a\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u2550\\u255d");
console.warn("BENCH_SCORE:" + JSON.stringify(result));

return candidate;
`;

// ---------------------------------------------------------------------------
// Score a solution against a reference
// ---------------------------------------------------------------------------

/**
 * @param {string} challengeDir  Path to the challenge directory (must contain reference.forge.js)
 * @param {string} solutionCode  The candidate ForgeCAD code (string, not file path)
 * @param {object} [options]
 * @param {boolean} [options.verbose]     Print harness output
 * @param {number}  [options.timeout]     Execution timeout in ms (default 60 000)
 * @returns {{ overall: number, breakdown: object, error?: string, output?: string }}
 */
export function scoreSolution(challengeDir, solutionCode, options = {}) {
  const absChallenge = resolve(challengeDir);
  const refFile = join(absChallenge, 'reference.forge.js');
  if (!existsSync(refFile)) {
    return { overall: 0, error: `No reference.forge.js in ${absChallenge}`, breakdown: {} };
  }

  const solutionFile = join(absChallenge, 'solution.forge.js');
  const harnessFile = join(absChallenge, '_bench_harness.forge.js');

  writeFileSync(solutionFile, solutionCode, 'utf8');
  writeFileSync(harnessFile, SCORING_HARNESS, 'utf8');

  try {
    const output = execSync(
      `node "${FORGECAD_CLI}" run "${harnessFile}" 2>&1`,
      { encoding: 'utf8', timeout: options.timeout || 60_000, cwd: PROJECT_ROOT },
    );

    if (options.verbose) process.stderr.write(output);

    const match = output.match(/BENCH_SCORE:(.+)/);
    if (!match) return { overall: 0, error: 'No BENCH_SCORE in harness output', output };

    const result = JSON.parse(match[1]);
    result.output = output;
    return result;
  } catch (e) {
    const output = (e.stdout || '') + (e.stderr || '') + (e.message || '');
    return { overall: 0, error: `Harness crashed: ${e.message}`, output, breakdown: {} };
  } finally {
    try { unlinkSync(solutionFile); } catch {}
    try { unlinkSync(harnessFile); } catch {}
  }
}

/**
 * Score from a file path instead of inline code.
 */
export function scoreSolutionFile(challengeDir, solutionPath, options = {}) {
  const code = readFileSync(resolve(solutionPath), 'utf8');
  return scoreSolution(challengeDir, code, options);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 2) {
    console.error('Usage: node bench/score.mjs <challenge-dir> <solution.forge.js> [--verbose]');
    process.exit(1);
  }

  const [challengeDir, solutionPath] = positional;
  const result = scoreSolutionFile(challengeDir, solutionPath, { verbose });

  // Pretty summary
  if (result.error) {
    console.error(`\nError: ${result.error}\n`);
  }
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.overall > 0 ? 0 : 1);
}

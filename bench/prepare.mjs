#!/usr/bin/env node
/**
 * ForgeCAD Benchmark — Challenge Preparation
 *
 * Takes a reference .forge.js model and prepares a benchmark challenge:
 *   1. Validates the reference model executes correctly
 *   2. Renders multi-angle reference images (front, right, top, iso)
 *   3. Computes and stores reference metrics (volume, bbox, surface area)
 *
 * Usage:
 *   node bench/prepare.mjs <reference.forge.js> <challenge-name>
 *   node bench/prepare.mjs examples/cup.forge.js cup
 *
 * Output structure:
 *   bench/challenges/<name>/
 *     reference.forge.js
 *     config.json
 *     prepared/
 *       metrics.json
 *       views/
 *         reference_front.png
 *         reference_right.png
 *         reference_top.png
 *         reference_iso.png
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, copyFileSync, unlinkSync } from 'fs';
import { execSync } from 'child_process';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const FORGECAD_CLI = join(PROJECT_ROOT, 'dist-cli', 'forgecad.js');
const CHALLENGES_DIR = join(__dirname, 'challenges');

// ---------------------------------------------------------------------------
// Metrics extraction harness — runs reference model and outputs JSON metrics
// ---------------------------------------------------------------------------

const METRICS_HARNESS = `
// Auto-generated metrics extraction harness
const shape = require("./reference.forge.js");
const vol = shape.volume();
const sa  = shape.surfaceArea();
const bb  = shape.boundingBox();
const size = [bb.max[0]-bb.min[0], bb.max[1]-bb.min[1], bb.max[2]-bb.min[2]];
const metrics = {
  volume: Math.round(vol * 100) / 100,
  surfaceArea: Math.round(sa * 100) / 100,
  boundingBox: {
    min: bb.min.map(v => Math.round(v * 100) / 100),
    max: bb.max.map(v => Math.round(v * 100) / 100),
    size: size.map(v => Math.round(v * 100) / 100),
  },
  isEmpty: shape.isEmpty(),
};
console.warn("BENCH_METRICS:" + JSON.stringify(metrics));
return shape;
`;

// ---------------------------------------------------------------------------
// Prepare a challenge
// ---------------------------------------------------------------------------

/**
 * @param {string} referenceModelPath  Path to the reference .forge.js file
 * @param {string} challengeName       Name for the challenge directory
 * @param {object} [options]
 * @param {number}  [options.imageSize]  Render size in px (default 512)
 * @param {string}  [options.difficulty] Difficulty label
 * @param {string}  [options.description] Challenge description
 */
export function prepareChallenge(referenceModelPath, challengeName, options = {}) {
  const absRef = resolve(referenceModelPath);
  if (!existsSync(absRef)) {
    throw new Error(`Reference model not found: ${absRef}`);
  }

  const challengeDir = join(CHALLENGES_DIR, challengeName);
  const preparedDir = join(challengeDir, 'prepared');
  const viewsDir = join(preparedDir, 'views');

  // Create directories
  mkdirSync(viewsDir, { recursive: true });

  // Copy reference model
  const refDest = join(challengeDir, 'reference.forge.js');
  copyFileSync(absRef, refDest);
  console.log(`  Copied reference model → ${refDest}`);

  // --- Step 1: Extract metrics ---
  console.log('  Extracting reference metrics...');
  const harnessFile = join(challengeDir, '_metrics_harness.forge.js');
  writeFileSync(harnessFile, METRICS_HARNESS, 'utf8');

  let metrics;
  try {
    const output = execSync(
      `node "${FORGECAD_CLI}" run "${harnessFile}" 2>&1`,
      { encoding: 'utf8', timeout: 60_000, cwd: PROJECT_ROOT },
    );
    const match = output.match(/BENCH_METRICS:(.+)/);
    if (!match) throw new Error('No BENCH_METRICS in output:\n' + output);
    metrics = JSON.parse(match[1]);
  } finally {
    try { unlinkSync(harnessFile); } catch {}
  }

  if (metrics.isEmpty) {
    throw new Error('Reference model produced an empty shape');
  }

  writeFileSync(join(preparedDir, 'metrics.json'), JSON.stringify(metrics, null, 2), 'utf8');
  console.log(`  Metrics: vol=${metrics.volume}mm³  SA=${metrics.surfaceArea}mm²  bbox=${metrics.boundingBox.size.join('×')}mm`);

  // --- Step 2: Render multi-angle images ---
  console.log('  Rendering reference views...');
  const imageSize = options.imageSize || 512;
  const outputBase = join(viewsDir, 'reference.png');

  try {
    execSync(
      `node "${FORGECAD_CLI}" render "${refDest}" "${outputBase}" --angles front,right,top,iso --size ${imageSize} 2>&1`,
      { encoding: 'utf8', timeout: 120_000, cwd: PROJECT_ROOT },
    );
    console.log('  Rendered: front, right, top, iso');
  } catch (e) {
    console.warn(`  Warning: Rendering failed (Puppeteer/Chrome may not be available)`);
    console.warn(`  ${e.message.split('\n')[0]}`);
    console.warn('  You can render manually: forgecad render <reference.forge.js> <output.png> --angles front,right,top,iso');
  }

  // --- Step 3: Write config ---
  const config = {
    name: challengeName,
    description: options.description || `Reproduce the ${challengeName} model from reference images`,
    difficulty: options.difficulty || 'medium',
    referenceModel: 'reference.forge.js',
    preparedAt: new Date().toISOString(),
    metrics,
    imageSize,
    validators: ['iou', 'volume', 'bbox', 'surfaceArea'],
  };
  writeFileSync(join(challengeDir, 'config.json'), JSON.stringify(config, null, 2), 'utf8');

  console.log(`  Challenge prepared → ${challengeDir}`);
  return { challengeDir, config, metrics };
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  const args = process.argv.slice(2);
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 2) {
    console.error('Usage: node bench/prepare.mjs <reference.forge.js> <challenge-name> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --size <px>           Image render size (default 512)');
    console.error('  --difficulty <level>  easy | medium | hard');
    console.error('  --description <text>  Challenge description');
    console.error('');
    console.error('Example:');
    console.error('  node bench/prepare.mjs examples/cup.forge.js cup --difficulty easy');
    process.exit(1);
  }

  const [referenceModel, challengeName] = positional;

  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  console.log(`\nPreparing challenge "${challengeName}" from ${referenceModel}\n`);
  try {
    prepareChallenge(referenceModel, challengeName, {
      imageSize: parseInt(getArg('size')) || undefined,
      difficulty: getArg('difficulty'),
      description: getArg('description'),
    });
    console.log('\nDone.\n');
  } catch (e) {
    console.error(`\nFatal: ${e.message}\n`);
    process.exit(1);
  }
}

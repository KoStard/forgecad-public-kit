#!/usr/bin/env node
/**
 * ForgeCAD Benchmark Runner — Vision-Based Agentic Loop
 *
 * The AI sees multi-angle images of a reference 3D model, writes ForgeCAD code
 * to reproduce it, receives spatial scores and rendered comparison images, and
 * iterates. All iterations are captured for analysis.
 *
 * Usage:
 *   node bench/runner.mjs --challenge bench/challenges/cup --model claude-sonnet-4-20250514 --iterations 5
 *   node bench/runner.mjs --challenge bench/challenges/cup --model openai/gpt-5.4-mini --provider openrouter
 *   node bench/runner.mjs --all --model claude-sonnet-4-20250514 --iterations 3
 *
 * Environment:
 *   ANTHROPIC_API_KEY   — required for Anthropic provider (default)
 *   OPENROUTER_API_KEY  — required for OpenRouter provider
 */

import {
  readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, copyFileSync, unlinkSync,
} from 'fs';
import { execSync } from 'child_process';
import { join, resolve, dirname, basename } from 'path';
import { fileURLToPath } from 'url';
import { scoreSolution } from './score.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');
const FORGECAD_CLI = join(PROJECT_ROOT, 'dist-cli', 'forgecad.js');
const CHALLENGES_DIR = join(__dirname, 'challenges');
const RESULTS_DIR = join(__dirname, 'results');

// ---------------------------------------------------------------------------
// API reference docs for the LLM
// ---------------------------------------------------------------------------

function loadApiReference() {
  for (const p of [
    join(__dirname, 'api-reference.md'),
    join(__dirname, '..', 'examples', 'bench-v2', 'api-reference.md'),
  ]) {
    if (existsSync(p)) return readFileSync(p, 'utf8');
  }
  return '';
}
const API_REFERENCE = loadApiReference();

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

function loadImageBase64(path) {
  if (!existsSync(path)) return null;
  return readFileSync(path).toString('base64');
}

function imageContent(base64, label) {
  return [
    { type: 'text', text: label },
    {
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${base64}` },
    },
  ];
}

/** Load all reference view images from a challenge's prepared/views/ directory */
function loadReferenceImages(challengeDir) {
  const viewsDir = join(challengeDir, 'prepared', 'views');
  if (!existsSync(viewsDir)) return [];

  const images = [];
  for (const angle of ['front', 'right', 'top', 'iso']) {
    const path = join(viewsDir, `reference_${angle}.png`);
    const b64 = loadImageBase64(path);
    if (b64) images.push({ angle, base64: b64 });
  }
  return images;
}

/** Render candidate images and return base64 data */
function renderCandidate(challengeDir, solutionCode, outputDir, imageSize = 512) {
  const solutionFile = join(challengeDir, '_bench_candidate.forge.js');
  writeFileSync(solutionFile, solutionCode, 'utf8');

  const outputBase = join(outputDir, 'candidate.png');
  try {
    execSync(
      `node "${FORGECAD_CLI}" render "${solutionFile}" "${outputBase}" --angles front,right,top,iso --size ${imageSize} 2>&1`,
      { encoding: 'utf8', timeout: 120_000, cwd: PROJECT_ROOT },
    );
  } catch (e) {
    console.warn(`  Warning: Candidate rendering failed: ${e.message.split('\n')[0]}`);
    return [];
  } finally {
    try { unlinkSync(solutionFile); } catch {}
  }

  const images = [];
  for (const angle of ['front', 'right', 'top', 'iso']) {
    const path = join(outputDir, `candidate_${angle}.png`);
    const b64 = loadImageBase64(path);
    if (b64) images.push({ angle, base64: b64 });
  }
  return images;
}

// ---------------------------------------------------------------------------
// LLM API clients
// ---------------------------------------------------------------------------

/**
 * Call the Anthropic Messages API.
 * @param {string} model  e.g. "claude-sonnet-4-20250514"
 * @param {Array}  messages  Anthropic message format
 * @param {string} system  System prompt
 * @returns {Promise<{text: string, usage: object}>}
 */
async function callAnthropic(model, messages, system) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

  const body = {
    model,
    max_tokens: 8192,
    system,
    messages: messages.map(m => ({
      role: m.role,
      content: Array.isArray(m.content) ? m.content.map(c => {
        if (c.type === 'image_url') {
          // Convert OpenAI-style image to Anthropic format
          const match = c.image_url.url.match(/^data:(.+?);base64,(.+)$/);
          if (match) {
            return {
              type: 'image',
              source: { type: 'base64', media_type: match[1], data: match[2] },
            };
          }
        }
        return c;
      }) : m.content,
    })),
  };

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Anthropic API ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const text = data.content?.map(b => b.text || '').join('') || '';
  return { text, usage: data.usage };
}

/**
 * Call OpenRouter API (supports any model).
 */
async function callOpenRouter(model, messages, system) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error('OPENROUTER_API_KEY not set');

  const body = {
    model,
    messages: [
      { role: 'system', content: system },
      ...messages,
    ],
    temperature: 0.3,
    max_tokens: 8192,
  };

  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OpenRouter API ${resp.status}: ${text}`);
  }

  const data = await resp.json();
  const text = data.choices?.[0]?.message?.content || '';
  return { text, usage: data.usage };
}

// ---------------------------------------------------------------------------
// Code extraction
// ---------------------------------------------------------------------------

function extractCode(llmResponse) {
  // Try fenced code block first
  const fenceMatch = llmResponse.match(/```(?:javascript|js)?\s*\n([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find return statement — the code is likely the whole response
  const stripped = llmResponse
    .replace(/^```(?:javascript|js)?\s*\n?/gm, '')
    .replace(/\n?```\s*$/gm, '')
    .trim();

  if (stripped.includes('return ')) return stripped;

  return llmResponse.trim();
}

// ---------------------------------------------------------------------------
// Prompt construction
// ---------------------------------------------------------------------------

function buildSystemPrompt(apiReference) {
  return `You are a CAD engineer writing ForgeCAD scripts. You are given reference images of a 3D model from multiple angles (front, right, top, isometric) and must write ForgeCAD JavaScript code that reproduces the geometry as accurately as possible.

${apiReference}

IMPORTANT RULES:
- Return ONLY the JavaScript code inside a single \`\`\`javascript code fence
- The script must end with a \`return\` statement returning the final Shape
- All API functions are global (no imports needed)
- Coordinate system: Z-up, millimeters, degrees
- Study the reference images carefully — match dimensions, proportions, and orientation
- Pay attention to holes, cutouts, fillets, and other features visible in the images`;
}

function buildInitialUserContent(referenceImages, config) {
  const content = [];

  content.push({
    type: 'text',
    text: `# Task: Reproduce this 3D model in ForgeCAD

Study the reference images below carefully. They show a "${config.name}" model from four angles: front, right, top, and isometric.

Write ForgeCAD code that reproduces this geometry as accurately as possible. Pay close attention to:
- Overall shape and proportions
- Holes, cutouts, and internal features
- Orientation (Z is up)
- Approximate dimensions (estimate from proportions in the images)`,
  });

  for (const img of referenceImages) {
    content.push({ type: 'text', text: `Reference — ${img.angle} view:` });
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/png;base64,${img.base64}` },
    });
  }

  // Include metrics hint if available
  if (config.metrics) {
    const m = config.metrics;
    content.push({
      type: 'text',
      text: `\nDimension hints:\n- Bounding box: ${m.boundingBox.size[0].toFixed(1)} × ${m.boundingBox.size[1].toFixed(1)} × ${m.boundingBox.size[2].toFixed(1)} mm\n- Volume: ${m.volume.toFixed(1)} mm³\n- Surface area: ${m.surfaceArea.toFixed(1)} mm²`,
    });
  }

  return content;
}

function buildIterationUserContent(score, candidateImages, referenceImages, iterationNum, maxIterations) {
  const content = [];

  content.push({
    type: 'text',
    text: `# Iteration ${iterationNum} Feedback

Your previous attempt scored **${score.overall.toFixed(1)}%** overall.

Score breakdown:
- 3D IoU: ${((score.breakdown?.iou?.score || 0) * 100).toFixed(1)}% (volumetric overlap between your model and reference)
- Volume: ${((score.breakdown?.volume?.score || 0) * 100).toFixed(1)}% (ref=${score.breakdown?.volume?.ref || '?'} mm³, yours=${score.breakdown?.volume?.cand || '?'} mm³)
- Bounding box: ${((score.breakdown?.bbox?.score || 0) * 100).toFixed(1)}% (ref=${JSON.stringify(score.breakdown?.bbox?.ref)}, yours=${JSON.stringify(score.breakdown?.bbox?.cand)})
- Surface area: ${((score.breakdown?.surfaceArea?.score || 0) * 100).toFixed(1)}% (ref=${score.breakdown?.surfaceArea?.ref || '?'} mm², yours=${score.breakdown?.surfaceArea?.cand || '?'} mm²)
${score.error ? `\nError: ${score.error}\n` : ''}
You have ${maxIterations - iterationNum} iteration(s) remaining. Compare your rendered output below against the reference images and improve your code.`,
  });

  // Show candidate renders side-by-side with reference
  for (const angle of ['front', 'right', 'top', 'iso']) {
    const candImg = candidateImages.find(i => i.angle === angle);
    const refImg = referenceImages.find(i => i.angle === angle);

    if (refImg) {
      content.push({ type: 'text', text: `Reference — ${angle}:` });
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${refImg.base64}` },
      });
    }
    if (candImg) {
      content.push({ type: 'text', text: `Your output — ${angle}:` });
      content.push({
        type: 'image_url',
        image_url: { url: `data:image/png;base64,${candImg.base64}` },
      });
    }
  }

  content.push({
    type: 'text',
    text: 'Write the improved ForgeCAD code. Return ONLY the code in a ```javascript fence.',
  });

  return content;
}

// ---------------------------------------------------------------------------
// Main benchmark loop
// ---------------------------------------------------------------------------

/**
 * Run the benchmark for a single challenge.
 *
 * @param {string} challengeDir
 * @param {object} options
 * @param {string}  options.model       LLM model ID
 * @param {string}  [options.provider]  'anthropic' | 'openrouter' (default: 'anthropic')
 * @param {number}  [options.iterations] Max iterations (default 5)
 * @param {boolean} [options.verbose]
 * @param {number}  [options.imageSize]  Render size (default 512)
 * @returns {Promise<object>} Run results
 */
export async function runBenchmark(challengeDir, options) {
  const {
    model,
    provider = 'anthropic',
    iterations: maxIterations = 5,
    verbose = false,
    imageSize = 512,
  } = options;

  const absChallenge = resolve(challengeDir);
  const configPath = join(absChallenge, 'config.json');
  if (!existsSync(configPath)) {
    throw new Error(`No config.json in ${absChallenge}. Run bench/prepare.mjs first.`);
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const challengeName = config.name || basename(absChallenge);

  // Load reference images
  const referenceImages = loadReferenceImages(absChallenge);
  if (referenceImages.length === 0) {
    throw new Error(`No reference images found in ${absChallenge}/prepared/views/. Run bench/prepare.mjs first.`);
  }

  // Load metrics if available
  const metricsPath = join(absChallenge, 'prepared', 'metrics.json');
  if (existsSync(metricsPath)) {
    config.metrics = JSON.parse(readFileSync(metricsPath, 'utf8'));
  }

  // Create results directory
  const runId = `${challengeName}-${model.replace(/[/:.]/g, '_')}-${Date.now()}`;
  const runDir = join(RESULTS_DIR, runId);
  mkdirSync(runDir, { recursive: true });

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  ForgeCAD Benchmark — ${challengeName}`);
  console.log(`  Model: ${model} (${provider})`);
  console.log(`  Max iterations: ${maxIterations}`);
  console.log(`${'═'.repeat(60)}\n`);

  const llmCall = provider === 'openrouter' ? callOpenRouter : callAnthropic;
  const systemPrompt = buildSystemPrompt(API_REFERENCE);
  const apiReference = API_REFERENCE;

  const messages = [];       // Conversation history
  const iterationResults = []; // All iteration data
  let bestScore = null;
  let bestCode = null;

  for (let i = 0; i < maxIterations; i++) {
    const iterDir = join(runDir, 'iterations', String(i));
    mkdirSync(join(iterDir, 'views'), { recursive: true });

    console.log(`── Iteration ${i} ──`);

    // Build prompt
    let userContent;
    if (i === 0) {
      userContent = buildInitialUserContent(referenceImages, config);
    } else {
      const prevResult = iterationResults[i - 1];
      userContent = buildIterationUserContent(
        prevResult.score, prevResult.candidateImages, referenceImages, i, maxIterations,
      );
    }

    messages.push({ role: 'user', content: userContent });

    // Call LLM
    console.log(`  Calling ${model}...`);
    const startTime = Date.now();
    let llmResult;
    try {
      llmResult = await llmCall(model, messages, systemPrompt);
    } catch (e) {
      console.error(`  LLM error: ${e.message}`);
      iterationResults.push({ iteration: i, error: `LLM error: ${e.message}`, score: { overall: 0 } });
      break;
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Extract code
    const code = extractCode(llmResult.text);
    writeFileSync(join(iterDir, 'code.forge.js'), code, 'utf8');
    writeFileSync(join(iterDir, 'llm-response.txt'), llmResult.text, 'utf8');
    writeFileSync(join(iterDir, 'llm-usage.json'), JSON.stringify(llmResult.usage, null, 2), 'utf8');

    // Add assistant response to conversation
    messages.push({ role: 'assistant', content: llmResult.text });

    // Score the solution
    console.log(`  Scoring... (LLM took ${elapsed}s)`);
    const score = scoreSolution(absChallenge, code, { verbose });
    writeFileSync(join(iterDir, 'score.json'), JSON.stringify(score, null, 2), 'utf8');

    // Render candidate images
    const candidateImages = renderCandidate(absChallenge, code, join(iterDir, 'views'), imageSize);

    const iterData = {
      iteration: i,
      score,
      codeLength: code.length,
      llmTime: parseFloat(elapsed),
      usage: llmResult.usage,
      candidateImages,
    };
    iterationResults.push(iterData);

    // Print score
    if (score.error) {
      console.log(`  Error: ${score.error}`);
    }
    console.log(`  Score: ${score.overall.toFixed(1)}%`);
    if (score.breakdown) {
      const b = score.breakdown;
      console.log(`    IoU=${((b.iou?.score || 0) * 100).toFixed(0)}%  Vol=${((b.volume?.score || 0) * 100).toFixed(0)}%  BBox=${((b.bbox?.score || 0) * 100).toFixed(0)}%  SA=${((b.surfaceArea?.score || 0) * 100).toFixed(0)}%`);
    }

    // Track best
    if (!bestScore || score.overall > bestScore.overall) {
      bestScore = score;
      bestCode = code;
    }

    // Early termination if perfect score
    if (score.overall >= 95) {
      console.log(`  Score ≥ 95% — stopping early.`);
      break;
    }
  }

  // Save best solution
  if (bestCode) {
    writeFileSync(join(runDir, 'best-solution.forge.js'), bestCode, 'utf8');
  }

  // Save run summary
  const summary = {
    challenge: challengeName,
    model,
    provider,
    maxIterations,
    completedIterations: iterationResults.length,
    bestScore: bestScore?.overall || 0,
    finalScore: iterationResults[iterationResults.length - 1]?.score?.overall || 0,
    scoreProgression: iterationResults.map(r => r.score?.overall || 0),
    totalLlmTime: iterationResults.reduce((s, r) => s + (r.llmTime || 0), 0),
    timestamp: new Date().toISOString(),
    iterationSummaries: iterationResults.map(r => ({
      iteration: r.iteration,
      score: r.score?.overall || 0,
      breakdown: r.score?.breakdown,
      error: r.score?.error || r.error,
      codeLength: r.codeLength,
      llmTime: r.llmTime,
    })),
  };
  writeFileSync(join(runDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  // Print final summary
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`  FINAL RESULTS — ${challengeName}`);
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Model:       ${model}`);
  console.log(`  Iterations:  ${iterationResults.length}/${maxIterations}`);
  console.log(`  Best score:  ${(bestScore?.overall || 0).toFixed(1)}%`);
  console.log(`  Progression: ${summary.scoreProgression.map(s => s.toFixed(1) + '%').join(' → ')}`);
  console.log(`  Results:     ${runDir}`);
  console.log(`${'═'.repeat(60)}\n`);

  return summary;
}

// ---------------------------------------------------------------------------
// Discover challenges
// ---------------------------------------------------------------------------

function discoverChallenges() {
  if (!existsSync(CHALLENGES_DIR)) return [];
  return readdirSync(CHALLENGES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => join(CHALLENGES_DIR, d.name))
    .filter(d => existsSync(join(d, 'config.json')) && existsSync(join(d, 'reference.forge.js')));
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMainModule = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMainModule) {
  const args = process.argv.slice(2);

  const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
  };
  const hasFlag = (name) => args.includes(`--${name}`);

  const challengeDir = getArg('challenge');
  const model = getArg('model');
  const provider = getArg('provider') || 'anthropic';
  const iterations = parseInt(getArg('iterations') || '5');
  const runAll = hasFlag('all');
  const verbose = hasFlag('verbose');
  const imageSize = parseInt(getArg('size') || '512');

  if (!model) {
    console.error('Usage: node bench/runner.mjs --challenge <dir> --model <model-id> [options]');
    console.error('       node bench/runner.mjs --all --model <model-id> [options]');
    console.error('');
    console.error('Options:');
    console.error('  --challenge <dir>      Challenge directory');
    console.error('  --model <id>           LLM model ID (e.g. claude-sonnet-4-20250514, openai/gpt-5.4-mini)');
    console.error('  --provider <name>      API provider: anthropic (default) or openrouter');
    console.error('  --iterations <n>       Max iterations (default 5)');
    console.error('  --size <px>            Image render size (default 512)');
    console.error('  --all                  Run all prepared challenges');
    console.error('  --verbose              Show harness output');
    console.error('');
    console.error('Environment:');
    console.error('  ANTHROPIC_API_KEY      Required for --provider anthropic');
    console.error('  OPENROUTER_API_KEY     Required for --provider openrouter');
    process.exit(1);
  }

  const challenges = runAll ? discoverChallenges() : (challengeDir ? [resolve(challengeDir)] : []);
  if (challenges.length === 0) {
    console.error('No challenges found. Specify --challenge <dir> or prepare challenges first.');
    process.exit(1);
  }

  const allSummaries = [];

  for (const challenge of challenges) {
    try {
      const summary = await runBenchmark(challenge, { model, provider, iterations, verbose, imageSize });
      allSummaries.push(summary);
    } catch (e) {
      console.error(`Error on ${basename(challenge)}: ${e.message}`);
      allSummaries.push({ challenge: basename(challenge), error: e.message, bestScore: 0 });
    }
  }

  // Multi-challenge summary
  if (allSummaries.length > 1) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log('  BENCHMARK SUMMARY');
    console.log(`${'─'.repeat(60)}`);
    for (const s of allSummaries) {
      const name = (s.challenge || '?').padEnd(25);
      const score = s.error ? `ERROR: ${s.error}` : `${s.bestScore.toFixed(1)}%`;
      console.log(`  ${name} ${score}`);
    }
    const avg = allSummaries.filter(s => !s.error).reduce((a, s) => a + s.bestScore, 0)
      / Math.max(allSummaries.filter(s => !s.error).length, 1);
    console.log(`${'─'.repeat(60)}`);
    console.log(`  Average best score: ${avg.toFixed(1)}%`);
    console.log(`${'═'.repeat(60)}\n`);
  }
}

#!/usr/bin/env node
/**
 * Mesh quality analyzer — reports smoothness, sharp edges, and connectivity
 * for ForgeCAD models. Useful for tuning SDF pattern parameters.
 *
 * Usage: node scripts/mesh-quality.mjs <model.forge.js>
 */

import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// Bootstrap ForgeCAD runtime
const { initForgeCAD } = await import(path.join(root, 'dist-cli', 'forgecad.js').replace(/\.js$/, '') + '.js').catch(() => {
  // Fallback: use the API directly
  return import(path.join(root, 'src', 'forge', 'index.ts'));
});

// We'll use the CLI's run infrastructure
const { spawn } = await import('child_process');

const modelPath = process.argv[2];
if (!modelPath) {
  console.error('Usage: node scripts/mesh-quality.mjs <model.forge.js>');
  process.exit(1);
}

// Run the model and capture the mesh by exporting to STL
const stlPath = `/tmp/mesh-quality-analysis-${process.pid}.stl`;

console.log(`Analyzing: ${modelPath}\n`);

// Run model and export STL
const result = await new Promise((resolve, reject) => {
  const proc = spawn('node', [
    path.join(root, 'dist-cli', 'forgecad.js'),
    'export', 'stl', modelPath,
    '--output', stlPath,
  ], { cwd: root });
  let stdout = '', stderr = '';
  proc.stdout.on('data', (d) => stdout += d);
  proc.stderr.on('data', (d) => stderr += d);
  proc.on('close', (code) => resolve({ code, stdout, stderr }));
});

if (result.code !== 0) {
  console.error('Model failed to build:', result.stderr || result.stdout);
  process.exit(1);
}

// Parse binary STL to extract mesh data
const fs = await import('fs');
const stlBuffer = fs.readFileSync(stlPath);
const view = new DataView(stlBuffer.buffer, stlBuffer.byteOffset, stlBuffer.byteLength);

// Binary STL: 80-byte header, 4-byte tri count, then 50 bytes per triangle
const numTri = view.getUint32(80, true);
console.log(`Triangles: ${numTri}`);

// Extract all face normals and vertex positions
const faceNormals = new Float32Array(numTri * 3);
const vertices = new Float32Array(numTri * 9); // 3 verts * 3 coords

for (let i = 0; i < numTri; i++) {
  const offset = 84 + i * 50;
  // Normal
  faceNormals[i * 3] = view.getFloat32(offset, true);
  faceNormals[i * 3 + 1] = view.getFloat32(offset + 4, true);
  faceNormals[i * 3 + 2] = view.getFloat32(offset + 8, true);
  // Vertices
  for (let v = 0; v < 3; v++) {
    const vo = offset + 12 + v * 12;
    vertices[i * 9 + v * 3] = view.getFloat32(vo, true);
    vertices[i * 9 + v * 3 + 1] = view.getFloat32(vo + 4, true);
    vertices[i * 9 + v * 3 + 2] = view.getFloat32(vo + 8, true);
  }
}

// Build edge adjacency map to compute dihedral angles
// Key: sorted vertex pair string → [triIndex1, triIndex2, ...]
const SNAP = 1e-4;
function snapKey(x, y, z) {
  return `${Math.round(x / SNAP)},${Math.round(y / SNAP)},${Math.round(z / SNAP)}`;
}

function vertKey(triIdx, vertIdx) {
  const base = triIdx * 9 + vertIdx * 3;
  return snapKey(vertices[base], vertices[base + 1], vertices[base + 2]);
}

function edgeKey(k1, k2) {
  return k1 < k2 ? `${k1}|${k2}` : `${k2}|${k1}`;
}

const edgeToTris = new Map();

for (let t = 0; t < numTri; t++) {
  const vk = [vertKey(t, 0), vertKey(t, 1), vertKey(t, 2)];
  for (let e = 0; e < 3; e++) {
    const ek = edgeKey(vk[e], vk[(e + 1) % 3]);
    if (!edgeToTris.has(ek)) edgeToTris.set(ek, []);
    edgeToTris.get(ek).push(t);
  }
}

// Compute dihedral angles
const angles = [];
let boundaryEdges = 0;
let nonManifoldEdges = 0;

for (const [, tris] of edgeToTris) {
  if (tris.length === 1) {
    boundaryEdges++;
    continue;
  }
  if (tris.length > 2) {
    nonManifoldEdges++;
    continue;
  }
  const [t1, t2] = tris;
  const n1x = faceNormals[t1 * 3], n1y = faceNormals[t1 * 3 + 1], n1z = faceNormals[t1 * 3 + 2];
  const n2x = faceNormals[t2 * 3], n2y = faceNormals[t2 * 3 + 1], n2z = faceNormals[t2 * 3 + 2];
  const dot = n1x * n2x + n1y * n2y + n1z * n2z;
  const clamped = Math.max(-1, Math.min(1, dot));
  const angleDeg = Math.acos(clamped) * (180 / Math.PI);
  angles.push(angleDeg);
}

// Statistics
angles.sort((a, b) => a - b);
const total = angles.length;
const mean = angles.reduce((s, a) => s + a, 0) / total;
const p50 = angles[Math.floor(total * 0.5)];
const p90 = angles[Math.floor(total * 0.9)];
const p95 = angles[Math.floor(total * 0.95)];
const p99 = angles[Math.floor(total * 0.99)];
const maxAngle = angles[total - 1];

// Count edges in angle buckets
const bucket = (lo, hi) => angles.filter(a => a >= lo && a < hi).length;
const smooth = bucket(0, 5);     // < 5° = smooth
const moderate = bucket(5, 30);   // 5-30° = moderate
const sharp = bucket(30, 90);     // 30-90° = sharp
const harsh = bucket(90, 181);    // > 90° = harsh/knife edge

const smoothPct = (smooth / total * 100).toFixed(1);
const moderatePct = (moderate / total * 100).toFixed(1);
const sharpPct = (sharp / total * 100).toFixed(1);
const harshPct = (harsh / total * 100).toFixed(1);

// Overall quality score (0-100, higher is better)
// Weighted: smooth edges contribute positively, harsh edges penalize
const qualityScore = Math.max(0, Math.min(100, Math.round(
  100 * (smooth + moderate * 0.7) / total - harsh * 50 / total
)));

console.log(`\n${'='.repeat(50)}`);
console.log(`  MESH QUALITY REPORT`);
console.log(`${'='.repeat(50)}`);

console.log(`\nEdge Statistics:`);
console.log(`  Total edges analyzed: ${total}`);
console.log(`  Boundary edges:      ${boundaryEdges}${boundaryEdges > 0 ? ' ⚠️' : ''}`);
console.log(`  Non-manifold edges:  ${nonManifoldEdges}${nonManifoldEdges > 0 ? ' ⚠️' : ''}`);

console.log(`\nDihedral Angle Distribution:`);
console.log(`  Smooth   (< 5°):   ${smooth.toLocaleString().padStart(6)} edges (${smoothPct}%)`);
console.log(`  Moderate (5-30°):  ${moderate.toLocaleString().padStart(6)} edges (${moderatePct}%)`);
console.log(`  Sharp    (30-90°): ${sharp.toLocaleString().padStart(6)} edges (${sharpPct}%)`);
console.log(`  Harsh    (> 90°):  ${harsh.toLocaleString().padStart(6)} edges (${harshPct}%)`);

console.log(`\nPercentiles:`);
console.log(`  Median (P50):  ${p50.toFixed(1)}°`);
console.log(`  P90:           ${p90.toFixed(1)}��`);
console.log(`  P95:           ${p95.toFixed(1)}°`);
console.log(`  P99:           ${p99.toFixed(1)}°`);
console.log(`  Max:           ${maxAngle.toFixed(1)}°`);
console.log(`  Mean:          ${mean.toFixed(1)}°`);

// Verdict
console.log(`\n${'─'.repeat(50)}`);
if (qualityScore >= 80) {
  console.log(`  Quality: ${qualityScore}/100 — SMOOTH ✅`);
  console.log(`  Your model is mostly smooth with gentle transitions.`);
} else if (qualityScore >= 50) {
  console.log(`  Quality: ${qualityScore}/100 — MODERATE ⚠️`);
  console.log(`  Your model has some sharp features but is generally OK.`);
} else if (qualityScore >= 20) {
  console.log(`  Quality: ${qualityScore}/100 — ROUGH ⚠️`);
  console.log(`  Your model has lots of harsh corners. Consider:`);
  console.log(`  - Using smoothIntersect/smoothUnion instead of sharp booleans`);
  console.log(`  - Reducing edgeLength for finer mesh resolution`);
  console.log(`  - Adding smooth-min to pattern junctions`);
} else {
  console.log(`  Quality: ${qualityScore}/100 — VERY ROUGH ��`);
  console.log(`  Your model has many knife edges and harsh transitions.`);
  console.log(`  This will likely cause 3D printing issues.`);
}
console.log(`${'─'.repeat(50)}\n`);

// Clean up
fs.unlinkSync(stlPath);

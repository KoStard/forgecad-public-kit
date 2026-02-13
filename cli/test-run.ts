#!/usr/bin/env node
/**
 * ForgeCAD CLI — Validate a .forge.js script (no browser needed)
 * Usage: npx tsx cli/test-run.ts <script.forge.js>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { init, runScript } from "../src/forge/headless";
import { collectProjectFiles } from "./collect-files";
import type { Shape } from "../src/forge/kernel";

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error("Usage: npx tsx cli/test-run.ts <script.forge.js>");
  process.exit(1);
}

type ShapeEntry = { name: string; shape: Shape; min: number[]; max: number[] };

function bboxOverlap(a: ShapeEntry, b: ShapeEntry): boolean {
  return [0, 1, 2].every(k => a.min[k] < b.max[k] + 0.1 && a.max[k] > b.min[k] - 0.1);
}

function analyzeSpatial(entries: ShapeEntry[]): string[] {
  const lines: string[] = [];
  const axisLabel = ['X', 'Y', 'Z'];
  const dirLabels: Record<number, [string, string]> = {
    0: ['LEFT of', 'RIGHT of'],
    1: ['IN FRONT of', 'BEHIND'],
    2: ['BELOW', 'ABOVE'],
  };

  // Scene scale for proximity threshold
  const allMin = [Infinity, Infinity, Infinity];
  const allMax = [-Infinity, -Infinity, -Infinity];
  for (const s of entries) {
    for (let ax = 0; ax < 3; ax++) {
      allMin[ax] = Math.min(allMin[ax], s.min[ax]);
      allMax[ax] = Math.max(allMax[ax], s.max[ax]);
    }
  }
  const sceneSize = Math.max(...allMax.map((v, i) => v - allMin[i]));
  const proximityThreshold = sceneSize * 0.15;

  // 1. Check collisions: bbox overlap → real intersection check
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (!bboxOverlap(a, b)) continue;
      try {
        const hit = a.shape.intersect(b.shape);
        if (!hit.isEmpty()) {
          const vol = hit.volume();
          if (vol > 0.1) {
            lines.push(`  ⚠ COLLISION: ${a.name} ∩ ${b.name} (shared vol: ${vol.toFixed(1)}mm³)`);
          }
        }
      } catch {
        // intersection can fail on degenerate geometry — skip
      }
    }
  }

  // 2. Nearest-neighbor directional relationships (within proximity)
  for (let i = 0; i < entries.length; i++) {
    const a = entries[i];
    const nearest: { idx: number; gap: number }[] = Array.from({ length: 6 }, () => ({ idx: -1, gap: Infinity }));

    for (let j = 0; j < entries.length; j++) {
      if (i === j) continue;
      const b = entries[j];
      for (let ax = 0; ax < 3; ax++) {
        if (a.max[ax] < b.min[ax]) {
          const gap = b.min[ax] - a.max[ax];
          const d = ax * 2;
          if (gap < nearest[d].gap) nearest[d] = { idx: j, gap };
        } else if (b.max[ax] < a.min[ax]) {
          const gap = a.min[ax] - b.max[ax];
          const d = ax * 2 + 1;
          if (gap < nearest[d].gap) nearest[d] = { idx: j, gap };
        }
      }
    }

    for (let d = 0; d < 6; d++) {
      const n = nearest[d];
      if (n.idx === -1 || n.gap > proximityThreshold) continue;
      const b = entries[n.idx];
      const ax = Math.floor(d / 2);
      const isPositive = d % 2 === 0;
      const label = isPositive ? dirLabels[ax][0] : dirLabels[ax][1];
      lines.push(`  ${a.name} is ${label} ${b.name} (gap: ${n.gap.toFixed(0)}mm)`);
    }
  }

  // Deduplicate symmetric directional pairs
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const line of lines) {
    if (line.includes('COLLISION')) {
      deduped.push(line);
      continue;
    }
    const match = line.match(/^\s+(.+?) is (?:LEFT of|RIGHT of|IN FRONT of|BEHIND|BELOW|ABOVE) (.+?) \(gap: (\d+)mm\)/);
    if (match) {
      const key = [match[1], match[2]].sort().join('|') + '|' + match[3];
      if (!seen.has(key)) { seen.add(key); deduped.push(line); }
    } else {
      deduped.push(line);
    }
  }
  return deduped;
}

async function main() {
  const code = readFileSync(resolve(scriptPath), "utf-8");
  const { allFiles, fileName } = collectProjectFiles(scriptPath);

  await init();
  const result = runScript(code, fileName, allFiles);

  if (result.error) {
    console.error("ERROR:", result.error);
    if (result.logs?.length) {
      for (const log of result.logs) {
        console.error(`  [${log.level}]`, ...log.args);
      }
    }
    process.exit(1);
  }

  console.log(`✓ Objects: ${result.objects.length}`);
  for (const obj of result.objects) {
    if (obj.shape) {
      const bb = obj.shape.boundingBox();
      console.log(
        `  ${obj.name}: vol=${obj.shape.volume().toFixed(1)}mm³  bbox=[${bb.min.map((v: number) => v.toFixed(1))}] → [${bb.max.map((v: number) => v.toFixed(1))}]`
      );
    }
    if (obj.sketch) {
      console.log(`  ${obj.name}: area=${obj.sketch.area().toFixed(1)}mm²`);
    }
  }

  // Spatial analysis
  const entries: ShapeEntry[] = result.objects
    .filter((o: any) => o.shape)
    .map((o: any) => {
      const bb = o.shape.boundingBox();
      return { name: o.name, shape: o.shape, min: bb.min as number[], max: bb.max as number[] };
    });

  if (entries.length > 1) {
    console.log(`\n✓ Spatial analysis:`);
    const spatialLines = analyzeSpatial(entries);
    for (const line of spatialLines) console.log(line);
    if (spatialLines.length === 0) {
      console.log(`  (no collisions, all objects well-separated)`);
    }
  }

  console.log(`✓ Params: ${result.params.map((p) => p.name).join(", ")}`);
  console.log(`✓ Time: ${result.timeMs.toFixed(0)}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * ForgeCAD CLI — Validate a .forge.js script (no browser needed)
 * Usage: npx tsx cli/test-run.ts <script.forge.js>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { init, runScript } from "../src/forge/headless";
import { collectProjectFiles } from "./collect-files";

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error("Usage: npx tsx cli/test-run.ts <script.forge.js>");
  process.exit(1);
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

  // Spatial relationship analysis
  const shapes3d = result.objects
    .filter((o: any) => o.shape)
    .map((o: any) => {
      const bb = o.shape.boundingBox();
      return { name: o.name, min: bb.min as number[], max: bb.max as number[] };
    });

  if (shapes3d.length > 1) {
    console.log(`\n✓ Spatial relationships:`);
    const axisLabel = ['X', 'Y', 'Z'];
    const dirLabels: Record<number, [string, string]> = {
      0: ['LEFT of', 'RIGHT of'],
      1: ['IN FRONT of', 'BEHIND'],
      2: ['BELOW', 'ABOVE'],
    };

    for (let i = 0; i < shapes3d.length; i++) {
      for (let j = i + 1; j < shapes3d.length; j++) {
        const a = shapes3d[i], b = shapes3d[j];
        for (let ax = 0; ax < 3; ax++) {
          // Check if a is entirely before b on this axis
          if (a.max[ax] < b.min[ax]) {
            console.log(`  ${a.name} is ${dirLabels[ax][0]} ${b.name} (${axisLabel[ax]}: ${a.min[ax].toFixed(0)}..${a.max[ax].toFixed(0)} vs ${b.min[ax].toFixed(0)}..${b.max[ax].toFixed(0)})`);
          } else if (b.max[ax] < a.min[ax]) {
            console.log(`  ${a.name} is ${dirLabels[ax][1]} ${b.name} (${axisLabel[ax]}: ${a.min[ax].toFixed(0)}..${a.max[ax].toFixed(0)} vs ${b.min[ax].toFixed(0)}..${b.max[ax].toFixed(0)})`);
          }
          // Check if one is entirely inside the other (potential "inside" issue)
          else {
            // Check if a is inside b
            const aInB = [0, 1, 2].every(
              k => a.min[k] >= b.min[k] - 0.1 && a.max[k] <= b.max[k] + 0.1
            );
            // Check if b is inside a
            const bInA = [0, 1, 2].every(
              k => b.min[k] >= a.min[k] - 0.1 && b.max[k] <= a.max[k] + 0.1
            );
            if (aInB) {
              console.log(`  ⚠ ${a.name} is INSIDE ${b.name} (may be unintentional)`);
              break;
            }
            if (bInA) {
              console.log(`  ⚠ ${b.name} is INSIDE ${a.name} (may be unintentional)`);
              break;
            }
          }
        }
      }
    }
  }
  console.log(`✓ Params: ${result.params.map((p) => p.name).join(", ")}`);
  console.log(`✓ Time: ${result.timeMs.toFixed(0)}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * ForgeCAD CLI — Validate a .forge.js script (no browser needed)
 * Usage: npx tsx cli/test-run.ts <script.forge.js>
 */
import { readFileSync, readdirSync } from "fs";
import { resolve, basename, dirname, join } from "path";
import { init, runScript } from "../src/forge/headless";

const scriptPath = process.argv[2];
if (!scriptPath) {
  console.error("Usage: npx tsx cli/test-run.ts <script.forge.js>");
  process.exit(1);
}

async function main() {
  const code = readFileSync(resolve(scriptPath), "utf-8");
  const scriptDir = dirname(resolve(scriptPath));
  const allFiles: Record<string, string> = {};
  for (const f of readdirSync(scriptDir)) {
    if (f.endsWith(".forge.js") || f.endsWith(".sketch.js")) {
      allFiles[f] = readFileSync(join(scriptDir, f), "utf-8");
    }
  }

  await init();
  const result = runScript(code, basename(scriptPath), allFiles);

  if (result.error) {
    console.error("ERROR:", result.error);
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
  console.log(`✓ Params: ${result.params.map((p) => p.name).join(", ")}`);
  console.log(`✓ Time: ${result.timeMs.toFixed(0)}ms`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

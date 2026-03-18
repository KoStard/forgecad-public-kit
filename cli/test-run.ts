#!/usr/bin/env node
/**
 * ForgeCAD CLI — Validate a .forge.js or .forge-notebook.json input (no browser needed)
 * Usage: npx tsx cli/test-run.ts [--debug-imports] <script.forge.js|notebook.forge-notebook.json>
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import { init, runScript } from "../src/forge/headless";
import { collectProjectFiles } from "./collect-files";
import { materializeNotebookPreviewScript } from "./notebook-entry";
import type { Shape } from "../src/forge/kernel";

type ShapeEntry = { name: string; shape: Shape; min: number[]; max: number[]; groupName?: string };

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
  // Skip intra-group collisions (objects in the same assembly group are intentionally overlapping)
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i], b = entries[j];
      if (a.groupName && a.groupName === b.groupName) continue; // same group — skip
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

  // 3. Group-level summary (when groups exist)
  const groups = new Map<string, { min: number[]; max: number[] }>();
  for (const e of entries) {
    if (!e.groupName) continue;
    const g = groups.get(e.groupName) || { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
    for (let ax = 0; ax < 3; ax++) {
      g.min[ax] = Math.min(g.min[ax], e.min[ax]);
      g.max[ax] = Math.max(g.max[ax], e.max[ax]);
    }
    groups.set(e.groupName, g);
  }

  if (groups.size > 1) {
    deduped.push('');
    deduped.push('  Groups:');
    const groupNames = [...groups.keys()];
    for (let i = 0; i < groupNames.length; i++) {
      const aName = groupNames[i], a = groups.get(aName)!;
      for (let j = i + 1; j < groupNames.length; j++) {
        const bName = groupNames[j], b = groups.get(bName)!;
        for (let ax = 0; ax < 3; ax++) {
          if (a.max[ax] < b.min[ax]) {
            const gap = b.min[ax] - a.max[ax];
            if (gap <= proximityThreshold) {
              const label = dirLabels[ax][0];
              deduped.push(`  ${aName} is ${label} ${bName} (gap: ${gap.toFixed(0)}mm)`);
            }
          } else if (b.max[ax] < a.min[ax]) {
            const gap = a.min[ax] - b.max[ax];
            if (gap <= proximityThreshold) {
              const label = dirLabels[ax][1];
              deduped.push(`  ${aName} is ${label} ${bName} (gap: ${gap.toFixed(0)}mm)`);
            }
          }
        }
      }
    }
  }

  return deduped;
}

function usage(): never {
  console.error("Usage: forgecad run <script.forge.js|notebook.forge-notebook.json> [--debug-imports]");
  process.exit(1);
}

export async function runScriptCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const debugImports = argv.includes('--debug-imports');
  const positional = argv.filter((arg) => arg !== '--debug-imports');
  const scriptPath = positional[0];
  if (!scriptPath) usage();

  const materialized = materializeNotebookPreviewScript(scriptPath);

  try {
    const code = readFileSync(resolve(materialized.runnablePath), "utf-8");
    const { allFiles, fileName } = collectProjectFiles(materialized.runnablePath);

    await init();
    const result = runScript(code, fileName, allFiles, { debugImports });

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
      const grpTag = obj.groupName ? ` [${obj.groupName}]` : '';
      const geomTag = obj.geometryInfo
        ? `  geom=${obj.geometryInfo.backend}/${obj.geometryInfo.representation}/${obj.geometryInfo.fidelity}/topology:${obj.geometryInfo.topology}/sources:${obj.geometryInfo.sources.join('+')}`
        : '';
      if (obj.shape) {
        const bb = obj.shape.boundingBox();
        console.log(
          `  ${obj.name}${grpTag}: vol=${obj.shape.volume().toFixed(1)}mm³  bbox=[${bb.min.map((v: number) => v.toFixed(1))}] → [${bb.max.map((v: number) => v.toFixed(1))}]${geomTag}`
        );
      }
      if (obj.sketch) {
        console.log(`  ${obj.name}${grpTag}: area=${obj.sketch.area().toFixed(1)}mm²`);
      }
      const meta = obj.sketchMeta;
      if (meta) {
        const statusLabel = meta.status === 'over-redundant' ? 'OVER-REDUNDANT'
          : meta.status.toUpperCase();
        const statusColor = meta.status === 'fully' ? '\x1b[32m'
          : meta.status === 'over' ? '\x1b[31m'
          : meta.status === 'over-redundant' ? '\x1b[33m'
          : '\x1b[34m';
        console.log(`  ${obj.name}${grpTag}: ${statusColor}${statusLabel}\x1b[0m DOF=${meta.dof} err=${meta.maxError.toFixed(6)} constraints=${meta.constraints.length}`);

        // Show problematic constraints
        const problems = meta.constraints.filter((c: any) => c.isConflicting || c.isRedundant || c.residual > 1e-4);
        if (problems.length > 0) {
          for (const c of problems) {
            const icon = c.isConflicting ? '\x1b[31m✗\x1b[0m'
              : c.isRedundant ? '\x1b[33m~\x1b[0m'
              : '\x1b[31m!\x1b[0m';
            const valueStr = c.value !== undefined ? `=${c.value}` : '';
            const tag = c.isConflicting ? ' CONFLICT'
              : c.isRedundant ? ' REDUNDANT'
              : ` err=${c.residual.toFixed(4)}`;
            console.log(`    ${icon} ${c.label}${valueStr} (${c.entityIds.join(', ')})${tag}`);
          }
        }

        if (meta.rejected.length > 0) {
          console.log(`  ${obj.name}${grpTag}: ✗ ${meta.rejected.length} rejected constraint(s):`);
          for (const c of meta.rejected) {
            console.log(`    ${c.label} — ${c.rejectionReason}`);
          }
        }
      }
    }

    const diagnostics = (result.logs || []).filter((log: any) => log.level === 'warn' || log.level === 'error');
    if (diagnostics.length > 0) {
      console.log(`\n⚠ Script diagnostics:`);
      for (const log of diagnostics) {
        console.log(`  [${log.level}] ${log.args.join(' ')}`);
      }
    }

    if (debugImports) {
      const importLogs = (result.logs || []).filter((log: any) => log.level === 'info' && log.args[0]?.startsWith('[import]'));
      console.log(`\n✓ Import trace: ${importLogs.length} event(s)`);
      for (const log of importLogs) {
        console.log(`  ${log.args.join(' ')}`);
      }
    }

    // Spatial analysis
    const entries: ShapeEntry[] = result.objects
      .filter((o: any) => o.shape)
      .map((o: any) => {
        const bb = o.shape.boundingBox();
        return { name: o.name, shape: o.shape, min: bb.min as number[], max: bb.max as number[], groupName: o.groupName };
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
  } finally {
    materialized.cleanup();
  }
}

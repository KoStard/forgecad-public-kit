#!/usr/bin/env node

import { statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const outputPath = path.join(repoRoot, "skills/forgecad/SKILL.md");

const docs = {
  apiReference: "docs/permanent/API/model-building/reference.md",
  coordinateSystem: "docs/permanent/API/model-building/coordinate-system.md",
  geometryConventions: "docs/permanent/API/model-building/geometry-conventions.md",
  positioning: "docs/permanent/API/model-building/positioning.md",
  entities: "docs/permanent/API/model-building/entities.md",
  assembly: "docs/permanent/API/model-building/assembly.md",
  sketchCore: "docs/permanent/API/model-building/sketch-core.md",
  sketchPrimitives: "docs/permanent/API/model-building/sketch-primitives.md",
  sketchPath: "docs/permanent/API/model-building/sketch-path.md",
  sketchTransforms: "docs/permanent/API/model-building/sketch-transforms.md",
  sketchBooleans: "docs/permanent/API/model-building/sketch-booleans.md",
  sketchOperations: "docs/permanent/API/model-building/sketch-operations.md",
  sketchOnFace: "docs/permanent/API/model-building/sketch-on-face.md",
  sketchExtrude: "docs/permanent/API/model-building/sketch-extrude.md",
  sketchAnchor: "docs/permanent/API/model-building/sketch-anchor.md",
  modelingRecipes: "docs/permanent/API/guides/modeling-recipes.md",
  cli: "docs/permanent/CLI.md",
};

const docGroups = [
  {
    title: "Core API (read first)",
    guidance:
      "Single source of truth for primitives, transforms, booleans, imports, topology, and return formats.",
    paths: [docs.apiReference],
  },
  {
    title: "Geometry and Positioning (load when placement/orientation matters)",
    guidance:
      "Conventions and preferred placement strategy to avoid axis mistakes, winding errors, and fragile manual offsets.",
    paths: [docs.coordinateSystem, docs.geometryConventions, docs.positioning],
  },
  {
    title: "Sketch Deep-Dives (load only when the task is sketch-heavy)",
    guidance:
      "Focused docs for sketch construction, transformations, booleans, path workflows, and sketch-to-solid conversion.",
    paths: [
      docs.sketchCore,
      docs.sketchPrimitives,
      docs.sketchPath,
      docs.sketchTransforms,
      docs.sketchBooleans,
      docs.sketchOperations,
      docs.sketchOnFace,
      docs.sketchExtrude,
      docs.sketchAnchor,
    ],
  },
  {
    title: "Assemblies and Mechanisms (load for joints or kinematics)",
    guidance: "Assembly graph, couplings, metadata, and robot export behavior.",
    paths: [docs.assembly],
  },
  {
    title: "Entity and Topology Helpers (load for tracked references or constraints)",
    guidance: "2D entities, tracked 3D topology, constraints, patterns, and edge fillet/chamfer helpers.",
    paths: [docs.entities],
  },
  {
    title: "Recipes and Debugging (load for faster iteration and examples)",
    guidance: "Modeling patterns, troubleshooting moves, and copyable snippets.",
    paths: [docs.modelingRecipes],
  },
  {
    title: "CLI and Exports (load for validation/render/export tasks)",
    guidance: "Notebook execution, test-run validation, export pipelines, and debug flags.",
    paths: [docs.cli],
  },
];

const readPlan = [
  `Start with \`${docs.apiReference}\` for API correctness.`,
  `Only add \`${docs.coordinateSystem}\`, \`${docs.geometryConventions}\`, and \`${docs.positioning}\` when orientation or placement behavior matters.`,
  "Load sketch docs selectively based on what the task touches (primitives, paths, booleans, transforms, on-face, extrusion, anchors).",
  `Load \`${docs.assembly}\` only when joints, couplings, or mechanism validation are involved.`,
  `Load \`${docs.entities}\` for topology-aware edits, constraints, and feature propagation.`,
  `Use \`${docs.modelingRecipes}\` for practical patterns and debugging tactics.`,
  `Use \`${docs.cli}\` for command usage, export pipelines, and runtime checks.`,
];

const allDocs = Object.values(docs);

function normalizePath(relativePath) {
  return relativePath.replaceAll(path.sep, "/");
}

function assertReadableFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const stat = statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`Expected file but found non-file path: ${relativePath}`);
  }
}

function renderDocGroups(groups) {
  return groups
    .map((group) => {
      const fileBullets = group.paths.map((filePath) => `- \`${normalizePath(filePath)}\``).join("\n");
      return [`### ${group.title}`, "", group.guidance, "", fileBullets, ""].join("\n");
    })
    .join("\n");
}

const skillContent = `---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .sketch.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when Codex needs to build or modify ForgeCAD geometry, structure multi-file projects, run notebook cells, validate scripts, or use ForgeCAD export/render tooling.
---

# ForgeCAD

## Overview

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows using the mapped source docs below. Prefer documented ForgeCAD primitives, import rules, placement strategies, and CLI commands over inventing new APIs or geometry conventions.

## Workflow

1. Identify the target artifact first: \`.forge.js\`, \`.sketch.js\`, \`.forge-notebook.json\`, SVG asset, or a CLI/export task.
2. Default to a concrete first pass when the user clearly wants a fix or a model, not a long design review. Easy iteration is cheaper than speculative back-and-forth.
3. Use the read plan below to load only the docs needed for the current task. Avoid bulk-reading everything.
4. If an existing model is broken or incoherent, replace the weak structure with a cleaner buildable design instead of preserving bad architecture.
5. Use multi-file imports deliberately: \`importPart()\` for parts, \`importSketch()\` for sketches or SVGs, explicit \`paramOverrides\`, and \`.withReferences()\` plus \`.placeReference()\` for reusable placement.
6. Use notebooks when the task benefits from stateful iteration, iterative development or debugging; remember cells share state, \`show()\` pins visible geometry, and notebooks can be exported to plain \`.forge.js\`. You can later convert it to a forge.js file.
7. Validate quickly through the CLI with \`npm run test-run -- <file>\`; add \`--debug-imports\` when import chains or overrides might be wrong, then refine from the runtime result.
8. Reuse patterns from \`examples/api/\` before inventing a modeling recipe from scratch.

## Read Plan (Anti-Redundancy)

${readPlan.map((line, i) => `${i + 1}. ${line}`).join("\n")}

## Source Map

${renderDocGroups(docGroups)}
`;

allDocs.forEach((docPath) => assertReadableFile(docPath));
writeFileSync(outputPath, skillContent);

console.log(`Wrote ${outputPath}`);
console.log(`Indexed ${allDocs.length} source files.`);

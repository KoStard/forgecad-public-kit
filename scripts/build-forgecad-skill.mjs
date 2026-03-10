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
    title: "1. Core API (always read first)",
    guidance: "Primitives, transforms, booleans, imports, topology, return formats, curves/surfacing.",
    paths: [docs.apiReference],
  },
  {
    title: "2. Geometry and Positioning (when placement/orientation matters)",
    guidance: "Axis conventions, winding rules, and placement strategy.",
    paths: [docs.coordinateSystem, docs.geometryConventions, docs.positioning],
  },
  {
    title: "3. Sketch APIs (when the task is sketch-heavy)",
    guidance: "2D construction, transforms, booleans, paths, on-face sketching, extrusion, anchors.",
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
    title: "4. Entities and Topology (for tracked references, constraints, patterns)",
    guidance: "Named entities, tracked 3D topology, constraints, patterns, fillet/chamfer helpers.",
    paths: [docs.entities],
  },
  {
    title: "5. Assemblies and Mechanisms (for joints or kinematics)",
    guidance: "Assembly graph, joint types, couplings, validation, robot export.",
    paths: [docs.assembly],
  },
  {
    title: "6. Recipes and Debugging (for patterns and troubleshooting)",
    guidance: "Modeling patterns, debugging tactics, copyable snippets.",
    paths: [docs.modelingRecipes],
  },
  {
    title: "7. CLI and Exports (for validation/render/export tasks)",
    guidance: "Test-run, notebook execution, export pipelines, debug flags.",
    paths: [docs.cli],
  },
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

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows. Prefer documented primitives, import rules, placement strategies, and CLI commands over inventing new APIs.

## Workflow

1. Identify the artifact: \`.forge.js\`, \`.sketch.js\`, \`.forge-notebook.json\`, SVG asset, or CLI/export task.
2. Load only the docs the task needs (see Source Map below). Start from the top group, add others as needed.
3. Reuse patterns from \`examples/api/\` before inventing from scratch.
4. Default to a concrete first pass — easy iteration beats speculative design review.
5. If an existing model is broken, replace the weak structure rather than preserving bad architecture.
6. Validate with \`npm run test-run -- <file>\` (add \`--debug-imports\` for import chain issues).

### Import and Composition

- \`importPart()\` for parts, \`importSketch()\` for sketches/SVGs, with explicit \`paramOverrides\`.
- \`.withReferences()\` + \`.placeReference()\` for reusable placement.
- Plain \`.js\` modules for shared helpers/constants (not model imports).

### Notebooks

Use \`.forge-notebook.json\` for stateful iteration and debugging. Cells share state, \`show()\` pins visible geometry. Export to \`.forge.js\` when done.

## Source Map

Load groups top-to-bottom, stopping when you have what the task needs.

${renderDocGroups(docGroups)}
`;

allDocs.forEach((docPath) => assertReadableFile(docPath));
writeFileSync(outputPath, skillContent);

console.log(`Wrote ${outputPath}`);
console.log(`Indexed ${allDocs.length} source files.`);

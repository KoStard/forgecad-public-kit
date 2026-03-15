#!/usr/bin/env node

import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const devOutputPath = path.join(repoRoot, "skills/forgecad/SKILL.md");
const installOutputPath = path.join(repoRoot, "dist-skill/SKILL.md");

const docs = {
  apiReference: "docs/permanent/API/model-building/reference.md",
  coordinateSystem: "docs/permanent/API/model-building/coordinate-system.md",
  geometryConventions: "docs/permanent/API/model-building/geometry-conventions.md",
  positioning: "docs/permanent/API/model-building/positioning.md",
  entities: "docs/permanent/API/model-building/entities.md",
  assembly: "docs/permanent/API/model-building/assembly.md",
  viewport: "docs/permanent/API/runtime/viewport.md",
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
    title: "6. Runtime Viewport APIs (for cut planes, jointsView, and animation playback)",
    guidance: "Viewer-only APIs such as cutPlane, explodeView, jointsView, and animation behavior.",
    paths: [docs.viewport],
  },
  {
    title: "7. Recipes and Debugging (for patterns and troubleshooting)",
    guidance: "Modeling patterns, debugging tactics, copyable snippets.",
    paths: [docs.modelingRecipes],
  },
  {
    title: "8. CLI and Exports (for validation/render/export tasks)",
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

function readDoc(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), "utf-8").trimEnd();
}

// ---------------------------------------------------------------------------
// Dev SKILL.md — thin, with relative path references (used in-repo)
// ---------------------------------------------------------------------------

function renderDocGroupsForDev(groups) {
  return groups
    .map((group) => {
      const fileBullets = group.paths.map((filePath) => `- \`${normalizePath(filePath)}\``).join("\n");
      return [`### ${group.title}`, "", group.guidance, "", fileBullets, ""].join("\n");
    })
    .join("\n");
}

const devSkillContent = `---
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
7. For \`jointsView()\` animations, keep wrapped revolute tracks continuous across branch cuts; do not assume the viewport will auto-fix \`-180/180\` jumps.

### Import and Composition

- \`importPart()\` for parts, \`importSketch()\` for sketches/SVGs, with explicit \`paramOverrides\`.
- \`.withReferences()\` + \`.placeReference()\` for reusable placement.
- Plain \`.js\` modules for shared helpers/constants (not model imports).

### Notebooks

Use \`.forge-notebook.json\` for stateful iteration and debugging. Cells share state, \`show()\` pins visible geometry. Export to \`.forge.js\` when done.

## Source Map

Load groups top-to-bottom, stopping when you have what the task needs.

${renderDocGroupsForDev(docGroups)}
### 9. Check API examples for more context

- \`examples/api/*\`
`;

// ---------------------------------------------------------------------------
// Install SKILL.md — self-contained, all docs inlined (used after npm install)
// ---------------------------------------------------------------------------

function renderDocGroupsInlined(groups) {
  return groups
    .map((group) => {
      const inlinedDocs = group.paths
        .map((filePath) => {
          const content = readDoc(filePath);
          return `<!-- ${normalizePath(filePath)} -->\n\n${content}`;
        })
        .join("\n\n---\n\n");
      return [`### ${group.title}`, "", group.guidance, "", inlinedDocs, ""].join("\n");
    })
    .join("\n\n");
}

function buildInstallSkillContent() {
  return `---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .sketch.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when Codex needs to build or modify ForgeCAD geometry, structure multi-file projects, run notebook cells, validate scripts, or use ForgeCAD export/render tooling.
---

# ForgeCAD

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows. Prefer documented primitives, import rules, placement strategies, and CLI commands over inventing new APIs.

## Workflow

1. Identify the artifact: \`.forge.js\`, \`.sketch.js\`, \`.forge-notebook.json\`, SVG asset, or CLI/export task.
2. Use the reference sections below — all API docs are inlined. Start from Core API, add others as needed.
3. Default to a concrete first pass — easy iteration beats speculative design review.
4. If an existing model is broken, replace the weak structure rather than preserving bad architecture.
5. Validate with \`forgecad run <file>\` (add \`--debug-imports\` for import chain issues). This works for notebook preview cells too.
6. For \`jointsView()\` animations, keep wrapped revolute tracks continuous across branch cuts; do not assume the viewport will auto-fix \`-180/180\` jumps.

### Import and Composition

- \`importPart()\` for parts, \`importSketch()\` for sketches/SVGs, with explicit \`paramOverrides\`.
- \`.withReferences()\` + \`.placeReference()\` for reusable placement.
- Plain \`.js\` modules for shared helpers/constants (not model imports).

### Notebooks

Use \`.forge-notebook.json\` for stateful iteration and debugging. Cells share state, \`show()\` pins visible geometry, and the preview cell can be validated or rendered directly from the CLI.

Prefer notebooks when:

- the task is exploratory or the geometry strategy is still unclear
- you are debugging booleans, placements, or assembly kinematics
- you want to inspect intermediate shapes or sketches without rewriting the whole file

Useful notebook loop:

- keep stable setup in early cells and the current experiment in the preview cell
- use \`show(...)\` for intermediate geometry you want pinned in the viewport
- use \`forgecad notebook view <file> preview\` to inspect the notebook from the terminal
- use \`forgecad run <file>.forge-notebook.json\` for preview-cell validation and spatial analysis
- use \`forgecad render <file>.forge-notebook.json\` or \`forgecad capture gif <file>.forge-notebook.json --list\` to inspect the preview cell through the CLI
- export to \`.forge.js\` when the exploratory phase is over and the structure is ready to stabilize

## API Reference

All documentation is inlined below. Read the relevant sections based on your task — start from Core API, add others as needed.

${renderDocGroupsInlined(docGroups)}
`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

allDocs.forEach((docPath) => assertReadableFile(docPath));

writeFileSync(devOutputPath, devSkillContent);
console.log(`Wrote ${devOutputPath}`);

mkdirSync(path.dirname(installOutputPath), { recursive: true });
writeFileSync(installOutputPath, buildInstallSkillContent());
console.log(`Wrote ${installOutputPath}`);

console.log(`Indexed ${allDocs.length} source files.`);

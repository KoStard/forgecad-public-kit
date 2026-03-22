#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const devOutputPath = path.join(repoRoot, "skills/forgecad/SKILL.md");
const installOutputPath = path.join(repoRoot, "dist-skill/SKILL.md");
const installDocsOutputDir = path.join(repoRoot, "dist-skill/docs");
const sourceDocsDir = path.join(repoRoot, "docs/permanent");

const docs = {
  // Core API
  apiReference: "docs/permanent/API/core/reference.md",
  topology: "docs/permanent/API/core/topology.md",
  parameters: "docs/permanent/API/core/parameters.md",
  edgeQueries: "docs/permanent/API/core/edge-queries.md",

  // Guides
  coordinateSystem: "docs/permanent/guides/coordinate-system.md",
  geometryConventions: "docs/permanent/guides/geometry-conventions.md",
  positioning: "docs/permanent/guides/positioning.md",
  modelingRecipes: "docs/permanent/guides/modeling-recipes.md",

  // Sketch
  sketchCore: "docs/permanent/API/sketch/core.md",
  sketchPrimitives: "docs/permanent/API/sketch/primitives.md",
  sketchPath: "docs/permanent/API/sketch/path.md",
  sketchTransforms: "docs/permanent/API/sketch/transforms.md",
  sketchBooleans: "docs/permanent/API/sketch/booleans.md",
  sketchOperations: "docs/permanent/API/sketch/operations.md",
  sketchOnFace: "docs/permanent/API/sketch/on-face.md",
  sketchExtrude: "docs/permanent/API/sketch/extrude.md",
  sketchAnchor: "docs/permanent/API/sketch/anchor.md",
  sketchText: "docs/permanent/API/sketch/text.md",
  sketchRegions: "docs/permanent/API/sketch/regions.md",

  // Assembly
  assembly: "docs/permanent/API/assembly/assembly.md",

  // Sheet Metal
  sheetMetal: "docs/permanent/API/sheet-metal/sheet-metal.md",

  // Runtime
  viewport: "docs/permanent/API/runtime/viewport.md",

  // Output
  export: "docs/permanent/API/output/export.md",
  brepExport: "docs/permanent/API/output/brep-export.md",
  bom: "docs/permanent/API/output/bom.md",
  dimensions: "docs/permanent/API/output/dimensions.md",

  // Toolbox
  fasteners: "docs/permanent/API/toolbox/fasteners.md",

  // CLI
  cli: "docs/permanent/CLI.md",

  // Auto-generated
  generatedApiRef: "docs/permanent/generated/api-reference.md",
};

const docGroups = [
  {
    title: "1. Core API (always read first)",
    guidance:
      "Primitives, transforms, booleans, imports, parameters, topology, edge queries, return formats, curves/surfacing.",
    paths: [docs.apiReference, docs.parameters, docs.topology, docs.edgeQueries],
  },
  {
    title: "2. Geometry and Positioning (when placement/orientation matters)",
    guidance: "Axis conventions, winding rules, and placement strategy.",
    paths: [docs.coordinateSystem, docs.geometryConventions, docs.positioning],
  },
  {
    title: "3. Sketch APIs (when the task is sketch-heavy)",
    guidance:
      "2D construction, transforms, booleans, paths, on-face sketching, extrusion, anchors, text, regions.",
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
      docs.sketchText,
      docs.sketchRegions,
    ],
  },
  {
    title: "4. Assemblies and Mechanisms (for joints or kinematics)",
    guidance: "Assembly graph, joint types, couplings, validation, robot export.",
    paths: [docs.assembly],
  },
  {
    title: "5. Sheet Metal (for bent parts, K-factor, flat patterns)",
    guidance: "Bend operations, flat pattern unfolding, K-factor configuration.",
    paths: [docs.sheetMetal],
  },
  {
    title: "6. Output and Export (for STL/3MF/STEP, BOM, dimensions)",
    guidance: "Mesh export, exact geometry export, bill of materials, dimension annotations.",
    paths: [docs.export, docs.brepExport, docs.bom, docs.dimensions],
  },
  {
    title: "7. Toolbox (fasteners and standard parts)",
    guidance: "Parametric bolts, nuts, washers, and standard hardware.",
    paths: [docs.fasteners],
  },
  {
    title: "8. Runtime Viewport APIs (for cut planes, jointsView, and animation playback)",
    guidance: "Viewer-only APIs such as cutPlane, explodeView, jointsView, and animation behavior.",
    paths: [docs.viewport],
  },
  {
    title: "9. Recipes and Debugging (for patterns and troubleshooting)",
    guidance: "Modeling patterns, debugging tactics, copyable snippets.",
    paths: [docs.modelingRecipes],
  },
  {
    title: "10. CLI (for validation/render/export tasks)",
    guidance: "Test-run, notebook execution, export pipelines, debug flags.",
    paths: [docs.cli],
  },
  {
    title: "11. Auto-Generated API Index (lookup unknown functions)",
    guidance:
      "Complete function/class/constant index auto-generated from the type definitions. Use when you encounter an unfamiliar API name.",
    paths: [docs.generatedApiRef],
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
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when building or modifying ForgeCAD geometry, structuring multi-file projects, running notebook cells, validating scripts, or using ForgeCAD export/render tooling.
---

# ForgeCAD

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows. Prefer documented primitives, import rules, placement strategies, and CLI commands over inventing new APIs.

## Workflow

1. Identify the artifact: \`.forge.js\`, \`.forge-notebook.json\`, SVG asset, or CLI/export task.
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
### 12. Check API examples for more context

- \`examples/api/*\`
`;

// ---------------------------------------------------------------------------
// Install SKILL.md — thin template with {{SKILL_DIR}} placeholder.
// Docs are shipped as separate files in dist-skill/docs/ and copied to
// ~/.agents/skills/forgecad/docs/ at install time. forge-skill.ts substitutes
// the placeholder with the actual install directory path.
// ---------------------------------------------------------------------------

// Maps a repo-relative doc path to its path inside the installed skill dir.
// e.g. "docs/permanent/API/model-building/reference.md"
//   -> "{{SKILL_DIR}}/docs/API/model-building/reference.md"
function toInstallDocPath(repoRelPath) {
  const withoutPrefix = repoRelPath.replace(/^docs\/permanent\//, "docs/");
  return `{{SKILL_DIR}}/${normalizePath(withoutPrefix)}`;
}

function renderDocGroupsForInstall(groups) {
  return groups
    .map((group) => {
      const fileBullets = group.paths.map((filePath) => `- \`${toInstallDocPath(filePath)}\``).join("\n");
      return [`### ${group.title}`, "", group.guidance, "", fileBullets, ""].join("\n");
    })
    .join("\n");
}

function buildInstallSkillContent() {
  return `---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when building or modifying ForgeCAD geometry, structuring multi-file projects, running notebook cells, validating scripts, or using ForgeCAD export/render tooling.
---

# ForgeCAD

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows. Prefer documented primitives, import rules, placement strategies, and CLI commands over inventing new APIs.

## Workflow

1. Identify the artifact: \`.forge.js\`, \`.forge-notebook.json\`, SVG asset, or CLI/export task.
2. Load only the docs the task needs (see Source Map below). Start from the top group, add others as needed.
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

## Source Map

Load groups top-to-bottom, stopping when you have what the task needs.

${renderDocGroupsForInstall(docGroups)}
`;
}

// ---------------------------------------------------------------------------
// One-file CONTEXT.md — all docs inlined, designed for chat-UI paste
// ---------------------------------------------------------------------------

const oneFileOutputPath = path.join(repoRoot, "dist-skill/CONTEXT.md");

function buildOneFileContent() {
  const docSections = allDocs
    .map((docPath) => {
      const content = readDoc(docPath);
      const label = normalizePath(docPath.replace(/^docs\/permanent\//, ""));
      return `<!-- ${label} -->\n\n${content}`;
    })
    .join("\n\n---\n\n");

  return `# ForgeCAD — AI Context (Chat UI)

> **Usage:** Paste this file as context into your AI chat session (Claude.ai, ChatGPT, Gemini, etc.).
> The AI will have full ForgeCAD API knowledge and will guide you through building models.
>
> **No CLI access in this session.** The AI cannot run commands directly. Instead, it will ask
> you to run commands like \`forgecad run <file>\` or \`forgecad notebook view <file> preview\`
> in your terminal and paste back the output for verification and iteration.

## Workflow

1. Tell the AI what you want to build and share any existing \`.forge.js\` or \`.forge-notebook.json\` files.
2. The AI will write or edit model files for you.
3. To validate, run \`forgecad run <file>\` in your terminal and paste the output.
4. For notebooks: \`forgecad notebook view <file> preview\` shows the current geometry description.
5. Iterate until the model looks right, then optionally \`forgecad render <file>\` for a PNG.

---

## ForgeCAD API Reference

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows.
Prefer documented primitives, import rules, and placement strategies over inventing new APIs.

### Model files

- \`.forge.js\` — parametric part or assembly script; default export is a \`Shape\`, \`Sketch\`, or \`Assembly\`.
- \`.forge-notebook.json\` — multi-cell notebook for iterative work; preview cell is the active output.

### Import and composition

- \`importPart()\` for parts, \`importSketch()\` for sketches/SVGs, with explicit \`paramOverrides\`.
- \`.withReferences()\` + \`.placeReference()\` for reusable placement.
- Plain \`.js\` modules for shared helpers/constants (not model imports).

### Validation commands (ask the user to run these)

\`\`\`
forgecad run <file.forge.js>                          # geometry diagnostics
forgecad run <file.forge-notebook.json>               # preview-cell diagnostics
forgecad notebook view <file.forge-notebook.json> preview   # inspect notebook output
forgecad render <file.forge.js>                       # PNG render
forgecad capture gif <file.forge.js>                  # animated orbit GIF
\`\`\`

---

${docSections}
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

cpSync(sourceDocsDir, installDocsOutputDir, { recursive: true });
console.log(`Copied docs -> ${installDocsOutputDir}`);

writeFileSync(oneFileOutputPath, buildOneFileContent());
console.log(`Wrote ${oneFileOutputPath}`);

console.log(`Indexed ${allDocs.length} source files.`);

#!/usr/bin/env node

import { cpSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const devOutputPath = path.join(repoRoot, "skills/forgecad/SKILL.md");
const installOutputPath = path.join(repoRoot, "dist-skill/SKILL.md");
const installDevOutputPath = path.join(repoRoot, "dist-skill/SKILL-dev.md");
const installDocsOutputDir = path.join(repoRoot, "dist-skill/docs");
const sourceDocsDir = path.join(repoRoot, "docs/permanent");

const docs = {
  // Core concepts and gotchas
  concepts: "docs/permanent/API/core/concepts.md",
  sdf: "docs/permanent/API/core/sdf.md",
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

  // Auto-generated per-module API references
  genCore: "docs/permanent/generated/core.md",
  genSketch: "docs/permanent/generated/sketch.md",
  genAssembly: "docs/permanent/generated/assembly.md",
  genCurves: "docs/permanent/generated/curves.md",
  genSheetMetal: "docs/permanent/generated/sheet-metal.md",
  genViewport: "docs/permanent/generated/viewport.md",
  genOutput: "docs/permanent/generated/output.md",
  genLib: "docs/permanent/generated/lib.md",
};

// ---------------------------------------------------------------------------
// One-file slim docs — condensed versions for the CONTEXT.md paste target.
// The full docs above are used for dev SKILL.md and installed SKILL.md
// (which load files on demand). The one-file output inlines everything, so
// we use slimmer versions to keep the token count manageable.
// ---------------------------------------------------------------------------
const oneFileDocs = {
  // Core concepts and slim skill guide
  concepts: "docs/permanent/API/core/concepts.md",
  sdf: "docs/permanent/API/core/sdf.md",
  skillGuide: "docs/permanent/API/core/skill-guide.md",

  // Core supporting docs (concise)
  topology: "docs/permanent/API/core/topology.md",
  parameters: "docs/permanent/API/core/parameters.md",
  edgeQueries: "docs/permanent/API/core/edge-queries.md",

  // Guides
  coordinateSystem: "docs/permanent/guides/coordinate-system.md",
  geometryConventions: "docs/permanent/guides/geometry-conventions.md",
  positioning: "docs/permanent/guides/positioning.md",
  modelingRecipes: "docs/permanent/guides/modeling-recipes.md",

  // Sketch (already concise individual files)
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

  // Output (brep-export omitted — essentials in export.md and skill-cli.md)
  export: "docs/permanent/API/output/export.md",
  bom: "docs/permanent/API/output/bom.md",
  dimensions: "docs/permanent/API/output/dimensions.md",

  // Toolbox
  fasteners: "docs/permanent/API/toolbox/fasteners.md",

  // Slim CLI excerpt — model-authoring commands only
  skillCli: "docs/permanent/API/core/skill-cli.md",

  // Auto-generated per-module API references
  genCore: "docs/permanent/generated/core.md",
  genSketch: "docs/permanent/generated/sketch.md",
  genAssembly: "docs/permanent/generated/assembly.md",
  genCurves: "docs/permanent/generated/curves.md",
  genSheetMetal: "docs/permanent/generated/sheet-metal.md",
  genViewport: "docs/permanent/generated/viewport.md",
  genOutput: "docs/permanent/generated/output.md",
  genLib: "docs/permanent/generated/lib.md",
};

const docGroups = [
  {
    title: "1. Core API (always read first)",
    guidance:
      "Execution model, colors, coordinate system, primitives, booleans, patterns, imports, parameters, topology, edge queries.",
    paths: [docs.concepts, docs.parameters, docs.topology, docs.edgeQueries, docs.genCore],
  },
  {
    title: "1b. SDF Modeling (when using smooth booleans, TPMS, deformations, or fromFunction)",
    guidance: "Primitives, smooth booleans, TPMS lattices, twist/bend/displace, morph, custom functions, gotchas.",
    paths: [docs.sdf],
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
      docs.genSketch,
    ],
  },
  {
    title: "4. Curves and Surfacing (for lofts, sweeps, splines)",
    guidance: "Smooth curves, Hermite splines, lofted and swept solids.",
    paths: [docs.genCurves],
  },
  {
    title: "5. Assemblies and Mechanisms (for joints or kinematics)",
    guidance: "Assembly graph, joint types, couplings, validation, robot export.",
    paths: [docs.assembly, docs.genAssembly],
  },
  {
    title: "6. Sheet Metal (for bent parts, K-factor, flat patterns)",
    guidance: "Bend operations, flat pattern unfolding, K-factor configuration.",
    paths: [docs.sheetMetal, docs.genSheetMetal],
  },
  {
    title: "7. Output and Export (for STL/3MF/STEP, BOM, dimensions)",
    guidance: "Mesh export, exact geometry export, bill of materials, dimension annotations.",
    paths: [docs.export, docs.brepExport, docs.bom, docs.dimensions, docs.genOutput],
  },
  {
    title: "8. Toolbox (fasteners and standard parts)",
    guidance: "Parametric bolts, nuts, washers, standard hardware, gears, pipes, and structural profiles.",
    paths: [docs.fasteners, docs.genLib],
  },
  {
    title: "9. Runtime Viewport APIs (for cut planes, jointsView, and animation playback)",
    guidance: "Viewer-only APIs such as cutPlane, explodeView, jointsView, and animation behavior.",
    paths: [docs.viewport, docs.genViewport],
  },
  {
    title: "10. Recipes and Debugging (for patterns and troubleshooting)",
    guidance: "Modeling patterns, debugging tactics, copyable snippets.",
    paths: [docs.modelingRecipes],
  },
  {
    title: "11. CLI (for validation/render/export tasks)",
    guidance: "Test-run, notebook execution, export pipelines, debug flags.",
    paths: [docs.cli],
  },
];

// ---------------------------------------------------------------------------
// Dev-only docs — internals, project conventions, full CLI.
// These appear only in SKILL-dev.md (--dev install).
// ---------------------------------------------------------------------------
const devDocs = {
  compiler: "docs/permanent/internals/compiler.md",
  constraintSolver: "docs/permanent/internals/constraint-solver.md",
  constraintSolverQuality: "docs/permanent/internals/constraint-solver-quality.md",
  sketch2dPipeline: "docs/permanent/internals/sketch-2d-pipeline.md",
  codingBestPractices: "docs/permanent/project/coding-best-practices.md",
  coding: "docs/permanent/project/coding.md",
  vision: "docs/permanent/project/vision.md",
  deployment: "docs/permanent/DEPLOYMENT.md",
  releasing: "docs/permanent/RELEASING.md",
  skillMaintenance: "docs/permanent/guides/skill-maintenance.md",
};

const devDocGroups = [
  {
    title: "12. Internals — Compiler & Geometry Pipeline (for ForgeCAD developers)",
    guidance:
      "Semantic feature graphs, lowering strategy, compile plans. Read when working on the compiler or geometry backends.",
    paths: [devDocs.compiler],
  },
  {
    title: "13. Internals — Constraint Solver (for solver work)",
    guidance: "Solver architecture, phases, Gauss-Seidel/Newton-Raphson, quality tuning.",
    paths: [devDocs.constraintSolver, devDocs.constraintSolverQuality],
  },
  {
    title: "14. Internals — Sketch 2D Pipeline",
    guidance: "2D sketch pipeline stages, constraint evaluation, winding enforcement.",
    paths: [devDocs.sketch2dPipeline],
  },
  {
    title: "15. Project Conventions (coding standards, releases)",
    guidance: "Coding best practices, PR guidelines, release checklist, deployment.",
    paths: [devDocs.codingBestPractices, devDocs.coding, devDocs.deployment, devDocs.releasing],
  },
  {
    title: "16. Product Vision & Roadmap",
    guidance: "Long-term direction, Manifold relationship, parity gaps.",
    paths: [devDocs.vision],
  },
  {
    title: "17. Skill System Maintenance",
    guidance: "How to add docs, maintain standard vs dev skill, build and install flow.",
    paths: [devDocs.skillMaintenance],
  },
];

const allDocs = Object.values(docs);
const allDevDocs = Object.values(devDocs);
const allOneFileDocs = Object.values(oneFileDocs);

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

- \`require("./file.forge.js", { Param: value })\` for any model file, with optional param overrides.
- \`importSvgSketch()\` for SVG files (file format loader, not a module import).
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

function buildInstallSkillContent(extraGroups = []) {
  const allGroups = [...docGroups, ...extraGroups];
  const description = extraGroups.length > 0
    ? "ForgeCAD development skill — model authoring plus compiler internals, solver architecture, coding conventions, and skill maintenance. Use when developing ForgeCAD itself."
    : "ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when building or modifying ForgeCAD geometry, structuring multi-file projects, running notebook cells, validating scripts, or using ForgeCAD export/render tooling.";
  return `---
name: forgecad
description: ${description}
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

- \`require("./file.forge.js", { Param: value })\` for any model file, with optional param overrides.
- \`importSvgSketch()\` for SVG files (file format loader, not a module import).
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

${renderDocGroupsForInstall(allGroups)}
`;
}

// ---------------------------------------------------------------------------
// One-file CONTEXT.md — all docs inlined, designed for chat-UI paste
// ---------------------------------------------------------------------------

const oneFileOutputPath = path.join(repoRoot, "dist-skill/CONTEXT.md");

function buildOneFileContent() {
  const docSections = allOneFileDocs
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

- \`require("./file.forge.js", { Param: value })\` for any model file, with optional param overrides.
- \`importSvgSketch()\` for SVG files (file format loader, not a module import).
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
// Installer page — mobile-friendly HTML for copying/downloading the skill
// ---------------------------------------------------------------------------

function buildInstallerPage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Install ForgeCAD AI Skill</title>
  <meta name="description" content="Give Claude, ChatGPT, or any AI assistant full ForgeCAD CAD modeling knowledge in one tap.">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    :root {
      --bg: #0d1117; --surface: #161b22; --border: #30363d;
      --text: #e6edf3; --dim: #8b949e; --accent: #58a6ff;
      --success: #3fb950; --radius: 12px;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
      background: var(--bg); color: var(--text);
      min-height: 100vh; min-height: 100dvh;
      display: flex; flex-direction: column; align-items: center;
      padding: 24px 16px env(safe-area-inset-bottom, 16px);
      -webkit-font-smoothing: antialiased;
    }
    .container { max-width: 480px; width: 100%; }
    .logo { font-size: 28px; font-weight: 700; text-align: center; margin-bottom: 4px; }
    .subtitle { text-align: center; color: var(--dim); font-size: 14px; margin-bottom: 28px; line-height: 1.5; }
    .card {
      background: var(--surface); border: 1px solid var(--border);
      border-radius: var(--radius); padding: 20px; margin-bottom: 16px;
    }
    .card h2 { font-size: 15px; font-weight: 600; margin-bottom: 12px; }
    .card p { font-size: 13px; color: var(--dim); line-height: 1.55; margin-bottom: 14px; }
    .steps { list-style: none; counter-reset: step; margin-bottom: 16px; }
    .steps li {
      counter-increment: step; font-size: 13px; color: var(--dim);
      line-height: 1.55; padding: 4px 0 4px 28px; position: relative;
    }
    .steps li::before {
      content: counter(step);
      position: absolute; left: 0; top: 4px;
      width: 20px; height: 20px; border-radius: 50%;
      background: var(--border); color: var(--text);
      font-size: 11px; font-weight: 600;
      display: flex; align-items: center; justify-content: center;
    }
    .btn {
      display: block; width: 100%; padding: 14px;
      border: none; border-radius: 8px; cursor: pointer;
      font-size: 15px; font-weight: 600; font-family: inherit;
      transition: background 0.15s, transform 0.1s;
      -webkit-tap-highlight-color: transparent;
    }
    .btn:active { transform: scale(0.98); }
    .btn-primary { background: var(--accent); color: #fff; }
    .btn-primary.success { background: var(--success); }
    .btn-secondary {
      background: transparent; color: var(--accent);
      border: 1px solid var(--border); margin-top: 8px;
    }
    .divider {
      display: flex; align-items: center; gap: 12px;
      color: var(--dim); font-size: 12px; margin: 4px 0;
    }
    .divider::before, .divider::after {
      content: ''; flex: 1; height: 1px; background: var(--border);
    }
    .badge {
      display: inline-block; padding: 2px 8px; border-radius: 10px;
      font-size: 11px; font-weight: 600; background: rgba(88,166,255,0.15);
      color: var(--accent); margin-left: 6px; vertical-align: middle;
    }
    .cli-block {
      background: var(--bg); border: 1px solid var(--border); border-radius: 6px;
      padding: 10px 12px; font-family: 'SF Mono', SFMono-Regular, Menlo, monospace;
      font-size: 12px; color: var(--text); word-break: break-all;
      user-select: all; -webkit-user-select: all;
    }
    .footer { text-align: center; margin-top: 12px; font-size: 12px; color: var(--dim); }
    .footer a { color: var(--accent); text-decoration: none; }
    .embed-note {
      background: rgba(88,166,255,0.08); border: 1px solid rgba(88,166,255,0.2);
      border-radius: 8px; padding: 14px; margin-top: 14px;
    }
    .embed-note p { color: var(--dim); font-size: 12px; line-height: 1.5; margin: 0; }
    .embed-note strong { color: var(--text); }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">ForgeCAD</div>
    <p class="subtitle">
      Give any AI assistant full CAD modeling knowledge.<br>
      Build 3D models through conversation.
    </p>

    <!-- Card 1: Claude Projects (recommended for mobile) -->
    <div class="card">
      <h2>Claude Mobile / Web <span class="badge">Recommended</span></h2>
      <p>Add ForgeCAD as project knowledge so every conversation in that project can build 3D models.</p>
      <ol class="steps">
        <li>Tap <strong>Download Skill File</strong> below</li>
        <li>Open Claude app &rarr; <strong>Projects</strong> &rarr; create or pick a project</li>
        <li>Tap <strong>Add knowledge</strong> &rarr; upload the downloaded file</li>
        <li>Start chatting &mdash; ask Claude to build a model!</li>
      </ol>
      <button class="btn btn-primary" id="downloadBtn" onclick="downloadSkill()">
        Download Skill File
      </button>
      <div class="divider">or</div>
      <button class="btn btn-secondary" id="copyBtn" onclick="copySkill()">
        Copy to Clipboard (for pasting)
      </button>
    </div>

    <!-- Card 2: Other AI assistants -->
    <div class="card">
      <h2>ChatGPT, Gemini, or other chat UIs</h2>
      <p>Copy the skill and paste it as the first message in a new conversation, or add it to your custom instructions.</p>
      <button class="btn btn-secondary" onclick="copySkill()">
        Copy ForgeCAD Context
      </button>
    </div>

    <!-- Card 3: CLI agents -->
    <div class="card">
      <h2>Claude Code, Codex, OpenCode</h2>
      <p>Install the multi-file skill so the agent loads docs on demand:</p>
      <div class="cli-block">npx forgecad skill install</div>
    </div>

    <!-- Embed note -->
    <div class="embed-note">
      <p>
        <strong>Interactive 3D preview:</strong> After installing, ask the AI to build a model and
        provide a ForgeCAD embed link. You'll get an interactive 3D viewer you can rotate and zoom
        right in your browser.
      </p>
    </div>

    <div class="footer">
      <a href="https://kostard.github.io/ForgeCAD/">Open ForgeCAD Editor</a>
      &nbsp;&middot;&nbsp;
      <a href="https://github.com/KoStard/ForgeCAD">GitHub</a>
      &nbsp;&middot;&nbsp;
      <a href="https://www.npmjs.com/package/forgecad">npm</a>
    </div>
  </div>

  <script>
    const CONTEXT_URL = 'CONTEXT.md';
    let cachedContext = null;

    async function fetchContext() {
      if (cachedContext) return cachedContext;
      const res = await fetch(CONTEXT_URL);
      if (!res.ok) throw new Error('Failed to load skill file');
      cachedContext = await res.text();
      return cachedContext;
    }

    async function copySkill() {
      const btn = document.getElementById('copyBtn');
      try {
        const text = await fetchContext();
        await navigator.clipboard.writeText(text);
        btn.textContent = 'Copied!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.textContent = 'Copy to Clipboard (for pasting)';
          btn.classList.remove('success');
        }, 2500);
      } catch (e) {
        // Fallback for browsers that block clipboard API
        try {
          const text = await fetchContext();
          const ta = document.createElement('textarea');
          ta.value = text;
          ta.style.cssText = 'position:fixed;left:-9999px';
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          btn.textContent = 'Copied!';
          btn.classList.add('success');
          setTimeout(() => {
            btn.textContent = 'Copy to Clipboard (for pasting)';
            btn.classList.remove('success');
          }, 2500);
        } catch (e2) {
          alert('Could not copy. Try the Download button instead.');
        }
      }
    }

    async function downloadSkill() {
      const btn = document.getElementById('downloadBtn');
      try {
        const text = await fetchContext();
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'ForgeCAD-Skill.md';
        a.click();
        URL.revokeObjectURL(url);
        btn.textContent = 'Downloaded!';
        btn.classList.add('success');
        setTimeout(() => {
          btn.textContent = 'Download Skill File';
          btn.classList.remove('success');
        }, 2500);
      } catch (e) {
        alert('Download failed: ' + e.message);
      }
    }
  </script>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

[...new Set([...allDocs, ...allDevDocs, ...allOneFileDocs])].forEach((docPath) => assertReadableFile(docPath));

writeFileSync(devOutputPath, devSkillContent);
console.log(`Wrote ${devOutputPath}`);

mkdirSync(path.dirname(installOutputPath), { recursive: true });
writeFileSync(installOutputPath, buildInstallSkillContent());
console.log(`Wrote ${installOutputPath}`);

writeFileSync(installDevOutputPath, buildInstallSkillContent(devDocGroups));
console.log(`Wrote ${installDevOutputPath}`);

cpSync(sourceDocsDir, installDocsOutputDir, { recursive: true });
console.log(`Copied docs -> ${installDocsOutputDir}`);

writeFileSync(oneFileOutputPath, buildOneFileContent());
console.log(`Wrote ${oneFileOutputPath}`);

// ---------------------------------------------------------------------------
// Skill installer page — mobile-friendly landing page for copying/downloading
// the skill into Claude Projects, ChatGPT, etc.
// Deployed to /ForgeCAD/skill/ on GitHub Pages.
// ---------------------------------------------------------------------------

const installerHtmlPath = path.join(repoRoot, "dist-skill/index.html");
writeFileSync(installerHtmlPath, buildInstallerPage());
console.log(`Wrote ${installerHtmlPath}`);

console.log(`Indexed ${allDocs.length} standard + ${allDevDocs.length} dev source files (${allOneFileDocs.length} for one-file output).`);

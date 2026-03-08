#!/usr/bin/env node

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const outputPath = path.join(repoRoot, "skills/forgecad/SKILL.md");
const sourceRoots = [
  "docs/permanent/API/guides/modeling-recipes.md",
  "docs/permanent/API/model-building",
  "docs/permanent/CLI.md",
  // "examples/api",
];

const sectionOrder = [
  "docs/permanent/API/guides/modeling-recipes.md",
  "docs/permanent/API/model-building/",
  "docs/permanent/CLI.md",
  // "examples/api/",
];

function walkFiles(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const stats = statSync(absolutePath);
  if (stats.isFile()) {
    return [relativePath.replaceAll(path.sep, "/")];
  }

  return readdirSync(absolutePath, { withFileTypes: true })
    .filter((entry) => !entry.name.startsWith("."))
    .flatMap((entry) => {
      const nextRelativePath = path.join(relativePath, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(nextRelativePath);
      }
      return [nextRelativePath.replaceAll(path.sep, "/")];
    })
    .sort();
}

function selectFence(content) {
  const matches = content.match(/`+/g) ?? [];
  const longestRun = matches.reduce((max, run) => Math.max(max, run.length), 0);
  return "`".repeat(Math.max(4, longestRun + 1));
}

function languageForFile(relativePath) {
  if (relativePath.endsWith(".forge.js") || relativePath.endsWith(".sketch.js")) {
    return "javascript";
  }
  if (relativePath.endsWith(".md")) {
    return "markdown";
  }
  if (relativePath.endsWith(".svg")) {
    return "xml";
  }
  return "";
}

function formatSourceFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  const content = readFileSync(absolutePath, "utf8").trimEnd();
  const fence = selectFence(content);
  const language = languageForFile(relativePath);
  const infoString = language ? language : "";
  return [
    `### ${relativePath}`,
    "",
    `${fence}${infoString}`,
    content,
    `${fence}`,
    "",
  ].join("\n");
}

function sectionTitle(sectionRoot) {
  if (sectionRoot.endsWith("/")) {
    return sectionRoot.slice(0, -1);
  }
  return sectionRoot;
}

const sourceFiles = sourceRoots.flatMap((root) => walkFiles(root)).sort();

const sectionedSources = sectionOrder
  .map((root) => {
    const normalizedRoot = root.replace(/\/$/, "");
    const files = sourceFiles.filter(
      (filePath) => filePath === normalizedRoot || filePath.startsWith(`${normalizedRoot}/`),
    );
    if (files.length === 0) {
      return "";
    }
    if (files.length === 1 && files[0] === normalizedRoot) {
      const absolutePath = path.join(repoRoot, files[0]);
      const content = readFileSync(absolutePath, "utf8").trimEnd();
      const fence = selectFence(content);
      const language = languageForFile(files[0]);
      const infoString = language ? language : "";
      return [
        `## ${sectionTitle(root)}`,
        "",
        `${fence}${infoString}`,
        content,
        `${fence}`,
        "",
      ].join("\n");
    }
    return [
      `## ${sectionTitle(root)}`,
      "",
      ...files.map((filePath) => formatSourceFile(filePath)),
    ].join("\n");
  })
  .filter(Boolean)
  .join("\n");

const skillContent = `---
name: forgecad
description: ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, .sketch.js, .forge-notebook.json, SVG-import, assembly, and CLI workflows. Use when Codex needs to build or modify ForgeCAD geometry, structure multi-file projects, run notebook cells, validate scripts, or use ForgeCAD export/render tooling.
---

# ForgeCAD

## Overview

Author or modify ForgeCAD models, sketches, assemblies, notebooks, and CLI workflows with the documented API in this file. Prefer the documented ForgeCAD primitives, import rules, placement strategies, and CLI commands over inventing new APIs or geometry conventions.

## Workflow

1. Identify the target artifact first: \`.forge.js\`, \`.sketch.js\`, \`.forge-notebook.json\`, SVG asset, or a CLI/export task.
2. Default to a concrete first pass when the user clearly wants a fix or a model, not a long design review. Easy iteration is cheaper than speculative back-and-forth.
3. Read the model-building docs in order when geometry behavior matters, but keep exploration proportional. Read enough to avoid API mistakes, then start building.
4. If an existing model is broken or incoherent, replace the weak structure with a cleaner buildable design instead of preserving bad architecture.
5. Use multi-file imports deliberately: \`importPart()\` for parts, \`importSketch()\` for sketches or SVGs, explicit \`paramOverrides\`, and \`.withReferences()\` plus \`.placeReference()\` for reusable placement.
6. Use notebooks when the task benefits from stateful iteration, iterative development or debugging; remember cells share state, \`show()\` pins visible geometry, and notebooks can be exported to plain \`.forge.js\`. You can later convert it to a forge.js file.
7. Validate quickly through the CLI with \`npm run test-run -- <file>\`; add \`--debug-imports\` when import chains or overrides might be wrong, then refine from the runtime result.
8. Reuse patterns from \`examples/api/\` before inventing a modeling recipe from scratch.

## Included Sources

Keep this skill self-contained by relying on the inlined source corpus below. Usually you won't need further exploration in the codebase and can directly go into the task.

${sectionedSources}
`;

writeFileSync(outputPath, skillContent);

console.log(`Wrote ${outputPath}`);
console.log(`Included ${sourceFiles.length} source files.`);

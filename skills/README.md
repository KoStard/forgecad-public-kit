# ForgeCAD Agent Skills

This folder contains the public ForgeCAD agent skill library.

The default command:

```bash
forgecad skill install
```

still installs only the self-contained `forgecad` modeling skill. To install the broader workflow library with namespaced skill names, use:

```bash
forgecad skill install --library
```

These additional skills expose more of the workflow prompts Ruben uses for planning, building, inspecting, optimizing, and documenting ForgeCAD models. Clone this repository if you want to read the source prompts directly.

| Skill | Purpose |
| --- | --- |
| [forgecad](forgecad/SKILL.md) | ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, SVG-import, assembly, and CLI workflows. Use when building or modifying ForgeCAD geometry, structuring multi-file projects, validating scripts, or using ForgeCAD export/render tooling. |
| [forgecad-api-dogfood](forgecad-api-dogfood/SKILL.md) | Build a ForgeCAD model while actively hunting for API friction — missing helpers, awkward patterns, bad defaults, verbose boilerplate. Use when asked to dogfood, stress-test the API, or build a model with the goal of improving ForgeCAD. |
| [forgecad-blockout-model](forgecad-blockout-model/SKILL.md) | Create rough high-level ForgeCAD concept models from simple primitives to explore layout, proportions, motion, and part relationships without production detail. Use when asked for a quick model sketch, blockout, spatial mockup, or intuitive low-detail 3D concept. |
| [forgecad-component-model](forgecad-component-model/SKILL.md) | Enforce the ForgeCAD Component Model when building multi-part assemblies. Parts build at origin, connectors position them, data flows down from parent. Use when building or reviewing any multi-file ForgeCAD project. |
| [forgecad-deep-dive](forgecad-deep-dive/SKILL.md) | Create a linked folder of concept one-pagers that deconstruct a ForgeCAD idea, architecture area, scientific concept, competitor capability, or future feature into a recursive concept tree. Use when the user wants a deep dive, concept book, walkthrough folder, architecture explainer, state-of-the-art analysis, or future-facing capability teardown saved under docs/temporary/projects/ or in Obsidian. |
| [forgecad-high-level-spec](forgecad-high-level-spec/SKILL.md) | Write a high-level design document (HLD) for a model, mechanism, or assembly before detailed specification or coding. Use when starting a new design, rethinking an existing one, or when the user asks to spec out, plan, or think through a model at a high level. Works backwards from requirements — defines the problem, explores alternatives, records decisions. Produces a right-sized design document for review and iteration. |
| [forgecad-image-replicator](forgecad-image-replicator/SKILL.md) | Build real ForgeCAD geometry from one or more reference images by treating images as evidence, inferring the object, then validating against both reference-matched and canonical views. |
| [forgecad-lld](forgecad-lld/SKILL.md) | Write a Low-Level Design (LLD) for a CAD model — exact dimensions, constraints, parameters, and verification criteria. Use after a High-Level Design (HLD) exists and decisions are locked, or for simple parts that don't need an HLD. The detailed design document that code implements. |
| [forgecad-make-a-model](forgecad-make-a-model/SKILL.md) | Create new ForgeCAD (.forge.js) models in the active CAD project. Handles file placement, invokes the forgecad skill for API guidance, and validates the result. |
| [forgecad-prepare-prompt](forgecad-prepare-prompt/SKILL.md) | Turn a fuzzy physical product, mechanism, or CAD artifact request into a concrete ForgeCAD build brief and a single master prompt for the modeling pass. Use when the engineering brief is incomplete, manufacturing/process choice is underspecified, or the work needs a specific operating story to avoid generic toy solutions. |
| [forgecad-project](forgecad-project/SKILL.md) | ForgeCAD project CLI workflow — creating, managing, syncing projects and files on forgecad.io. Covers init, push, pull, file operations, member management, publishing, and sharing. |
| [forgecad-render-inspect](forgecad-render-inspect/SKILL.md) | Run and interpret ForgeCAD `render inspect` bundles for model verification. Use when asked to inspect a ForgeCAD model, analyze an inspection bundle, validate collisions, wall thickness, connectivity, sections, masks, depth, normals, or choose inspection channels. |
| [forgecad-visual-spec](forgecad-visual-spec/SKILL.md) | Turn a concrete ForgeCAD artifact, build brief, HLD, or existing model into builder-honest image prompts for AI image models. Use when the user wants visual-spec renders that show the final product while keeping mechanisms, seams, hardware, and build cues visible instead of drifting into concept art. |

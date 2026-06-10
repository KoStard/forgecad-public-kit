# ForgeCAD Agent Skills

This folder contains the public ForgeCAD agent skill library.

The default command:

```bash
forgecad skill install
```

installs the self-contained `forgecad` modeling skill plus the broader workflow library with namespaced skill names. To install only the core modeling skill, use:

```bash
forgecad skill install --core-only
```

These additional skills expose more of the workflow prompts Ruben uses for planning, building, inspecting, optimizing, and documenting ForgeCAD models. Clone this repository if you want to read the source prompts directly.

| Skill | Purpose |
| --- | --- |
| [forgecad](forgecad/SKILL.md) | ForgeCAD model authoring, editing, debugging, and execution guidance for .forge.js, SVG-import, assembly, and CLI workflows. |
| [forgecad-3d-reconstruction](forgecad-3d-reconstruction/SKILL.md) | Reconstruct a parametric ForgeCAD model from an existing 3D CAD or mesh file such as STL, OBJ, 3MF, STEP, or STP; inspect the source asset directly, author real ForgeCAD geometry, and iteratively compare the candidate with `forgecad compare 3d`. |
| [forgecad-blockout-model](forgecad-blockout-model/SKILL.md) | Create rough high-level ForgeCAD concept models from simple primitives to explore layout, proportions, motion, and part relationships without production detail. Use when asked for a quick model sketch, blockout, spatial mockup, or intuitive low-detail 3D concept. |
| [forgecad-component-model](forgecad-component-model/SKILL.md) | Enforce the ForgeCAD Component Model when building multi-part assemblies. Parts build at origin, connectors position them, data flows down from parent. Use when building or reviewing any multi-file ForgeCAD project. |
| [forgecad-high-level-spec](forgecad-high-level-spec/SKILL.md) | Write a high-level design document (HLD) for a model, mechanism, or assembly before detailed specification or coding. Use when starting a new design, rethinking an existing one, or when the user asks to spec out, plan, or think through a model at a high level. Works backwards from requirements — defines the problem, explores alternatives, records decisions. Produces a right-sized design document for review and iteration. |
| [forgecad-image-replicator](forgecad-image-replicator/SKILL.md) | Build real ForgeCAD geometry from one or more reference images by treating images as evidence, inferring the object, then validating against both reference-matched and canonical views. |
| [forgecad-lld](forgecad-lld/SKILL.md) | Write a Low-Level Design (LLD) for a CAD model — exact dimensions, constraints, parameters, and verification criteria. Use after a High-Level Design (HLD) exists and decisions are locked, or for simple parts that don't need an HLD. The detailed design document that code implements. |
| [forgecad-make-a-model](forgecad-make-a-model/SKILL.md) | Create manufacture-realistic prototype ForgeCAD (.forge.js) models in the active CAD project. Handles file placement, invokes the forgecad skill for API guidance, and validates the result. |
| [forgecad-model-grader](forgecad-model-grader/SKILL.md) | Analyze, verify, and grade ForgeCAD or CAD-as-code models against a user requirement, design brief, prompt, reference, or acceptance criteria. Use when asked to evaluate, judge, QA, benchmark, score, rate, or compare a CAD model; render it from multiple angles, run targeted inspections when needed, visually verify the evidence, and produce a 0-10 score with concise justification. |
| [forgecad-prepare-prompt](forgecad-prepare-prompt/SKILL.md) | Turn a fuzzy physical product, mechanism, or CAD artifact request into a concrete manufacture-realistic prototype ForgeCAD build brief and a single master prompt for the modeling pass. Use when the engineering brief is incomplete, manufacturing/process choice is underspecified, or the work needs a specific operating story to avoid generic toy solutions. |
| [forgecad-project](forgecad-project/SKILL.md) | ForgeCAD project CLI workflow — creating, managing, syncing projects and files on forgecad.io. Covers init, push, pull, file operations, member management, publishing, and sharing. |
| [forgecad-reconstruction-benchmark](forgecad-reconstruction-benchmark/SKILL.md) | Solve ForgeCAD CAD reconstruction benchmark or RL episodes in a prepared workspace by rebuilding a visible reference asset as readable parametric ForgeCAD in the fixed submission path, using visual and geometric self-checks while respecting sandbox limits. |
| [forgecad-render-inspect](forgecad-render-inspect/SKILL.md) | Run and interpret ForgeCAD inspection bundles for model verification. Use when asked to inspect a ForgeCAD model, analyze an inspection bundle, validate collisions, wall thickness, connectivity, floating bodies, sections, masks, depth, normals, or Zebra stripes. |
| [forgecad-visual-spec](forgecad-visual-spec/SKILL.md) | Turn a concrete ForgeCAD artifact, build brief, HLD, or existing model into builder-honest image prompts for AI image models. Use when the user wants visual-spec renders that show the final product while keeping mechanisms, seams, hardware, and build cues visible instead of drifting into concept art. |

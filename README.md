# ForgeCAD Public Kit

![Robot Hand V2](<https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/Robot%20Hand%20V2.gif>)

Public examples, agent skills, docs links, and issue tracking for ForgeCAD.

ForgeCAD is code-first parametric CAD for JavaScript/TypeScript: a normal `.forge.js` file becomes a live model with parameters, assemblies, validation, renders, inspections, and exports.

This repository is the public companion kit. It is intentionally focused on assets people can use directly: example models, installable agent skills, public issues, docs links, and historical benchmark artifacts.

TypeScript is the file format. The browser is the CAD system.

[**Try ForgeCAD**](https://forgecad.io) • [Docs](https://forgecad.io/docs) • [Examples](examples) • [Agent skills](skills/README.md) • [Open an issue](https://github.com/KoStard/forgecad-public-kit/issues)

## Start Here

| If you want to... | Go here |
| --- | --- |
| Use the CAD app | [forgecad.io](https://forgecad.io) |
| Learn the API | [Docs](https://forgecad.io/docs) |
| Run example models | [`examples/`](examples) |
| Install agent workflows | [`skills/`](skills/README.md) |
| Report a bug or request an API | [Issues](https://github.com/KoStard/forgecad-public-kit/issues) |
| Check commercial terms | [Pricing](https://forgecad.io/pricing) |

## Repository Scope

| This public kit contains | The hosted product contains |
| --- | --- |
| Ready-to-run `.forge.js` examples | Browser workbench and project storage |
| Agent skills and workflow prompts | Core app source and infrastructure |
| Public bug reports and feature requests | Account, billing, and usage systems |
| Historical benchmark artifacts | Product roadmap execution and customer projects |

The npm package, CLI, hosted app, and backend/application usage are governed by ForgeCAD's product terms. This public kit itself is MIT licensed.

## Get Started

Install the CLI:

```bash
npm install -g forgecad
```

Start from the hosted starter project:

```bash
forgecad login
forgecad project clone start-here
cd start-here
forgecad studio .
```

`forgecad login` guides you through email/password or API-token sign-in. Choose API token for GitHub/Google accounts.

A ForgeCAD project is a dedicated local folder linked to the hosted app by `forgecad.json`. Use `forgecad project clone <slug>` to download an existing project, or run `forgecad project init` inside a folder you want to make into a new ForgeCAD project.

Create a new project locally:

```bash
mkdir spool-adapter
cd spool-adapter
forgecad project init "Spool Adapter" --visibility private
forgecad new adapter --template part
forgecad studio .
```

Do not point `forgecad studio` at your home directory, downloads folder, desktop, or a huge source tree. It requires an explicit project path; use `.` for the current project folder.

Explore the public examples locally:

```bash
git clone https://github.com/KoStard/forgecad-public-kit.git
cd forgecad-public-kit
forgecad studio examples
forgecad run examples/products/cup.forge.js
forgecad render 3d examples/products/cup.forge.js
```

Open more than one local project at once:

```bash
forgecad studio examples path/to/another-project
```

## First Script

Inside a cloned or initialized ForgeCAD project, drop this into `starter.forge.js`:

```javascript
const width = Param.number("Width", 90, { min: 50, max: 160, unit: "mm" });
const depth = Param.number("Depth", 56, { min: 32, max: 100, unit: "mm" });
const height = Param.number("Height", 12, { min: 6, max: 32, unit: "mm" });
const holeRadius = Param.number("Hole Radius", 5, { min: 2, max: 10, unit: "mm" });

const base = box(width, depth, height).color("#5f87c6");
const hole = cylinder(height * 3, holeRadius).translate(0, 0, -height);

return {
  "starter plate": base.subtract(hole),
};
```

Then run:

```bash
forgecad run starter.forge.js
forgecad studio .
```

## Repository Contents

This repository is ForgeCAD's public companion kit for:

- **Issues and discussion** — bugs, feature requests, questions, and public roadmap input.
- **Examples** — ready-to-run `.forge.js` scripts under [`examples/`](examples).
- **Agent skills** — the generated ForgeCAD modeling skill plus companion workflows under [`skills/`](skills/README.md).
- **Benchmarks** — examples of how current language models handle code-first CAD prompts.
- **Docs links** — full user documentation lives at [forgecad.io/docs](https://forgecad.io/docs).

If there is a component you want opened up sooner, [file an issue](https://github.com/KoStard/forgecad-public-kit/issues).

## Examples To Try

| Area | Start here |
| --- | --- |
| API basics | [`examples/api/boolean-operations.forge.js`](examples/api/boolean-operations.forge.js), [`examples/api/constrained-sketch-basics.forge.js`](examples/api/constrained-sketch-basics.forge.js) |
| Assemblies | [`examples/api/static-assembly-connectors.forge.js`](examples/api/static-assembly-connectors.forge.js), [`examples/mechanical/5-finger-robot-hand.forge.js`](examples/mechanical/5-finger-robot-hand.forge.js) |
| Exact and surface workflows | [`examples/api/exact-surface-studio.forge.js`](examples/api/exact-surface-studio.forge.js), [`examples/exact-arc-housing.forge.js`](examples/exact-arc-housing.forge.js) |
| Generative forms | [`examples/generative/voronoi-lampshade.forge.js`](examples/generative/voronoi-lampshade.forge.js), [`examples/api/sdf-shapes.forge.js`](examples/api/sdf-shapes.forge.js) |
| Products | [`examples/products/chess-set.forge.js`](examples/products/chess-set.forge.js), [`examples/products/classical-piano.forge.js`](examples/products/classical-piano.forge.js) |
| Solver cases | [`examples/constraints/`](examples/constraints), [`examples/compiler-corpus/`](examples/compiler-corpus) |

## CLI Workflows

| Task | Command |
| --- | --- |
| Clone a hosted project | `forgecad project clone <slug>` |
| Create a new hosted project from the current folder | `forgecad project init "Project Name"` |
| Open one or more local projects | `forgecad studio <project-path> [project-path ...]` |
| Validate a script | `forgecad run file.forge.js` |
| Render a PNG | `forgecad render 3d file.forge.js` |
| Inspect a model | `forgecad inspect collisions file.forge.js` |
| Render a section | `forgecad render section file.forge.js --plane XZ` |
| Export STL | `forgecad export stl file.forge.js` |
| Export STEP | `forgecad export step file.forge.js` |
| Sweep parameters | `forgecad check params file.forge.js --samples 10` |

`forgecad project init` creates the remote project, writes `forgecad.json`, and uploads local source files. `forgecad project push` syncs an already initialized project; it does not create a remote project from a random folder.

Run `forgecad doctor` if render or exact export dependencies need checking.

## AI And Agent Workflows

ForgeCAD is built to work well with coding agents because CAD models are just code. The strongest loop is:

```text
agent edits .forge.js -> forgecad run -> forgecad inspect <evidence> -> iterate
```

The full setup, approved model list, installed skills, flattened skill files, and completion criteria are in the [AI Usage guide](https://forgecad.io/docs/ai-usage).

Install the ForgeCAD public skill library:

```bash
forgecad skill install
```

That installs the core `forgecad` skill plus public workflow skills such as `forgecad-make-a-model`, `forgecad-render-inspect`, and `forgecad-lld` into `~/.agents/skills`. Use `--target` when you want to update a different agent location:

```bash
forgecad skill install --target claude    # ~/.claude/skills
forgecad skill install --target codex     # ~/.codex/skills
forgecad skill install --target opencode  # ~/.config/opencode/skills
```

The library includes public prompts for:

- build-brief preparation with [`forgecad-prepare-prompt`](skills/forgecad-prepare-prompt/SKILL.md)
- model authoring with [`forgecad-make-a-model`](skills/forgecad-make-a-model/SKILL.md)
- component discipline with [`forgecad-component-model`](skills/forgecad-component-model/SKILL.md)
- high-level and low-level design with [`forgecad-high-level-spec`](skills/forgecad-high-level-spec/SKILL.md) and [`forgecad-lld`](skills/forgecad-lld/SKILL.md)
- render-bundle verification with [`forgecad-render-inspect`](skills/forgecad-render-inspect/SKILL.md)
- visual prompt generation with [`forgecad-visual-spec`](skills/forgecad-visual-spec/SKILL.md)

The generated core modeling skill is checked in at [`skills/forgecad/SKILL.md`](skills/forgecad/SKILL.md). The full public skill index is [`skills/README.md`](skills/README.md).

Start the agent inside the initialized project folder and require command evidence:

```text
Use the ForgeCAD skills. Work in this project folder. Build real ForgeCAD
geometry, validate with forgecad run, render or inspect the result, run
parameter checks when relevant, and push with forgecad project push when done.
```

For chat tools without local shell access, generate a single context file:

```bash
forgecad skill one-file ~/Desktop/forgecad-context.md
```

<!-- BENCHMARKS:START -->
## LLM Benchmarks

Historical benchmark archive only. These rows are not recommendations and are not the approved model list. For current supported AI workflows, use the approved models in the [AI Usage guide](https://forgecad.io/docs/ai-usage).

Latest benchmark iterations from `ForgeCADBenchmark/results/*` (`version_{n}.forge.js` with highest `n` per run folder).

| model name | prompt | GIF |
| --- | --- | --- |
| `3dprinter-gpt52codex`<br><sub>2026-02-13 14-36-06 • v2</sub> | Make a detailed home 3D printer, showing the internal details of how it should work. Add some params for controlling positions, etc. | ![3dprinter-gpt52codex](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/3dprinter-gpt52codex-2026-02-13-14-36-06-v2.gif) |
| `amazon-nova-2-lite-v1`<br><sub>2026-02-13 00-15-44 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![amazon-nova-2-lite-v1](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/amazon-nova-2-lite-v1-2026-02-13-00-15-44-v1.gif) |
| `amazon-nova-premier-v1`<br><sub>2026-02-13 00-36-50 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | _GIF generation failed (script runtime error)._ |
| `aurora_alpha`<br><sub>2026-02-12 15-19-30 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | _GIF generation failed (script runtime error)._ |
| `bytedance-seed-seed-1.6`<br><sub>2026-02-13 00-14-02 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![bytedance-seed-seed-1.6](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/bytedance-seed-seed-1.6-2026-02-13-00-14-02-v3.gif) |
| `deepseek-deepseek-v3.2`<br><sub>2026-02-13 00-30-04 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![deepseek-deepseek-v3.2](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/deepseek-deepseek-v3.2-2026-02-13-00-30-04-v3.gif) |
| `gemini3flash`<br><sub>2026-02-12 23-53-27 • v5</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![gemini3flash](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/gemini3flash-2026-02-12-23-53-27-v5.gif) |
| `glm5`<br><sub>2026-02-12 14-58-52 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![glm5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/glm5-2026-02-12-14-58-52-v3.gif) |
| `glm5`<br><sub>2026-02-12 23-04-12 • v4</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![glm5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/glm5-2026-02-12-23-04-12-v4.gif) |
| `google-gemini-3-pro-preview`<br><sub>2026-02-13 00-36-12 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![google-gemini-3-pro-preview](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/google-gemini-3-pro-preview-2026-02-13-00-36-12-v2.gif) |
| `gpt52codex`<br><sub>2026-02-13 00-04-30 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![gpt52codex](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/gpt52codex-2026-02-13-00-04-30-v2.gif) |
| `gpt52codex`<br><sub>2026-02-13 12-40-31 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Include as many details as you safely can. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![gpt52codex](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/gpt52codex-2026-02-13-12-40-31-v2.gif) |
| `haiku_4_5`<br><sub>2026-02-12 21-49-51 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![haiku_4_5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/haiku_4_5-2026-02-12-21-49-51-v1.gif) |
| `haiku_4_5`<br><sub>2026-02-12 21-54-22 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![haiku_4_5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/haiku_4_5-2026-02-12-21-54-22-v3.gif) |
| `kimi25`<br><sub>2026-02-12 13-50-22 • v4</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![kimi25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/kimi25-2026-02-12-13-50-22-v4.gif) |
| `kimi25`<br><sub>2026-02-12 14-58-53 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![kimi25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/kimi25-2026-02-12-14-58-53-v3.gif) |
| `manual-gemini-flash`<br><sub>2026-02-12 23-44-23 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![manual-gemini-flash](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/manual-gemini-flash-2026-02-12-23-44-23-v3.gif) |
| `minimax25`<br><sub>2026-02-12 14-32-24 • v5</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![minimax25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/minimax25-2026-02-12-14-32-24-v5.gif) |
| `minimax25`<br><sub>2026-02-12 23-05-17 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![minimax25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/minimax25-2026-02-12-23-05-17-v3.gif) |
| `minimax25`<br><sub>2026-02-13 12-37-52 • v4</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![minimax25](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/minimax25-2026-02-13-12-37-52-v4.gif) |
| `openai-gpt-oss-120b`<br><sub>2026-02-13 00-38-15 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![openai-gpt-oss-120b](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/openai-gpt-oss-120b-2026-02-13-00-38-15-v1.gif) |
| `opus_4_6`<br><sub>2026-02-13 11-47-54 • v5</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![opus_4_6](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/opus_4_6-2026-02-13-11-47-54-v5.gif) |
| `prime-intellect-intellect-3`<br><sub>2026-02-13 00-31-28 • v1</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![prime-intellect-intellect-3](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/prime-intellect-intellect-3-2026-02-13-00-31-28-v1.gif) |
| `qwen3.5-397b-a17b`<br><sub>2026-02-16 14-29-22 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![qwen3.5-397b-a17b](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/qwen3.5-397b-a17b-2026-02-16-14-29-22-v3.gif) |
| `qwen3maxthinking`<br><sub>2026-02-12 23-16-41 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![qwen3maxthinking](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/qwen3maxthinking-2026-02-12-23-16-41-v2.gif) |
| `robot-hand-gpt52codex`<br><sub>2026-02-14 00-51-41 • v1</sub> | Make a fully functional robot hand. Should be easy to build, maybe even at home with some good tools. Show all the mechanics. Should be able to hold arbitrary shape objects. Don't be a perfectionist, but be an artist and an engineer. As this is a complex task, break it down to simpler ones, solve them, combine, iterate. | ![robot-hand-gpt52codex](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/robot-hand-gpt52codex-2026-02-14-00-51-41-v1.gif) |
| `sonnet_4_5`<br><sub>2026-02-12 21-58-26 • v3</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![sonnet_4_5](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/sonnet_4_5-2026-02-12-21-58-26-v3.gif) |
| `x-ai-grok-4.1-fast`<br><sub>2026-02-13 00-26-36 • v2</sub> | Make a home AC unit, showing both pieces on different sides of the wall (inside and outside). The external piece should have a fan positioned on its external face vertically. Implement whatever features/methods you are missing in the script itself for your convenience. Use the simpler primitives when unsure. | ![x-ai-grok-4.1-fast](https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/benchmarks/x-ai-grok-4.1-fast-2026-02-13-00-26-36-v2.gif) |
<!-- BENCHMARKS:END -->

## Capability Snapshot

- Browser CAD workbench with Monaco editing, live parameters, and a real-time 3D viewport.
- Code-first modeling API for primitives, sketches, booleans, transforms, offsets, constraints, patterns, and SDF/level-set workflows.
- Named shapes, face/edge references, fillet/chamfer helpers, geometry inspection, dimensions, BOMs, and report-oriented annotations.
- Assembly modeling with parts, connectors, joints, coupled motion, and collision/clearance checks.
- CLI validation, parameter sweeps, viewport renders, inspection bundles, mesh export, exact export workflows, and project sync.
- Agent context that can be installed locally or inspected directly from this repository.

## Documentation

Full documentation is available at [forgecad.io/docs](https://forgecad.io/docs). Useful starting points:

- [Welcome guide](https://forgecad.io/docs/welcome)
- [API reference](https://forgecad.io/docs/core)
- [CLI reference](https://forgecad.io/docs/cli)
- [Public examples](examples)
- [Agent skills](skills/README.md)

## License

This public kit is available under the [MIT License](LICENSE). The ForgeCAD npm package, CLI, hosted app, and commercial/backend usage are covered separately by ForgeCAD's product terms and pricing at [forgecad.io/pricing](https://forgecad.io/pricing).

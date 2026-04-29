# ForgeCAD

![Robot Hand V2](<https://raw.githubusercontent.com/KoStard/ForgeCAD-assets/main/Robot%20Hand%20V2.gif>)

Code-first parametric CAD for JavaScript/TypeScript, in the browser and CLI.

ForgeCAD is a multi-backend CAD system with a JavaScript/TypeScript modeling API, live parameters, constraints, assemblies, reports, and exact STEP/BREP export. Interactive browser modeling currently uses [Manifold](https://github.com/elalish/manifold) for fast geometry work, while exact export runs through CadQuery/OpenCascade and the public modeling layer stays backend-aware rather than tied to one kernel.

TypeScript is the file format. The browser is the CAD system.

[**Try it live →**](https://forgecad.io) • [Docs](https://forgecad.io/docs) • [Examples](examples) • [Agent Skill](skills/forgecad/SKILL.md)

## Get Started

```bash
npm install -g forgecad
forgecad studio /path/to/your/project
```

Or start from a blank scratch file:

```bash
forgecad studio --blank
```

## About This Repository

This is ForgeCAD's **community home** — the place to file issues, follow development, explore benchmarks, and find maintained examples, docs links, and agent context.

Active development happens in a private repository so we can move fast and iterate freely. This public repository is intentionally small: it keeps the user-facing examples and agent context fresh without exposing the private implementation. As the project matures, we plan to progressively open-source more components of the codebase here. If you have something specific you'd like to see opened up, [open an issue](https://github.com/KoStard/ForgeCAD/issues) — community input directly shapes what we prioritize.

### What lives here

- **Issues & discussions** — bug reports, feature requests, and questions ([open an issue](https://github.com/KoStard/ForgeCAD/issues))
- **LLM benchmarks** — how well do different models handle code-first CAD?
- **Examples** — ready-to-run `.forge.js` scripts you can learn from and adapt
- **Agent skill** — generated ForgeCAD modeling context in [`skills/forgecad/`](skills/forgecad/SKILL.md)
- **Documentation** — available at [forgecad.io/docs](https://forgecad.io/docs)

## Your First Script

Drop this into a `.forge.js` file:

```javascript
const width = param("Width", 120, { min: 60, max: 220, unit: "mm" });
const depth = param("Depth", 80, { min: 40, max: 160, unit: "mm" });
const height = param("Height", 12, { min: 6, max: 40, unit: "mm" });

const base = roundedRect(width, depth, 10).extrude(height).color("#5f87c6");
const pocket = roundedRect(width - 24, depth - 24, 8)
  .extrude(height - 3)
  .translate(12, 12, 3);

const part = base.subtract(pocket);

dim([0, 0, 0], [width, 0, 0], { label: "Width" });
dim([0, 0, 0], [0, depth, 0], { label: "Depth", offset: 14 });
cutPlane("Center Section", [1, 0, 0], width / 2);

return part;
```

The Forge API is globally available inside scripts — no imports required. `param(...)` values become live sliders in the UI.

## Seamless AI Integration

ForgeCAD is built to work cleanly with coding agents. Your CAD models are plain code, and the repository includes the context agents need to be productive immediately:

- [Full API docs](https://forgecad.io/docs) explain the modeling API and workflows
- `examples/api/` provides concrete model patterns to copy and adapt
- Browser + CLI run the same engine, so AI-generated scripts behave consistently

### Agent skill (Claude Code, Codex, OpenCode, …)

Install a self-contained ForgeCAD skill for coding agents:

```bash
forgecad skill install        # model-authoring docs
forgecad skill install --dev  # + internals and coding conventions
forgecad skill install --library  # + namespaced companion workflow skills
```

This repository also includes the generated public modeling skill at [`skills/forgecad/SKILL.md`](skills/forgecad/SKILL.md), with the referenced docs checked in beside it.

### Expanded skill library

People often ask for the exact prompts and workflows used to produce ForgeCAD models. Those live in [`skills/`](skills/README.md).

The default `forgecad skill install` command stays intentionally small and installs only the core `forgecad` modeling skill. Use `forgecad skill install --library` to install the broader workflow set with namespaced skill names such as `forgecad-prepare-prompt`, `forgecad-make-a-model`, and `forgecad-lld`. You can also clone this repository to read the source prompts directly:

- build-brief preparation with [`prepare-forgecad-prompt`](skills/prepare-forgecad-prompt/SKILL.md)
- model authoring with [`make-a-model`](skills/make-a-model/SKILL.md)
- component discipline with [`component-model`](skills/component-model/SKILL.md)
- render-bundle verification with [`forgecad-render-inspect`](skills/forgecad-render-inspect/SKILL.md)
- visual prompt generation with [`forgecad-visual-spec`](skills/forgecad-visual-spec/SKILL.md)

### Chat UI (Claude.ai, ChatGPT, Gemini, …)

Generate a single context file with all ForgeCAD API docs for any chat session:

```bash
forgecad skill one-file ~/Desktop/forgecad-context.md
```

<!-- BENCHMARKS:START -->
## LLM Benchmarks

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

## Highlights

- Browser CAD IDE with Monaco editor + real-time 3D viewport
- 2D sketch API: primitives, path builder, booleans, transforms, offsets, constraints
- 3D API: booleans, transforms, hull, level set/SDF workflows, cut planes
- Named shapes, face/edge references, fillet/chamfer helpers
- Reusable part library with fasteners, tubes, brackets, threads, patterns, exploded-view helpers
- Assembly graph API with revolute/prismatic/fixed joints and joint couplings
- Drawing/report pipeline: dimensions, BOM, multi-view PDF generation
- CLI tools that run the same engine as the browser runtime

## CLI Workflows

| Task | Command |
| --- | --- |
| Validate a script | `forgecad run file.forge.js` |
| Render PNG views | `forgecad render file.forge.js` |
| Render orbit GIF | `forgecad capture gif file.forge.js` |
| Export sketch SVG | `forgecad export svg file.forge.js` |
| Export exact STEP | `forgecad export step file.forge.js` |
| Generate report PDF | `forgecad export report file.forge.js` |
| Parameter robustness scan | `forgecad check params file.forge.js --samples 10` |

## Documentation

Full documentation is available at [forgecad.io/docs](https://forgecad.io/docs).

## License

[Business Source License 1.1](LICENSE) — free for non-production use. Converts to MIT on the change date. See [LICENSE](LICENSE) for details.

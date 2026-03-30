# ForgeCAD Benchmark — Vision-Based 3D Reconstruction

An AI benchmark that measures how well language models can reproduce 3D geometry from reference images.

## How it works

1. **Reference model** — A `.forge.js` file defines the ground-truth 3D geometry
2. **Preparation** — Multi-angle images are rendered and reference metrics are computed
3. **Agentic loop** — The AI sees the reference images, writes ForgeCAD code, receives spatial scores and comparison renders, and iterates
4. **Scoring** — The candidate model is compared to the reference using:
   - **3D IoU** (50%) — volumetric intersection-over-union (the gold standard)
   - **Volume match** (20%) — how close the total volume is
   - **Bounding box match** (15%) — how close the overall dimensions are
   - **Surface area match** (15%) — how close the surface complexity is

## Quick start

```bash
# 1. Prepare a challenge from any .forge.js model
node bench/prepare.mjs examples/cup.forge.js cup --difficulty easy

# 2. Score a single solution
node bench/score.mjs bench/challenges/cup my-solution.forge.js

# 3. Run the full agentic loop with an LLM
ANTHROPIC_API_KEY=... node bench/runner.mjs \
  --challenge bench/challenges/cup \
  --model claude-sonnet-4-20250514 \
  --iterations 5

# 4. Run all challenges
ANTHROPIC_API_KEY=... node bench/runner.mjs --all --model claude-sonnet-4-20250514
```

## Directory structure

```
bench/
  prepare.mjs            # Prepare a challenge from a reference model
  score.mjs              # Score a candidate solution against reference
  runner.mjs             # Agentic LLM loop with vision
  api-reference.md       # ForgeCAD API docs given to the LLM
  challenges/            # Benchmark challenges
    <name>/
      reference.forge.js # Ground-truth model
      config.json        # Challenge metadata
      prepared/
        metrics.json     # Reference volume, bbox, surface area
        views/           # Multi-angle reference renders (front, right, top, iso)
  results/               # Run results (gitignored)
    <run-id>/
      summary.json
      best-solution.forge.js
      iterations/
        0/
          code.forge.js
          score.json
          llm-response.txt
          views/           # Candidate renders for comparison
```

## Validators

The scoring system uses spatial validators that compare the candidate mesh to the reference:

| Validator | Weight | What it measures |
|-----------|--------|------------------|
| 3D IoU | 50% | Volumetric overlap after centering both shapes |
| Volume | 20% | Ratio of smaller/larger volume |
| Bounding box | 15% | Dimension similarity (orientation-independent) |
| Surface area | 15% | Surface complexity similarity |

The 3D IoU is the most meaningful metric — it directly measures how much the two shapes overlap in 3D space. A perfect cube will score poorly against a perfect sphere even if they have similar volumes.

Future validators will include functional tests (e.g., does this bolt actually fit through this hole).

## Adding challenges

```bash
# From an existing example
node bench/prepare.mjs examples/bottle.forge.js bottle --difficulty hard

# From a custom model
node bench/prepare.mjs path/to/my-model.forge.js my-challenge --difficulty medium
```

The `prepare` step renders reference images (requires Chrome/Puppeteer). If rendering isn't available, you can add images manually to `bench/challenges/<name>/prepared/views/`.

## Providers

- `--provider anthropic` (default) — uses `ANTHROPIC_API_KEY`
- `--provider openrouter` — uses `OPENROUTER_API_KEY`, supports any model via OpenRouter

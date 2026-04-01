---
name: investigate
description: Structured investigation process for optimization, debugging, and architecture exploration. Use when running multi-experiment work with measurable outcomes — solver tuning, performance profiling, rendering issues, architecture trade-off analysis. Guides creation and maintenance of a project document under docs/temporary/projects/.
---

# Investigation Projects

Run structured investigations with measurable experiments, preserved findings, and a living document that captures both successes and failures.

## When to Use This

- Performance optimization with measurable metrics
- Debugging complex or non-obvious systems (solver convergence, rendering, constraint propagation)
- Architecture exploration with trade-off analysis
- Any investigation that runs multiple experiments

**Not for**: simple bug fixes, feature implementation with a clear path, one-shot changes.

## Workflow

1. **Create the project document** at `docs/temporary/projects/YYYY/MM/DD/<project-slug>/PLAN.md`. Use today's date and a descriptive kebab-case slug.
2. **Establish a baseline** — measure current state before touching anything. Record it as row `—` in the Progress Tracker.
3. **One change at a time** — isolate variables so you know what caused each result.
4. **Update the doc as you go** — not at the end. Keep the Progress Tracker and Experiment Log current after each experiment.
5. **Commit at milestones** — each proven improvement gets its own commit. Don't batch up unverified changes.
6. **Document failures** — they're the most valuable part. Future work depends on knowing what didn't work and why.

## Project Document Structure

```
docs/temporary/projects/YYYY/MM/DD/<project-slug>/
├── PLAN.md        # Main document — plan, experiments, results
└── ...            # Supporting files (data, scripts, etc.) if needed
```

### PLAN.md Sections

**Goal & Current State** — what you're trying to achieve and the measured baseline.

**Architecture Summary** — enough context for someone unfamiliar to follow the experiments.

**Progress Tracker** — one row per experiment:

```markdown
| # | Change | Metric A | Metric B | Status |
|---|--------|----------|----------|--------|
| — | Baseline | 3022ms | 0.0001 | ✅ |
| P1 | Early exit | 626ms | 0.0000 | ✅ 5× faster |
```

**Experiment Log** — for every experiment, including failures:

```markdown
#### Experiment Name (SUCCESS / FAILED)
**What**: What you changed.
**Result**: Measured outcome.
**Why it worked/failed**: Root cause analysis.
**Lesson**: What to carry forward.
```

**Files Modified** — table of files touched and their purpose.

## Source

Read the full process guide before starting:

- `docs/processes/AI_INVESTIGATION_PROJECTS.md`

## Key Principles

- Measure first — baseline before any change
- One change at a time — isolate variables
- Document failures — they prevent future teams from repeating mistakes
- Keep the doc alive — update it as experiments run, not at the end

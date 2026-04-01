# AI Investigation Projects — Process Guide

When an AI agent (or human) runs a structured investigation — optimization, debugging, architecture exploration — the work should be captured in a **project document** under `docs/temporary/projects/`.

This process ensures findings are preserved, experiments are reproducible, and other team members can follow the same approach.

---

## Directory Structure

```
docs/temporary/projects/YYYY/MM/DD/<project-slug>/
├── PLAN.md              # Main document (plan, experiments, results)
├── README.md            # Optional: summary for quick orientation
└── ...                  # Supporting files (data, scripts, etc.)
```

- **YYYY/MM/DD** — date the project started
- **project-slug** — kebab-case name (e.g., `constraint-solver-optimization`)

## What Goes in the Project Document

A project document should capture **the full investigation lifecycle**:

### 1. Goal & Current State
What are you trying to achieve? What's the baseline?

### 2. Architecture Summary
Brief description of the system being investigated. Enough context for someone unfamiliar to follow the experiments.

### 3. Progress Tracker
A table showing each experiment/change and its measured result:

```markdown
| # | Change | Metric A | Metric B | Status |
|---|--------|----------|----------|--------|
| — | Baseline | 3022ms | 0.0001 | ✅ |
| P1 | Early exit | 626ms | 0.0000 | ✅ 5× faster |
```

### 4. Experiment Log
For **every** experiment — including failures:

```markdown
#### Experiment Name (SUCCESS/FAILED)
**What**: What you changed.
**Result**: Measured outcome.
**Why it worked/failed**: Root cause analysis.
**Lesson**: What to learn from this.
```

Failed experiments are as valuable as successes — they prevent future teams from repeating mistakes.

### 5. Files Modified
Table of files touched and their purpose.

---

## When to Use This Process

- Performance optimization with measurable metrics
- Debugging complex systems (solver convergence, rendering issues, etc.)
- Architecture exploration with trade-off analysis
- Any investigation that runs multiple experiments

## When NOT to Use This

- Simple bug fixes (just commit with a good message)
- Feature implementation with a clear path (use task files instead)
- One-shot changes that don't need experimentation

## Key Principles

1. **Measure first** — establish a baseline before changing anything
2. **One change at a time** — isolate variables to know what worked
3. **Document failures** — they're the most valuable part of the log
4. **Commit at milestones** — don't lose progress; iterative commits at each proven improvement
5. **Verify quality** — run the full test suite after every change, not just the target metric
6. **Keep the doc alive** — update it as you go, not at the end

## Example Projects

- [`2026/03/18/constraint-solver-optimization/`](../temporary/projects/2026/03/18/constraint-solver-optimization/SOLVER_IMPROVEMENT_PLAN.md) — 12.8× solver speedup through early exit, forward-difference Jacobian, and sparse Jacobian computation

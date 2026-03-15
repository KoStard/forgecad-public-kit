# Compiler Regression Corpus
## Problem Definition
The compiler has snapshots and invariants, but the curated part corpus is still smaller than the feature ambition. Without a richer regression corpus, feature agents can regress multi-step part workflows without noticing until much later.

## Description
Build a curated regression corpus of ordinary multi-feature mechanical parts that exercise both lowerers and exact export.

Primary files:

- `examples/api/` or a dedicated compiler corpus folder
- `cli/check-compiler.ts`
- `cli/check-brep-export.ts`
- snapshot baselines and small supporting docs

Isolation rule:

- avoid changing core query/feature semantics unless a case proves a real gap
- prefer adding reviewable failing or passing coverage

## Requirements
- Add several curated multi-feature parts, not just toy operations.
- Cover shell, workplane-driven features, booleans, mirrors/patterns, and later hole/projection families as they land.
- Keep snapshot updates reviewable and deterministic.
- Document what each corpus part is meant to guard.

## Status and log
- 2026-03-12: Ready after task 100.
- 2026-03-12: Completed. Added the curated `examples/compiler-corpus/` part set, wired those parts into the compiler and exact-export checks, kept the snapshots deterministic/reviewable, and documented what each corpus part is meant to guard.

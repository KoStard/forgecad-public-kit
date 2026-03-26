# Skill Token Bloat Investigation

## Goal

Reduce the ForgeCAD skill one-file output from **82K tokens** (306K chars) to maximize value per token. Target: ≤40K tokens without losing essential API coverage.

## Current State — Baseline

| Metric | Value |
|--------|-------|
| Total chars | 306,260 |
| Total tokens (ttok) | 81,953 |
| Source files included | 29 |

### Size Breakdown by Section (chars)

| # | Section | Chars | % | Notes |
|---|---------|-------|---|-------|
| 1 | `API/core/reference.md` | 71,647 | 23.4% | Hand-written API reference |
| 2 | `generated/api-reference.md` | 65,046 | 21.2% | Auto-generated from .d.ts |
| 3 | `CLI.md` | 31,862 | 10.4% | CLI docs — grew 5x since Feb |
| 4 | `API/assembly/assembly.md` | 20,437 | 6.7% | |
| 5 | `API/runtime/viewport.md` | 16,610 | 5.4% | |
| 6 | `API/core/topology.md` | 12,467 | 4.1% | |
| 7 | `API/output/brep-export.md` | 8,711 | 2.8% | |
| 8 | `guides/modeling-recipes.md` | 8,003 | 2.6% | |
| — | 21 other files | 71,477 | 23.3% | |
| — | **Total** | **306,260** | **100%** | |

**Top 3 files = 55% of total tokens.**

## Root Cause Analysis

### 1. Massive duplication: `reference.md` + `generated/api-reference.md` (137K chars = 45%)

Both files document the same API surface. `reference.md` is hand-written with examples and explanations. `generated/api-reference.md` is auto-extracted from type definitions — terse signatures with brief descriptions.

Functions like `box()`, `cylinder()`, `union()`, `importPart()`, sketches, etc. appear in both. The generated file adds value only for functions NOT covered in `reference.md` (e.g., lesser-known helpers, constants, enums).

**This is the single biggest opportunity.** The generated file should only contain entries NOT already in the hand-written reference.

### 2. `CLI.md` grew from 10K to 32K in 3 weeks (Mar 6–25)

Every new CLI command gets full documentation. For the skill context (aimed at model authoring), most CLI commands beyond `run`, `render`, `notebook`, `capture`, and `export` are noise. Commands like `dev`, `studio`, `check`, `skill`, `config`, `deploy` are developer/admin tools irrelevant to model building.

### 3. `API/runtime/viewport.md` at 17K — viewer-only APIs

Includes detailed docs for `cutPlane`, `explodeView`, `jointsView`, `animation`, camera control. For model authoring context, a condensed version covering the key patterns would suffice.

### 4. `API/assembly/assembly.md` at 20K

Assembly is legitimately complex, but some sections (like long port-based connect examples) could be condensed.

## Growth Timeline

| File | Feb 10 | Mar 7 | Mar 25 | Growth |
|------|--------|-------|--------|--------|
| `CLI.md` | 5K | 15K | 32K | **6.4x** |
| `generated/api-reference.md` | — | 52K | 65K | 1.25x |
| `reference.md` | — | 72K | 72K | stable |

CLI.md is the runaway grower. The others are large but relatively stable.

## Proposed Reductions

| # | Change | Est. savings | Risk |
|---|--------|-------------|------|
| R1 | Deduplicate generated/api-reference vs reference.md — only include entries not in reference.md | ~40K chars (~10K tokens) | Low — removes pure duplication |
| R2 | Create skill-specific CLI excerpt (run/render/notebook/export only) instead of full CLI.md | ~20K chars (~5K tokens) | Low — irrelevant commands removed |
| R3 | Condense viewport.md for skill (remove internal details, keep usage patterns) | ~8K chars (~2K tokens) | Medium — might miss edge cases |
| R4 | Trim verbose examples in assembly.md | ~5K chars (~1K tokens) | Medium |
| R5 | Trim reference.md itself — consolidate repetitive transform/boolean sections | ~10K chars (~3K tokens) | Medium |

**Conservative estimate: ~80K chars / ~20K tokens savings → ~60K token skill.**

## Progress Tracker

| # | Change | Tokens before | Tokens after | Status |
|---|--------|--------------|-------------|--------|
| — | Baseline | 81,953 | — | measured |
| J1 | Enrich JSDoc in 25 source .ts files | 81,953 | 83,513 | ✅ (grew slightly — expected) |
| R1 | Replace reference.md with skill-guide.md (concepts only) | 83,513 | 58,387 | ✅ −30% |
| R2 | Replace CLI.md with skill-cli.md (authoring commands only) | (included in R1) | (included in R1) | ✅ |
| R3 | Remove brep-export.md parity table | 58,387 | 56,429 | ✅ −3% |
| — | **Final** | **81,953** | **56,429** | **−31%** |

## Experiment Log

#### J1: Enrich JSDoc in source TypeScript files (SUCCESS)
**What**: Migrated hand-written API descriptions from reference.md into JSDoc comments across 25 source .ts files. Regenerated types and docs.
**Result**: api-reference.md grew from 65K → 72K chars with richer function descriptions (e.g. box(), loft(), importPart() now have substantive descriptions).
**Why it worked**: The gen-api-docs pipeline extracts prose from JSDoc comments. By enriching the source, the auto-generated output becomes self-sufficient.
**Lesson**: The auto-generated reference is now the single source of truth for API function docs.

#### R1+R2: Slim skill-guide.md and skill-cli.md replace reference.md and CLI.md (SUCCESS)
**What**: Created `skill-guide.md` (6K chars) with concepts, patterns, and gotchas from reference.md. Created `skill-cli.md` (3K chars) with only model-authoring CLI commands. Modified build script to use these for the one-file CONTEXT.md output only.
**Result**: 83K → 58K tokens (−30%).
**Why it worked**: reference.md (72K) was 90% API catalog now covered by enriched api-reference.md. CLI.md (32K) was 80% developer/CI tooling irrelevant to model authoring.
**Lesson**: The dev SKILL.md and installed SKILL.md still reference full docs (loaded on demand). Only the one-file paste target uses slim versions.

#### R3: Remove brep-export.md from one-file output (SUCCESS)
**What**: Excluded the BREP export parity table (9K chars) from the one-file output. Essentials are covered in export.md and skill-cli.md.
**Result**: 58K → 56K tokens (−3%).
**Lesson**: Parity tables are reference material — useful on demand but low value-per-token for the context window.

## Files Modified

| File | Purpose |
|------|---------|
| `scripts/build-forgecad-skill.mjs` | Build script that assembles the skill |
| `docs/permanent/generated/api-reference.md` | Auto-generated API index |
| `docs/permanent/CLI.md` | CLI documentation |
| `docs/permanent/API/core/reference.md` | Core API reference |
| `docs/permanent/API/runtime/viewport.md` | Viewport/runtime API |
| `docs/permanent/API/assembly/assembly.md` | Assembly API |

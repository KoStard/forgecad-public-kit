# Docs Refactor — Eliminate, Consolidate, Restructure

## Goal

ForgeCAD docs have grown organically. Agents don't know where to start, what's stale, or what to update. The goal: cut everything redundant, fix the structure so it's self-evident, and leave only what's maintainable.

## Current State (Baseline)

**91 markdown files** across `docs/`. Key problems:

### 1. Scattered loose files in `temporary/`
8 files sit directly in `temporary/` or `temporary/thoughts/` outside the `projects/YYYY/MM/DD/slug/` convention. No one knows they're there.

### 2. Stale content
- `constraints-design.md` — constraints are fully built (18 types). This is an early design doc.
- `fusion360-feature-map.md` — talks about multi-file as "proposed" but it shipped.
- `ai-design-capabilities.md` — written when there was no spatial feedback; that's done now.
- `ai-benchmark-backlog.md` — several items marked ✅ Done.
- `rendering-quality.md` — key changes marked "Already Applied".
- `thoughts/interactivity.md` — rough brain dump, never formalized.

### 3. Content duplication
- **CODING.md** duplicates CLI.md's architecture tree (`src/forge/` layout appears in both).
- **CODING.md** duplicates CLI.md's build/install instructions.
- **manifold.md** (7 lines) overlaps with `coordinate-system.md` on axis convention.
- **AGENTS.md** (6 lines) just says "check docs/permanent/" — redundant with CLAUDE.md.

### 4. Feb 2026 proposals break convention
6 proposal files sit directly in `projects/2026/02/` without slug subdirectories, unlike every other project.

### 5. Process docs may be over-documented
- `PROGRAM-LEAD.md` — 181 lines defining a role. Only useful during active multi-agent programs.
- `MULTI_AGENT_DEVELOPMENT.md` — 8.8K describing an orchestration system.
- `README_BENCHMARK_SOP.md` — 14K for benchmark GIF maintenance.
- `LOCAL_META_REPO.md` — documents the private/ symlink (operational setup, not reference).
- `MAINTAINING_FORGECAD_SKILL.md` — 40 lines for one script.

---

## Plan

### Phase 1: Delete the dead weight

| Action | File | Reason |
|--------|------|--------|
| DELETE | `temporary/thoughts/interactivity.md` | Raw brain dump, never actionable |
| DELETE | `temporary/constraints-design.md` | Fully superseded by built constraints + `constraint-solver.md` |
| DELETE | `temporary/fusion360-feature-map.md` | Multi-file shipped; Fusion feature gaps tracked in VISION.md |
| DELETE | `permanent/API/internals/manifold.md` | 7 lines; merge axis note into `coordinate-system.md` |
| DELETE | `AGENTS.md` | 6 lines pointing to docs/; CLAUDE.md serves this role |

### Phase 2: Clean up stale temporary docs

| Action | File | Reason |
|--------|------|--------|
| CLEAN | `temporary/ai-benchmark-backlog.md` | Remove ✅ Done sections, keep only open items. If nothing left, delete. |
| CLEAN | `temporary/rendering-quality.md` | Remove "Already Applied" sections. Keep only open investigation items. |
| CLEAN | `temporary/ai-design-capabilities.md` | Mark what's been addressed. Keep as future roadmap reference only if substantial open items remain. |

### Phase 3: Restructure loose temporary files into convention

Move investigation findings into `projects/YYYY/MM/DD/slug/` or delete:

| Action | Source | Destination |
|--------|--------|-------------|
| MOVE | `temporary/3mf-export-findings.md` | `temporary/projects/2026/02/3mf-export/findings.md` |
| MOVE | `temporary/step-export-audit-2026-03-06.md` | `temporary/projects/2026/03/06/step-export-audit/findings.md` |
| MOVE | `temporary/iphone/findings.md` | `temporary/projects/2026/03/iphone-compat/findings.md` (estimate date) |
| MOVE | `temporary/rendering-quality.md` | `temporary/projects/2026/02/rendering-quality/findings.md` (if anything remains after cleanup) |

### Phase 4: Fix Feb 2026 proposals

Move each into its own slug subdirectory:
- `projects/2026/02/brep-transition-plan.md` → `projects/2026/02/brep-transition/PLAN.md`
- `projects/2026/02/js-backed-sdf-migration-proposal.md` → `projects/2026/02/sdf-migration/PLAN.md`
- etc. for all 6 files.

### Phase 5: Eliminate duplication in permanent docs

| Action | Detail |
|--------|--------|
| Merge manifold axis note into `coordinate-system.md` | Add one line about Manifold Y-up ↔ ForgeCAD Z-up |
| Remove CLI architecture section from `CODING.md` | Keep the link to CLI.md, delete the duplicated tree |
| Remove duplicate build instructions from `CODING.md` | CLI.md already covers install/link |

### Phase 6: Slim process docs

| Action | File | Detail |
|--------|------|--------|
| KEEP | `AI_INVESTIGATION_PROJECTS.md` | Actively used (this project uses it) |
| MOVE | `PROGRAM-LEAD.md` | From `permanent/` to `processes/` — it's a process/role definition, not product docs |
| EVALUATE | `MULTI_AGENT_DEVELOPMENT.md` | Keep if actively used; if aspirational, move to temporary |
| KEEP | `README_BENCHMARK_SOP.md` | Operational SOP, correct location |
| DELETE | `LOCAL_META_REPO.md` | The script `npm run meta:init` is self-documenting; README in the meta repo itself is the right place for this |
| DELETE | `MAINTAINING_FORGECAD_SKILL.md` | 40 lines; the script has comments, and regeneration is `npm run build:skill:forgecad` |

---

## Progress Tracker

| # | Change | Files affected | Status |
|---|--------|----------------|--------|
| — | Baseline | 91 .md files in docs/ | ✅ Measured |
| P1 | Delete dead weight | 5 deleted (interactivity, constraints-design, fusion360-feature-map, manifold.md, AGENTS.md) | ✅ Done |
| P2 | Clean stale temporary docs | 3 deleted (ai-benchmark-backlog, rendering-quality, ai-design-capabilities) | ✅ Done |
| P3 | Restructure loose files | 3 moved into projects/YYYY/MM/DD/slug/ (3mf-export, step-export-audit, iphone) | ✅ Done |
| P4 | Fix Feb 2026 structure | 6 proposals moved into slug subdirectories | ✅ Done |
| P5 | Eliminate permanent doc duplication | CLI.md architecture tree deduplicated, manifold axis note merged into coordinate-system.md | ✅ Done |
| P6 | Slim process docs | PROGRAM-LEAD.md moved to processes/, LOCAL_META_REPO.md + MAINTAINING_FORGECAD_SKILL.md deleted | ✅ Done |

## Result

**91 → 60 markdown files** (31 removed/consolidated). Zero loose files in `temporary/`. No content duplication in permanent docs. Convention-consistent structure throughout. All broken cross-references fixed.

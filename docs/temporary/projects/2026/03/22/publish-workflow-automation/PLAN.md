# Publish Workflow Automation

## Goal

Eliminate manual publish/deploy steps so that releasing ForgeCAD is a single action (push a tag or run one command), not a checklist of 6+ manual steps across different systems.

## Current State — What Needs Publishing

| Artifact | Current Process | Automated? |
|----------|----------------|------------|
| **GitHub Pages** (web app) | Push to `mainline` triggers `deploy-pages.yml` | Yes |
| **npm package** | Manual `npm publish` (runs `prepublishOnly` hook) | No |
| **Skill files** | Built by `prepublishOnly`, installed via `forgecad skill install` | Partial (built, not distributed) |
| **API docs** | Manual `npm run gen:docs` | No |
| **WASM solver** | Built as part of `npm run build` / CI Pages build | Yes (in CI) |
| **Version bump** | Manual edit of `package.json` | No |
| **GitHub Release** | Not created at all | No |
| **Changelog** | Does not exist | No |

**Only GitHub Pages is fully automated.** Everything else requires manual steps.

## Architecture Summary

```
mainline push ──► deploy-pages.yml ──► GitHub Pages  ✅ automated

Manual steps for npm release:
  1. Edit package.json version
  2. npm publish  (triggers prepublishOnly → build + build:skill:forgecad)
  3. forgecad skill install  (local skill update)
  4. No GitHub Release created
  5. No changelog
  6. No git tag
```

## Recommended Approach: GitHub Actions Workflow + Tag-Triggered Release

### Why GitHub Actions (not a local script or AI skill)

| Option | Pros | Cons |
|--------|------|------|
| **Local script** (`forgecad release`) | Simple, immediate | Requires local Rust toolchain, runs from your machine, not reproducible, easy to forget steps |
| **AI agent skill** | Could orchestrate | Overkill for a deterministic pipeline, fragile, can't hold npm tokens safely |
| **GitHub Actions workflow** | Reproducible, runs on clean env, handles secrets (NPM_TOKEN), already have one working (Pages) | Requires initial setup of npm token as GitHub secret |

**Recommendation: GitHub Actions** — it's the standard, it's reproducible, and you already have the Pages workflow proving the WASM build works in CI.

### Proposed Workflow

**Trigger**: Push a version tag (`v*`) or manual `workflow_dispatch` with version input.

**Flow**:
```
git tag v0.1.6 && git push --tags
        │
        ▼
┌─ publish.yml ────────────────────────────────┐
│                                               │
│  1. Checkout + Node 20 + Rust + wasm-pack     │
│  2. npm ci                                    │
│  3. npm run build          (solver+ts+vite+cli)│
│  4. npm run build:skill:forgecad              │
│  5. npm run test           (full test suite)  │
│  6. npm publish            (uses NPM_TOKEN)   │
│  7. Create GitHub Release  (with auto notes)  │
│                                               │
└───────────────────────────────────────────────┘
```

**Version management**: The tag IS the version. The workflow validates that the tag matches `package.json` version (or we can have the workflow set it).

### What This Gives You

- **One action to release**: `git tag v0.1.6 && git push --tags`
- **Tests run before publish**: catches broken releases
- **npm publish from CI**: no local npm auth needed, reproducible
- **GitHub Release auto-created**: with auto-generated release notes from commits
- **Pages deploy already happens**: on the same push to mainline

### Implementation Steps

| # | Step | Effort |
|---|------|--------|
| 1 | Add `NPM_TOKEN` as GitHub repo secret | 5 min |
| 2 | Create `.github/workflows/publish.yml` | 30 min |
| 3 | Add CI test workflow (runs on PRs) | 15 min |
| 4 | Test with a dry-run publish | 10 min |
| 5 | First real release via the new workflow | 5 min |

### Optional Enhancements (Later)

- **Changelog generation** via `conventional-changelog` or GitHub's auto-release-notes
- **Version bump PR** workflow (bot opens PR to bump version)
- **Skill auto-install** post-publish hook (could be a Claude Code hook that runs after `npm install -g forgecad`)
- **PR test workflow** — run `npm test` on every PR to catch issues before merge

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Baseline (manual everything) | Documented |
| P1 | Create `publish.yml` workflow | Pending |
| P2 | Create `ci.yml` for PR tests | Pending |
| P3 | Add NPM_TOKEN secret | Pending (manual) |
| P4 | First automated release | Pending |

## Experiment Log

#### Baseline Assessment (DOCUMENTED)
**What**: Audited all publish/deploy pathways in the repo.
**Result**: Only GitHub Pages is automated. npm publish, skill distribution, version management, GitHub Releases, and changelog are all manual.
**Lesson**: The existing `deploy-pages.yml` proves the full build (including WASM) works in CI. We can reuse the same setup steps for a publish workflow.

## Files to Create/Modify

| File | Purpose |
|------|---------|
| `.github/workflows/publish.yml` | **New** — tag-triggered npm publish + GitHub Release |
| `.github/workflows/ci.yml` | **New** — PR test runner (optional but recommended) |
| `package.json` | May need minor script adjustments |

# CLI & Build Tooling Cleanup

**Date:** 2026-03-19
**Status:** Investigation — baseline established, changes pending

---

## Goal & Current State

### Goal

Eliminate the confusion between `npm run *` scripts and `forgecad *` CLI commands, remove the vite-dev-as-fallback hack from `forgecad studio`, establish clean and separate dev/prod/publish flows, and ensure the resulting system is easy for both humans and AI agents to reason about.

### Problem Statement

The repository has two overlapping systems for doing the same things:
- `npm run dev`, `npm run build`, `npm run build:cli`, `npm run test` — npm lifecycle scripts
- `forgecad studio`, `forgecad check suite` — the installed CLI

There is no documented contract about **which layer to use when**. This causes:
1. **Agent confusion**: agents reach for `npm run build:cli` or `npm run build` when they should use the CLI or vice versa.
2. **The studio fallback hack**: `forgecad studio` silently spawns a Vite dev server when `dist/` is absent — conflating dev and prod into one command.
3. **No explicit dev command**: developers who want a proper dev workflow have to know that `npm run dev` ≠ `forgecad studio` even though both launch a server for the studio UI.
4. **`forgecad web` is always dev**: `forgecad web` always spawns vite dev (no prod path), unlike `forgecad studio` which has both.
5. **Documentation gap**: `CLI.md` documents CLI commands but doesn't explain the boundary with npm scripts, or which to use in which context.

---

## Architecture Summary

### The Two Artifacts

| Artifact | Built by | Output |
|----------|----------|--------|
| Browser UI (React app) | `vite build` | `dist/` |
| CLI binary | `tsup` | `dist-cli/forgecad.js` |

The CLI binary **requires** the browser UI to be pre-built into `dist/` to serve it in production mode. The two builds are independent.

### The `forgecad studio` Fallback (the hack)

`cli/forge-studio.ts` currently does:
```ts
if (!existsSync(distDir)) {
  // dist/ missing → spawn vite dev server
  spawnPackageVite(...)
  return;
}
// dist/ present → start production HTTP server
```

This means a single command has two completely different behaviors depending on filesystem state. After `npm install` (which runs `prepare` → `build:cli`, building only the CLI, not `dist/`), calling `forgecad studio` silently gives you the dev server rather than erroring or warning. It's convenient but opaque.

### The `npm run prepare` Contract

`prepare` runs on `npm install` and builds only the CLI (`dist-cli/`). It does **not** build `dist/`. This is intentional for npm publish — consumers get a pre-built CLI — but it means a freshly-cloned dev environment has no `dist/`, which triggers the fallback.

### The `npm run prepublishOnly` Contract

`prepublishOnly` runs the full build (`tsc + vite build + build:cli + build:skill`). This is the publish path and is correct.

### Correct Command Layer by Context

The current implicit contract (not written anywhere):

| Context | Use | Don't use |
|---------|-----|-----------|
| Developing ForgeCAD itself | `npm run dev`, `npm run build` | (both are valid here) |
| Using ForgeCAD as a tool | `forgecad studio`, `forgecad check suite`, etc. | `npm run *` |
| CI / pre-publish | `npm run build`, `npm run test` | forgecad CLI (not installed in CI) |
| AI agents working in the repo | `forgecad check suite`, `forgecad studio` | `npm run build:cli` (wrong layer) |

---

## Progress Tracker

| # | Change | Dev UX | Agent correctness | Hacks removed | Status |
|---|--------|--------|-------------------|---------------|--------|
| — | Baseline | confusing | ~50% correct | 0 of 2 | — |
| C1 | Document the layer contract in CLI.md + CLAUDE.md | improved | ✅ | 0 of 2 | ✅ done |
| C2 | `forgecad studio` errors when dist/ missing | clear | ✅ | 1 of 2 | ✅ done |
| C3 | `forgecad dev` — new explicit dev-mode command | clean | ✅ | 1 of 2 | ✅ done |
| C4 | `forgecad web` alignment (dev-only, documented) | clean | ✅ | 2 of 2 | deferred — low priority, current behavior is fine |
| C5 | CLAUDE.md codifies agent contract | locked in | ✅ | — | ✅ done |

---

## Experiment Log

### Baseline (current state)

**What exists today:**
- `npm run dev` — starts Vite dev server at `localhost:5173`, loads `examples/`
- `npm run dev:blank` — same but blank workspace
- `npm run dev:cli` — tsup watch-build CLI to `dist-cli/`
- `npm run build` — full prod build: `tsc && vite build && npm run build:cli`
- `npm run build:cli` — just CLI binary
- `npm run build:web` — vite build with `FORGE_MODE=web` (GitHub Pages)
- `npm run test` — `test:prepare && node dist-cli/forgecad.js check suite`
- `npm run prepare` — `build:cli` (runs on `npm install`)
- `npm run prepublishOnly` — full build + skill files
- `forgecad studio [path]` — serves studio; falls back to vite dev if `dist/` missing
- `forgecad web` — always vite dev, `FORGE_MODE=web`
- `forgecad check suite` — runs all invariant checks (requires CLI built)

**Pain points observed:**
1. `forgecad studio` has silent dual behavior: no warning that it's running in dev mode when dist/ is absent.
2. `forgecad web` always uses vite dev — no production equivalent.
3. Agents called `npm run build:cli` when they should have just run `forgecad check suite` (which uses the already-built binary).
4. No canonical "start the dev server" entry in CLI.md — it's buried in npm scripts.
5. The `--dev` / `--prod` distinction is implicit, not exposed to the user.

---

### Proposed Change C1 — Document the layer contract

**What:** Add a clear "When to use what" section to `CLI.md` and add a rule to `CLAUDE.md`.

**Contract to document:**
- **AI agents working in the repo**: always use `forgecad *` CLI commands. Never call `npm run build:cli`, `npm run build`, or `npm run dev` directly. The CLI is always present after `npm install`.
- **Humans developing ForgeCAD**: use `npm run dev` for the interactive dev server, `npm run build` for a full production build, `forgecad check suite` to run all checks.
- **CI**: `npm run build && npm run test` (or equivalent — CI doesn't use the installed CLI).

**Expected outcome:** Agents stop reaching for npm scripts. Humans have a clear reference.

**Risk:** None — documentation only.

---

### Proposed Change C2 — Remove the silent fallback from `forgecad studio`

**What:** Replace the silent `dist/` fallback in `cli/forge-studio.ts` with one of:

**Option A — Hard error:** If `dist/` is missing, print an actionable error:
```
Error: Studio UI not built. Run `npm run build` or `npm run dev` (for live reloading).
```

**Option B — `--dev` flag:** Add explicit `--dev` / `--prod` flags. Default without a flag: auto-detect but print a visible warning:
```
Warning: dist/ not found, starting in development mode (live reload, slower startup).
To build for production: npm run build
```

**Option C — Rename to `forgecad dev`:** Expose `forgecad dev [path]` as the dev-mode command, keeping `forgecad studio` as prod-only. This is the cleanest conceptual split.

**Recommendation:** Option C + backwards compat alias.

**Expected outcome:** `forgecad studio` behavior is predictable. A missing `dist/` is a clear error, not a silent mode switch.

**Risk:** Breaking change for anyone using `forgecad studio` in a freshly-cloned repo without building. Mitigated by the alias and clear error message.

---

### Proposed Change C3 — Introduce `forgecad dev [path]`

**What:** Add a new `forgecad dev [path]` command in the CLI that:
1. Always uses the Vite dev server (moves the current fallback behavior here explicitly)
2. Accepts `--blank`, `--port`, `--host` just like `forgecad studio`
3. Is documented as "for active development of ForgeCAD itself, or for iterating on forge scripts with live reload"

Move the vite-spawn logic from `forge-studio.ts` to a new `cli/forge-dev.ts` module.

**Expected outcome:** Clear, named commands for each use case:
- `forgecad dev [path]` — dev server, live reload, no build needed
- `forgecad studio [path]` — production server, requires `dist/`, faster startup

---

### Proposed Change C4 — `forgecad web` production path

**What:** `forgecad web` currently always spawns vite dev with `FORGE_MODE=web`. This is fine for local testing of the web/embeddable UI, but is inconsistent with how `forgecad studio` works.

Two options:
- **Keep it dev-only** and rename to `forgecad dev:web` or `forgecad web --dev`, document that there's no local prod mode for web (it's GitHub Pages).
- **Add `--serve` mode** that runs the production server with `FORGE_MODE=web`.

**Recommendation:** Keep it dev-only but rename conceptually to align with the C3 pattern. Document that `forgecad web` = `forgecad dev --mode=web`.

---

### Proposed Change C5 — Codify the agent contract in CLAUDE.md

**What:** Add to the repo's `CLAUDE.md`:
```markdown
## Build & CLI layer

**AI agents working in this repo must use `forgecad` CLI commands, not `npm run` scripts.**

- Check invariants: `forgecad check suite`
- Open studio: `forgecad studio [path]` (requires dist/) or `forgecad dev [path]` (dev mode, no build needed)
- The CLI is always available after `npm install` — no build step required before using it.
- Never run `npm run build:cli`, `npm run dev`, or `npm run build` unless you are specifically managing build artifacts.
```

---

## Files to Modify

| File | Change | Priority |
|------|--------|----------|
| `docs/permanent/CLI.md` | Add "When to use what" section at top | C1 — high |
| `CLAUDE.md` | Add CLI/npm layer contract | C5 — high |
| `cli/forge-studio.ts` | Remove silent fallback, add error or `--dev` flag | C2 — medium |
| `cli/forge-dev.ts` | New file: the dev-mode server command | C3 — medium |
| `cli/forgecad.ts` | Register `forgecad dev` command | C3 — medium |
| `cli/forge-web.ts` | Align with dev-vs-prod split, document scope | C4 — low |
| `docs/processes/MULTI_AGENT_DEVELOPMENT.md` | Add note on which commands agents should use | C5 — medium |

---

## Open Questions

1. **Should `forgecad studio` work at all without a `dist/`?** The current behavior is convenient but deceptive. Hard error + clear message seems better. But if we add `forgecad dev`, there's no reason for the fallback.

2. **Should `npm run dev` remain or be deprecated in favor of `forgecad dev`?** `npm run dev` is the standard convention for JS projects and is useful for contributors who haven't installed the CLI globally. Keeping it alongside `forgecad dev` (which calls the same underlying vite logic) seems fine — just needs to be documented.

3. **What's the right split for `forgecad web`?** It's mainly used for testing the GitHub Pages / embeddable mode locally. Current behavior (always dev) is probably fine given that the production deploy is handled by CI. Naming it more explicitly would help.

4. **Should there be a `forgecad build` CLI command?** It would mirror `npm run build` but be callable via the CLI. Probably not worth it — `npm run build` is the right interface for build management, and exposing it via the CLI adds a weird self-referential loop.

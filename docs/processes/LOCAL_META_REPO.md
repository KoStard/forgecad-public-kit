# Local Meta Repo Workflow

This workflow gives ForgeCAD a **local-only companion repo** for notes, ideas, private benchmark briefs, and other material that should not land in the main repository.

## Goal

We want all ForgeCAD worktrees to see the same `private/` content without:
- committing private files to ForgeCAD
- manually copying folders between worktrees
- relying on one specific checkout as the "real" place for local notes

## Chosen Design

The shared local meta repo lives under the main repo's **git common dir**:

```text
$(git rev-parse --git-common-dir)/local-meta
```

For this clone, that resolves to a path like:

```text
/Users/kostard/Projects/CAD/ForgeCAD/.git/local-meta
```

Each ForgeCAD worktree gets an ignored symlink:

```text
<worktree>/private -> <git-common-dir>/local-meta
```

Why this works:
- `git-common-dir` is shared by every worktree of the same ForgeCAD clone
- the `private` link stays outside main repo history through `.git/info/exclude`
- the local meta repo has its own git history, separate from ForgeCAD
- every worktree sees the same private files immediately

## Bootstrap

Run from any ForgeCAD worktree:

```bash
npm run meta:init
```

Useful helpers:

```bash
npm run meta:status
npm run meta:path
git -C private status
```

Environment overrides:

```bash
FORGE_LOCAL_META_ROOT=/absolute/path/to/my-meta npm run meta:init
FORGE_LOCAL_META_LINK_NAME=meta npm run meta:init
```

## Migration Behavior

If a worktree already has a real `private/` directory, the bootstrap migrates it before linking:

- main checkout `private/` contents move into the meta repo root
- other worktrees move into `private/worktrees/<worktree-id>/imported-private/`

This keeps old local material instead of silently discarding it.

## Daily Workflow

Use `private/` from any worktree:

```bash
cd private
git status
git add .
git commit -m "Add benchmark briefs"
```

Suggested structure:

```text
private/
  benchmarks/
  ideas/
  notes/
  scratch/
  worktrees/
```

Recommended conventions:
- durable project knowledge goes in `notes/`
- candidate benchmark prompts go in `benchmarks/`
- rough or disposable material goes in `scratch/`
- worktree-specific temporary files go in `worktrees/<id>/`

## Tradeoffs

This design optimizes for smoothness, not isolation.

- Uncommitted edits in `private/` are visible from every ForgeCAD worktree immediately.
- If you want task-local scratch space, keep it under `private/worktrees/<id>/`.
- If you want cross-machine sync later, add a **private remote** to the meta repo itself:

```bash
git -C "$(npm run -s meta:path)" remote add origin <private-remote-url>
```

That keeps ForgeCAD public while still letting the companion repo be versioned privately.

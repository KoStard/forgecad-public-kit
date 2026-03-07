# Maintaining the ForgeCAD Codex Skill

The ForgeCAD skill at `skills/forgecad/` is generated from repo docs and examples. Do not hand-edit `skills/forgecad/SKILL.md`; regenerate it from the source material instead.

## Source of Truth

The generated skill inlines these paths:

- `docs/permanent/API/model-building/`
- `docs/permanent/API/guides/modeling-recipes.md`
- `docs/permanent/CLI.md`
- `examples/api/`

The generator wrapper lives at `scripts/build-forgecad-skill.mjs`. It owns the skill frontmatter, the short workflow guidance at the top of the file, and the list/order of inlined sources.

## Update Workflow

When ForgeCAD modeling docs, CLI docs, or runnable API examples change:

```bash
npm run build:skill:forgecad
```

This rewrites `skills/forgecad/SKILL.md` from the current repo contents.

If the skill's scope, trigger description, or top-level guidance changes, edit `scripts/build-forgecad-skill.mjs` and regenerate the skill. If the UI-facing skill metadata becomes stale, update `skills/forgecad/agents/openai.yaml` in the same change.

## Validation

Inspect the generated diff before committing. If the Codex system skill tooling is installed locally, validate the skill with:

```bash
uv run --with pyyaml python "${CODEX_HOME:-$HOME/.codex}/skills/.system/skill-creator/scripts/quick_validate.py" skills/forgecad
```

## Commit Discipline

When changing any of the source docs or examples above, include the regenerated `skills/forgecad/SKILL.md` in the same commit if the skill should stay in sync with those changes.

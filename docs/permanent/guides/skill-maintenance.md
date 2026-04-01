# Skill System Maintenance

ForgeCAD ships an AI agent skill that teaches language models how to author `.forge.js` models. The skill has two variants:

- **Standard** (`forgecad skill install`) — model-authoring docs only. Shipped to users.
- **Dev** (`forgecad skill install --dev`) — everything above plus internals (compiler, solver, sketch pipeline, coding conventions, full CLI). For developers building ForgeCAD itself.

## Architecture

```
docs/permanent/           ← source of truth for all docs
scripts/build-forgecad-skill.mjs  ← reads docs, emits skill artifacts
dist-skill/
  SKILL.md                ← standard skill ({{SKILL_DIR}} placeholders)
  SKILL-dev.md            ← dev skill (same, with extra sections)
  CONTEXT.md              ← one-file paste target for chat UIs
  docs/                   ← full docs tree, copied from docs/permanent/
skills/forgecad/SKILL.md  ← in-repo dev SKILL.md (relative paths)
```

At install time (`forge-skill.ts`), the `{{SKILL_DIR}}` placeholder is replaced with the actual install directory (`~/.agents/skills/forgecad`), and the docs tree is copied alongside.

## Adding a New Doc to the Skill

1. Write the doc under `docs/permanent/` (e.g. `docs/permanent/API/core/my-feature.md`).
2. Open `scripts/build-forgecad-skill.mjs`:
   - Add a key to the `docs` object: `myFeature: "docs/permanent/API/core/my-feature.md"`
   - Add it to `oneFileDocs` too if it should appear in the one-file paste output
   - Add or update the relevant entry in `docGroups` (standard skill) or `devDocGroups` (dev-only)
3. Run `npm run refresh` — this rebuilds CLI, types, docs, and skill in the correct order.
4. Run `node dist-cli/forgecad.js skill install` (or `--dev`) to install locally.

## Adding Dev-Only Docs

Dev-only docs go in `devDocGroups` only — they appear in `SKILL-dev.md` but not in `SKILL.md` or `CONTEXT.md`. Use this for:

- Compiler/solver internals
- Coding conventions and PR guidelines
- Deployment and release processes
- Full CLI reference (vs the slim `skill-cli.md` excerpt)

## Deciding Standard vs Dev

| Question | If yes → |
|----------|----------|
| Does a model author need this to build `.forge.js` files? | Standard |
| Does it describe internal architecture (compiler, solver, pipeline)? | Dev only |
| Does it cover team process (coding standards, releases, CI)? | Dev only |
| Is it a CLI command only developers run (`check suite`, `sdf`, debug flags)? | Dev only |

## Verifying

After changes, check that the build succeeds and the doc counts look right:

```bash
npm run refresh
node dist-cli/forgecad.js skill install --dev  # verify dev install
```

The build script prints the number of indexed source files. Verify new docs are counted.

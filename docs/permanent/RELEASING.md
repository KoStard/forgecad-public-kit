# Releasing ForgeCAD

## Quick Release

```bash
npm version patch          # or minor / major
git push && git push --tags
```

That's it. GitHub Actions handles the rest:
- Builds everything (solver WASM + TypeScript + Vite + CLI + skills)
- Runs the full test suite
- Publishes to npm
- Creates a GitHub Release with auto-generated notes
- GitHub Pages deploys automatically on the mainline push

## Version Levels

| Command | When | Example |
|---------|------|---------|
| `npm version patch` | Bug fixes, small changes | 0.1.5 → 0.1.6 |
| `npm version minor` | New features | 0.1.5 → 0.2.0 |
| `npm version major` | Breaking changes | 0.1.5 → 1.0.0 |

`npm version` automatically:
1. Updates `version` in `package.json`
2. Creates a git commit (`v0.1.6`)
3. Creates a git tag (`v0.1.6`)

## Dry Run

To test the publish workflow without actually releasing:

1. Go to **Actions → Publish to npm & GitHub Release → Run workflow**
2. Check "Dry run" and run

## Prerequisites

- `NPM_TOKEN` must be set as a GitHub repo secret (Settings → Secrets → Actions)
  - Create a **Granular Access Token** at npmjs.com → Account → Access Tokens
  - Scope it to read+write on the `forgecad` package only

## What Gets Published

- `dist-cli/forgecad.js` — CLI binary
- `dist/` — web app bundles
- `dist-skill/` — AI skill documentation and context
- `examples/` — sample models
- `README.md`, `LICENSE`

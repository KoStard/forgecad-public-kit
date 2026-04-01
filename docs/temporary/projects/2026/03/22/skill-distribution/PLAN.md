# Skill Distribution for Browser-Only Users

**Goal:** Let users who interact with ForgeCAD only through the browser (GitHub Pages) obtain the AI skill/context files without installing Node.js or the CLI.

## Current State

ForgeCAD already ships skill files in the npm package under `dist-skill/`:

| File | Size | Purpose |
|------|------|---------|
| `SKILL.md` | 4.7 KB | Agent skill with source map — loads docs on demand |
| `CONTEXT.md` | 175 KB | Single self-contained file for paste into chat UIs |
| `docs/` | ~330 KB (35 files) | Referenced docs that SKILL.md points to |

**Current distribution channels** (all require local Node.js):

| Channel | Command | Requires |
|---------|---------|----------|
| Global CLI | `forgecad skill install` | npm global install |
| One-file export | `forgecad skill one-file ~/out.md` | npm global install |
| npx | `npx forgecad skill install` | Node.js |

**Gap:** Browser-only users (opened ForgeCAD on GitHub Pages, want to use Claude.ai/ChatGPT to write models) have no way to get the skill files.

## Chosen Approach: Static hosting + In-app UI

Two complementary additions:

1. **Static hosting** — Vite `closeBundle` plugin copies `dist-skill/` into `dist/skill/` during web builds. Skill files become accessible at known URLs on GitHub Pages.
2. **"AI Skill" toolbar button** — Opens a dialog with two tabs:
   - **Paste into Chat** — one-click copy of the full CONTEXT.md (175 KB) to clipboard, or direct link to the file
   - **Agent Skill (CLI)** — shows `npx forgecad skill install` and `npx forgecad skill one-file` commands

### URL scheme

```
https://<host>/ForgeCAD/skill/CONTEXT.md     # single-file (paste into chat)
https://<host>/ForgeCAD/skill/SKILL.md       # multi-file skill entry point
https://<host>/ForgeCAD/skill/docs/...       # referenced docs
```

### Why this works

- **No new server** — GitHub Pages already serves static files
- **Always in sync** — skill files are built and deployed alongside the app
- **Progressive** — browser users get a URL + copy button, CLI users get commands
- **Cacheable** — browsers and CDNs cache the static files naturally

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Baseline: skill files only available via local CLI | ✅ |
| P1 | Vite plugin to copy dist-skill/ into dist/skill/ on web build | ✅ |
| P2 | AISkillDialog component with paste/install tabs | ✅ |
| P3 | "AI Skill" button in toolbar | ✅ |
| P4 | Type-check passes | ✅ |
| P5 | Full web build verification | ⬜ blocked by pre-existing merge conflicts in ExportPanel.tsx |

## Files Modified

| File | Purpose |
|------|---------|
| `vite.config.ts` | `forgeSkillStaticPlugin()` — copies dist-skill/ to dist/skill/ during web builds |
| `src/components/AISkillDialog.tsx` | **New** — dialog with copy-to-clipboard and CLI instructions |
| `src/App.tsx` | Added "AI Skill" button to toolbar, imported AISkillDialog |

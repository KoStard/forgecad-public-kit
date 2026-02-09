# ForgeCAD Agent Notes

## Project Summary
ForgeCAD is a browser-based CAD app built with React + TypeScript. The core geometry kernel is in `src/forge/` and uses Manifold WASM. UI is in `src/components/`, with global state in `src/store/forgeStore.ts` via Zustand. The main layout is in `src/App.tsx`.

## Key Conventions
- Minimal implementations only; avoid speculative features.
- TypeScript: explicit parameter/return types, avoid `any`.
- React: functional components only, inline styles preferred.
- Global state lives in `src/store/forgeStore.ts`.
- Use Zustand selectors to reduce re-renders.

## Layout & Panels
- Code panel and View panel are resizable via drag handles in `src/App.tsx`.
- View panel visibility is toggled in the toolbar (`toggleViewPanel`).
- File explorer visibility is toggled in the toolbar (`toggleFileExplorer`).

## Viewport / View Panel
- Render modes: `solid`, `wireframe`, `overlay`.
- Projection: `perspective`, `orthographic`.
- Standard view snaps and fit/zoom use `viewCommand` in the store.
- Per-object settings (visibility, opacity, color) live in store `objectSettings` keyed by object id.

## Script Results
- `runScript` returns `RunResult` with `objects` array. Each object has `id`, `name`, `shape`, `sketch`.
- Array return values from scripts are supported (Shape/Sketch or named objects).
- Single-object compatibility is preserved via `shape`/`sketch` fields in `RunResult`.

## Testing Ritual
- Build: `npm run build` (tsc + Vite). Expect chunk-size warnings; they are not failures.
- Manual UI checks for panel resizing and view toggles are recommended.

## Git Workflow
- Commit every major change.
- Commit message format: `<Verb> <what>` (present tense). Examples: `Add view panel controls`.
- Keep related code/tests/docs in the same commit.

## Common Files
- `src/App.tsx`: main layout, splitters, panels.
- `src/components/Viewport.tsx`: rendering, render modes, view controls.
- `src/components/ViewPanel.tsx`: view controls UI.
- `src/store/forgeStore.ts`: global state/actions.
- `src/forge/runner.ts`: script execution and `RunResult`.


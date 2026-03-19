# ForgeCAD — Development Guidelines

## CLI vs npm scripts — which layer to use

ForgeCAD has two overlapping interfaces for build and dev tasks. Use the right one for your context.

| Context | Use | Avoid |
|---------|-----|-------|
| **AI agents working in this repo** | `forgecad check suite`, `forgecad dev`, `forgecad studio` | `npm run build`, `npm run dev`, `npm run build:cli` |
| **Humans developing ForgeCAD** | `npm run dev` (live reload), `npm run build` (prod), `forgecad check suite` | — |
| **CI / pre-publish** | `npm run build && npm run test` | forgecad CLI (not installed in CI) |

**The CLI is always available after `npm install`** — the `prepare` hook builds `dist-cli/forgecad.js` automatically. No extra build step is needed before using CLI commands.

### Dev server commands

| Command | When to use |
|---------|------------|
| `forgecad dev [path]` | Active development — Vite dev server, live reload, no build needed |
| `forgecad studio [path]` | Production server — requires `dist/` to be built (`npm run build`) |
| `npm run dev` | Same as `forgecad dev` for humans; conventional JS-project entry point |

**Never** call `npm run build:cli` in agent context — the CLI binary is already built. Call `forgecad check suite` (or other `forgecad` commands) directly.

## React Performance: Stable References in Render Bodies

**Never use `?? []`, `?? {}`, or inline fallback literals in a component render body if the value flows (directly or transitively) into a `useMemo`/`useCallback`/`useEffect` dependency array.** Each render creates a new object/array reference, which silently invalidates every downstream memo in the chain.

```tsx
// BAD — new [] every render, breaks every useMemo that depends on `items`
const items = config?.items ?? [];

// GOOD — stable reference across renders
const items = useMemo(() => config?.items ?? [], [config]);
```

This is especially dangerous when the unstable reference is several layers removed from the expensive computation — the memoization "looks correct" locally but the dep chain is broken. Use `useMemo` for any derived-with-fallback value that feeds into other hooks.

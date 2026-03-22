# ForgeCAD — Development Guidelines

Read [docs/permanent/project/coding-best-practices.md](docs/permanent/project/coding-best-practices.md) for coding best practices (TypeScript, React, performance, self-review).

## CLI vs npm scripts — which layer to use

ForgeCAD has two overlapping interfaces for build and dev tasks. Use the right one for your context.

| Context | Use | Avoid |
|---------|-----|-------|
| **AI agents working in this repo** | `node dist-cli/forgecad.js check suite`, `node dist-cli/forgecad.js run ...` | Global `forgecad` (may be stale), `npm run build`, `npm run dev` |
| **Humans developing ForgeCAD** | `npm run dev` (live reload), `npm run build` (prod), `forgecad check suite` | — |
| **CI / pre-publish** | `npm run build && npm run test` | forgecad CLI (not installed in CI) |

**Important**: Always use `node dist-cli/forgecad.js` (local build) instead of the global `forgecad` command. The global binary may be an older installed version that doesn't reflect local source changes. After editing TS source, run `npm run build:cli` to rebuild, then use `node dist-cli/forgecad.js` to run.

### Dev server commands

| Command | When to use |
|---------|------------|
| `forgecad dev [path]` | Active development — Vite dev server, live reload, no build needed |
| `forgecad studio [path]` | Production server — requires `dist/` to be built (`npm run build`) |
| `npm run dev` | Same as `forgecad dev` for humans; conventional JS-project entry point |

After editing TS source files, rebuild the CLI with `npm run build:cli`, then use `node dist-cli/forgecad.js` to run commands. Do not use the global `forgecad` binary — it won't reflect local changes.

## React Performance: Stable References in Render Bodies

**Never use `?? []`, `?? {}`, or inline fallback literals in a component render body if the value flows (directly or transitively) into a `useMemo`/`useCallback`/`useEffect` dependency array.** Each render creates a new object/array reference, which silently invalidates every downstream memo in the chain.

```tsx
// BAD — new [] every render, breaks every useMemo that depends on `items`
const items = config?.items ?? [];

// GOOD — stable reference across renders
const items = useMemo(() => config?.items ?? [], [config]);
```

This is especially dangerous when the unstable reference is several layers removed from the expensive computation — the memoization "looks correct" locally but the dep chain is broken. Use `useMemo` for any derived-with-fallback value that feeds into other hooks.


## Constrained Sketch Builder: Validate All Inputs at the Builder Level

**Every public method on `ConstrainedSketchBuilder` must validate its arguments before storing or passing them to the solver.** The solver's constraint `residual()` functions silently return `[0]` (= "constraint satisfied") when entity lookups fail, so invalid inputs produce silent misbehavior instead of errors.

Required validations:

1. **Entity existence** — When accepting an entity ID (`PointId`, `LineId`, `CircleId`, `ArcId`, `ShapeId`), verify it exists in the builder's entity lists via the `resolve*Id()` helpers. These are all `string` at runtime, so passing one type where another is expected compiles fine but fails silently.

2. **Numeric values** — Any `value: number` parameter on a dimension constraint must be validated with `requireFinite()`. `NaN` and `Infinity` cause the solver to spin or produce garbage.

3. **Entity creation** — `point()`, `line()`, `circle()` etc. must validate their inputs (finite coordinates, existing endpoint IDs).

```ts
// BAD — bypasses validation, solver silently ignores the constraint
pointOnLine(point: PointId, line: LineId): this {
  return this.constrain({ type: 'pointOnLine', point, line });
}

// GOOD — validates both existence and type
pointOnLine(point: any, line: any): this {
  return this.constrain({ type: 'pointOnLine',
    point: this.resolvePointId(point),
    line: this.resolveLineId(line) });
}
```

## Approach
If you hit a moment you don't know how to proceed, take the scientist hat of experiments, only reality can give us the data, so we should run experiments, analyse, capture, iterate. If unsure about the science, take the first principles book approach.

Our design goal should be to prevent parameter hacking. It should work automatically and smoothly without microoptimizing magic numbers.
# ForgeCAD — Development Guidelines

Read [docs/permanent/project/coding-best-practices.md](docs/permanent/project/coding-best-practices.md) for coding best practices (TypeScript, React, performance, self-review).

## CLI vs npm scripts — which layer to use

ForgeCAD has two overlapping interfaces for build and dev tasks. Use the right one for your context.

| Context | Use | Avoid |
|---------|-----|-------|
| **AI agents working in this repo** | `node dist-cli/forgecad.js check suite`, `node dist-cli/forgecad.js run ...` | Global `forgecad` (may be stale), `npm run build`, `npm run dev` |
| **Humans developing ForgeCAD** | `npm run dev` (live reload), `npm run build` (prod), `forgecad check suite` | — |
| **CI / pre-publish** | `npm run build && npm run test` | forgecad CLI (not installed in CI) |

**Important**: Always use `node dist-cli/forgecad.js` (local build) instead of the global `forgecad` command. The global binary may be an older installed version that doesn't reflect local source changes.

### Rebuilding after source changes

| Command | What it does |
|---------|-------------|
| `npm run refresh` | Rebuild **all** derived artifacts (CLI, types, docs, skill) in correct order with parallelism. Run this after editing TS source. |
| `npm run refresh -- --no-cli` | Same but skip CLI rebuild (faster, use when only API/docs changed) |
| `forgecad dev` / `npm run dev` | Vite dev server — auto-rebuilds types, docs, and skill on file changes. No manual refresh needed during active dev. |

After `npm run refresh`, use `node dist-cli/forgecad.js` to run CLI commands. Do not use the global `forgecad` binary — it won't reflect local changes.

### Dev server commands

| Command | When to use |
|---------|------------|
| `forgecad dev [path]` | Active development — Vite dev server, live reload, auto-refreshes types/docs/skill |
| `forgecad studio [path]` | Production server — requires `dist/` to be built (`npm run build`) |
| `npm run dev` | Same as `forgecad dev` for humans; conventional JS-project entry point |

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

## Compile Plans Are Non-Optional

**Every `Sketch` must have a real `ProfileCompilePlan`. Every `Shape` must have a real `ShapeCompilePlan`.** There are no nulls, no "opaque" markers, no fallback paths. If a compile plan is missing, that's a bug to fix at the source — never work around it downstream.

Rules:
1. **Never use `new Sketch(cross)` in isolation.** The constructor snapshots the cross-section as a polygon plan, but prefer the sketch-level API (`circle2d`, `polygon`, `rect`, `.add()`, `.subtract()`) which builds proper parametric plans.
2. **Never bypass the sketch API with raw `.cross` operations** (e.g. `sketch.cross.subtract(other.cross)`). This drops the compile plan. Use `.subtract()`, `difference2d()`, etc.
3. **When a downstream transform crashes because a plan is missing, trace back to where the plan was lost and fix the construction** — don't add null-checks or fallbacks in the transform methods.
4. **If an operation produces a `CrossSection` without a plan** (e.g. section cuts, backend-level simplify), snapshot the result via `profilePlanFromCrossSection(cross)` which captures the polygon loops as a real plan.

## No Silent Fallbacks

**Never add fallback code paths that silently switch algorithms when the primary one fails.** If an algorithm produces bad output, that's a bug — surface it as an error so it gets fixed, don't mask it by falling back to a different implementation.

```ts
// BAD — hides bugs, makes debugging impossible
try {
  return newAlgorithm(input);
} catch {
  return oldAlgorithm(input); // silently masks the real problem
}

// GOOD — let errors surface
return newAlgorithm(input);
```

This applies everywhere, not just meshing. Fallbacks create two code paths that both need maintenance, make failures invisible, and prevent root-cause analysis. If something can fail, validate inputs upstream or fix the algorithm.

## Blueprint-First: No Trigonometry Tax

**Code should read like a mechanical blueprint, not a math textbook.** See [docs/permanent/project/blueprint-first.md](docs/permanent/project/blueprint-first.md) for the full philosophy.

Every new public API method must pass this design gate:

> Can the user accomplish this without `Math.sin`, `Math.cos`, `Math.atan2`, manual degree-to-radian conversion, or computing intermediate Cartesian coordinates from polar/angular intent?

If no, the API needs a higher-level alternative. Use `circularLayout()`, `polygonVertices()`, `translatePolar()`, polar coordinates, and patterns instead of forcing users into trig. The raw math path can exist for power users, but the common case must be trig-free.

```ts
// BAD — user pays the trig tax
const x = radius * Math.cos(angle * Math.PI / 180);
const y = radius * Math.sin(angle * Math.PI / 180);
shape.translate(x, y, 0);

// GOOD — intent-driven
shape.translatePolar(radius, angle);

// BAD — manual circular positioning loop
for (let i = 0; i < 6; i++) {
  const a = i * 60 * Math.PI / 180;
  holes.push(hole.translate(r * Math.cos(a), r * Math.sin(a), 0));
}

// GOOD — declarative layout
for (const {x, y} of circularLayout(6, r)) {
  holes.push(hole.translate(x, y, 0));
}
```

## Approach
If you hit a moment you don't know how to proceed, take the scientist hat of experiments, only reality can give us the data, so we should run experiments, analyse, capture, iterate. If unsure about the science, take the first principles book approach.

Our design goal should be to prevent parameter hacking. It should work automatically and smoothly without microoptimizing magic numbers.

### Omotenashi

Always do house keeping. Finding small cleanup places, do it.
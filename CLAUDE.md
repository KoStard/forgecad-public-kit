# ForgeCAD — Development Guidelines

## React Performance: Stable References in Render Bodies

**Never use `?? []`, `?? {}`, or inline fallback literals in a component render body if the value flows (directly or transitively) into a `useMemo`/`useCallback`/`useEffect` dependency array.** Each render creates a new object/array reference, which silently invalidates every downstream memo in the chain.

```tsx
// BAD — new [] every render, breaks every useMemo that depends on `items`
const items = config?.items ?? [];

// GOOD — stable reference across renders
const items = useMemo(() => config?.items ?? [], [config]);
```

This is especially dangerous when the unstable reference is several layers removed from the expensive computation — the memoization "looks correct" locally but the dep chain is broken. Use `useMemo` for any derived-with-fallback value that feeds into other hooks.

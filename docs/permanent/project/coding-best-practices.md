# Coding Best Practices

## Minimal Implementation

Write only the code needed to solve the problem. No verbose implementations, no speculative features.

## TypeScript

- Use explicit types for function parameters and return values
- Avoid `any` — use `unknown` or proper types
- Prefer interfaces for object shapes

## React Components

- Functional components only
- Inline styles for simplicity (no CSS files unless necessary)
- Extract reusable logic to custom hooks or store actions

### Stable References in Render Bodies

Never use `?? []`, `?? {}`, or inline fallback literals in a component render body if the value flows (directly or transitively) into a `useMemo`/`useCallback`/`useEffect` dependency array. Each render creates a new reference, which silently invalidates every downstream memo.

```tsx
// BAD — new [] every render, breaks every useMemo that depends on `items`
const items = config?.items ?? [];

// GOOD — stable reference across renders
const items = useMemo(() => config?.items ?? [], [config]);
```

Use `useMemo` for any derived-with-fallback value that feeds into other hooks.

## State Management

- All global state lives in `forgeStore.ts`
- Use Zustand selectors to prevent unnecessary re-renders
- Keep actions pure and synchronous where possible

## Performance

### Geometry Operations

- Manifold operations are expensive — minimize boolean ops
- Cache geometry results when parameters don't change
- Use debouncing for real-time updates

### React Rendering

- Use Zustand selectors to prevent unnecessary re-renders
- Memoize expensive computations with `useMemo`
- Keep component tree shallow

## Linting & Formatting

[Biome](https://biomejs.dev/) handles both linting and formatting for all TS/JS code.

```bash
npm run lint          # check for lint issues (no changes)
npm run lint:fix      # auto-fix lint issues
npm run format        # auto-format all files
```

Biome runs as part of `forgecad check suite`. Configuration lives in `biome.json` at the repo root.

## Self-Review Before Commit

1. Remove console.logs and debug code
2. Check for unused imports
3. Verify TypeScript has no errors
4. Test the change works as intended
5. Read the diff — does it make sense?

### What to Look For

- Does this solve the problem with minimal code?
- Are there edge cases not handled?
- Is the code readable without comments?
- Does it follow existing patterns?

## File length
Keep files under 200 lines. If a file grows beyond that, consider splitting it into smaller, focused files.
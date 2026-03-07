# ForgeCAD Coding Guidelines

## Development Workflow

### Building & Running
```bash
npm install          # Install dependencies
npm run dev          # Start dev server (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

### CLI Tools
```bash
npm run svg -- examples/frame.sketch.js          # Export sketch to SVG (Node, no browser)
npm run render -- examples/cup.forge.js           # Render to PNG (Puppeteer + Chrome)
```

See [CLI.md](CLI.md) for full CLI documentation.

### Project Structure
```
src/
├── forge/                # Core geometry engine (shared by browser + CLI)
│   ├── kernel.ts         # Manifold WASM wrapper, Shape class, primitives
│   ├── headless.ts       # Single entry point for all contexts (browser + Node CLI)
│   ├── index.ts          # Browser entry point (re-exports from headless.ts)
│   ├── runner.ts         # Script sandbox — executes user scripts and resolves imported .svg assets
│   ├── params.ts         # Parameter system (param() → UI sliders)
│   ├── library.ts        # Part library (lib.boltHole, lib.pipe, etc.)
│   ├── section.ts        # Plane intersection / projection
│   ├── meshToGeometry.ts # Manifold mesh → Three.js BufferGeometry
│   ├── sceneBuilder.ts   # Three.js scene setup (shared with CLI renderer)
│   └── sketch/           # 2D sketch system
│       ├── core.ts       # Sketch class
│       ├── primitives.ts # rect, circle2d, polygon, ngon, etc.
│       ├── transforms.ts # translate, rotate, scale, mirror
│       ├── booleans.ts   # add, subtract, intersect, union2d, hull2d
│       ├── operations.ts # offset, hull, simplify, warp
│       ├── extrude.ts    # extrude, revolve (2D → 3D)
│       ├── path.ts       # PathBuilder, stroke
│       ├── anchor.ts     # attachTo positioning
│       ├── constraints.ts # Constraint solver (18 types)
│       ├── entities.ts   # Point2D, Line2D, Circle2D, Rectangle2D, Constraint helpers
│       ├── topology.ts   # TrackedShape, face/edge naming
│       ├── patterns.ts   # linearPattern, circularPattern, mirrorCopy
│       ├── fillets.ts    # filletEdge, chamferEdge
│       ├── arcBridge.ts  # arcBridgeBetweenRects
│       └── index.ts      # Re-exports everything
├── components/           # React UI components
│   ├── Viewport.tsx      # 3D viewport (Three.js + R3F)
│   ├── CodeEditor.tsx    # Monaco editor with ForgeCAD types
│   ├── FileExplorer.tsx  # Project file tree
│   ├── ViewPanel.tsx     # Render mode, views, object settings
│   ├── ParamPanel.tsx    # Parameter sliders
│   └── ExportPanel.tsx   # STL export
├── store/
│   └── forgeStore.ts     # Zustand global state
├── App.tsx               # Main application shell
└── main.tsx              # React entry point

cli/
├── forge-svg.ts          # SVG export (uses real engine via headless.ts)
├── forge-svg.mjs         # Legacy wrapper (redirects to .ts version)
├── forge-render.mjs      # PNG render launcher (Puppeteer)
├── render.ts             # Headless render entry (loaded in browser by Puppeteer)
└── render.html           # HTML shell for headless render

examples/                 # Example scripts
├── *.forge.js            # 3D part examples
└── *.sketch.js           # 2D sketch examples
```

## Coding Standards

### Minimal Implementation
Write only the code needed to solve the problem. No verbose implementations, no speculative features.

### TypeScript
- Use explicit types for function parameters and return values
- Avoid `any` - use `unknown` or proper types
- Prefer interfaces for object shapes

### React Components
- Functional components only
- Inline styles for simplicity (no CSS files unless necessary)
- Extract reusable logic to custom hooks or store actions

### State Management
- All global state lives in `forgeStore.ts`
- Use Zustand selectors to prevent unnecessary re-renders
- Keep actions pure and synchronous where possible

## Frame Composition Standard (Required)

This standard is package-wide for any code that composes transforms (`Transform`, joints, assemblies, kinematic helpers).

### Contract
- `A.mul(B)` means **apply A, then B**
- Use `composeChain(...)` for 3+ composed transforms instead of manual `.mul()` chains
- In assembly/kinematics, always express composition in this canonical order:
  - `local -> childBase -> jointMotion -> jointFrame -> parentWorld`

### Why this is mandatory
Transform order bugs can produce geometry that "looks valid" but is globally wrong (detached mechanism segments, drifting pivots, mirrored motion paths) and often pass casual visual checks.

### 5-Why (2026-02 Assembly disconnect incident)
1. Why were arm segments disconnected?  
Because child world transforms were composed in the wrong order in `assembly.solve()`.
2. Why was order wrong?  
Because `.mul()` chain semantics (apply self, then other) were interpreted inconsistently with matrix notation.
3. Why was that ambiguity possible?  
Because there was no single canonical frame equation documented and enforced in code review.
4. Why didn’t tests catch it immediately?  
Because there was no invariant test comparing assembly-solved frame origins against an analytic kinematic oracle.
5. Why no invariant test existed?  
Because we had feature-level example checks, but no package-wide transform convention gate.

Root cause: **missing, enforced transform/frame composition contract across code + tests.**

### Enforcement
- Any change touching transforms, joints, or assembly solving must run:
  - `npm run check:transforms`
- If the change affects user-facing geometry behavior, also run:
  - `npm run test-run -- <affected-example>`

## Editor Declaration Parity Standard (Required)

This standard is package-wide for any user-facing API exposed to scripts.

### Contract
- Runtime API and editor declarations must ship together:
  - Runtime surface: `src/forge/*` exports + `src/forge/runner.ts` sandbox bindings
  - Editor surface: `src/components/CodeEditor.tsx` `FORGE_TYPES`
  - Docs surface: `docs/permanent/API/**/*.md`
- If an important feature is missing from editor declarations, you must either:
  - implement declarations in the same change, or
  - create a tracked task in `tasks/` that explicitly names the missing surface and scope.

### Enforcement
- Before merge, verify new/changed script APIs are present in all three surfaces above.
- Do not ship runtime-only features without either declaration parity or a tracking task.

## Git Workflow

### Commit Every Major Change
Each logical unit of work should be a separate commit:

```bash
git add <files>
git commit -m "Add file explorer panel"
```

### Commit Message Format
```
<verb> <what>

Examples:
- Add file explorer panel
- Fix measure mode toggle
- Update parameter slider styling
- Remove unused imports
```

Use present tense verbs: Add, Fix, Update, Remove, Refactor

### What Counts as "Major"
- New feature or component
- Bug fix
- Refactoring that changes structure
- Performance improvement
- Breaking API change

### What to Commit Together
- Related files for a single feature
- Tests with the code they test
- Documentation with the feature it describes

### Example Workflow
```bash
# Feature: Add file explorer
git add src/components/FileExplorer.tsx
git add src/store/forgeStore.ts
git add src/App.tsx
git commit -m "Add file explorer panel"

# Next feature: Add keyboard shortcuts
git add src/hooks/useKeyboard.ts
git add src/App.tsx
git commit -m "Add keyboard shortcuts for file operations"
```

## Testing

### Manual Testing Checklist
Before committing UI changes:
- [ ] Test in browser at localhost:5173
- [ ] Check console for errors
- [ ] Verify responsive behavior
- [ ] Test with example scripts

### Integration Testing
- Load example files and verify they render
- Test parameter sliders update geometry
- Verify STL export produces valid files
- Check measure mode calculates correctly

## Code Review

### Self-Review Before Commit
1. Remove console.logs and debug code
2. Check for unused imports
3. Verify TypeScript has no errors
4. Test the change works as intended
5. Read the diff - does it make sense?

### What to Look For
- Does this solve the problem with minimal code?
- Are there edge cases not handled?
- Is the code readable without comments?
- Does it follow existing patterns?

## Performance

### Geometry Operations
- Manifold operations are expensive - minimize boolean ops
- Cache geometry results when parameters don't change
- Use debouncing for real-time updates (already implemented)

### React Rendering
- Use Zustand selectors to prevent unnecessary re-renders
- Memoize expensive computations with `useMemo`
- Keep component tree shallow

## Common Patterns

### Adding a New Sketch Primitive
1. Add function to `src/forge/sketch/primitives.ts`
2. It's auto-exported via `sketch/index.ts` → `headless.ts` → `index.ts`
3. Add it to the sandbox in `src/forge/runner.ts` (both the `new Function()` args and the call)
4. Add TypeScript hints in `src/components/CodeEditor.tsx` (`FORGE_TYPES`)
5. Update `docs/permanent/API/model-building/sketch-primitives.md`
6. Commit: "Add [primitive] sketch primitive"

### Adding a New 3D Primitive
1. Add function to `src/forge/kernel.ts`
2. Export from `headless.ts`
3. Add to runner sandbox in `src/forge/runner.ts`
4. Add TypeScript hints in `src/components/CodeEditor.tsx`
5. Update `docs/permanent/API/model-building/reference.md`
6. Commit: "Add [primitive] 3D primitive"

### Adding a New CLI Command
1. Create `cli/your-command.ts`
2. Import from `../src/forge/headless`
3. Call `await init()` then use `runScript()`
4. Add script to `package.json`
5. Update `docs/permanent/CLI.md`
6. Commit: "Add [command] CLI command"

### Adding UI State
1. Add to `src/store/forgeStore.ts` interface
2. Add initial value and actions
3. Wire up to component
4. Commit: "Add [feature] UI state"

### Adding a Component
1. Create in `src/components/`
2. Import and use in `App.tsx` or parent
3. Commit: "Add [Component] component"

### Key Architecture Rule: Single Source of Truth
All geometry logic lives in `src/forge/`. CLI tools import from `src/forge/headless.ts`.
**Never** duplicate forge logic in CLI scripts. If you need something in CLI, make sure
it's exported from `headless.ts` and import it.

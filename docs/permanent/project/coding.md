# ForgeCAD Coding Guidelines

## Development Workflow

### Building & Running
```bash
npm install          # Install dependencies
npm link             # Install the local forgecad binary
forgecad studio      # Start the browser studio (localhost:5173)
npm run build        # Production build
npm run preview      # Preview production build
```

### CLI Tools
```bash
forgecad export svg examples/frame.sketch.js     # Export sketch to SVG (Node, no browser)
forgecad render examples/cup.forge.js            # Render to PNG (Puppeteer + Chrome)
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
├── forgecad.ts           # Top-level CLI entrypoint and command routing
├── forge-svg.ts          # SVG export (uses real engine via headless.ts)
├── forge-render.mjs      # PNG render launcher (Puppeteer)
├── render.ts             # Headless render entry (loaded in browser by Puppeteer)
└── render.html           # HTML shell for headless render

examples/                 # Example scripts
├── *.forge.js            # 3D part examples
└── *.sketch.js           # 2D sketch examples
```

## Coding Standards

See [CODING_BEST_PRACTICES.md](CODING_BEST_PRACTICES.md) for TypeScript, React, state management, and performance best practices.

## Domain Localization Standard (Required)

This standard is package-wide for any new user-facing concept or API family.

### Contract
- Each concept family must have a clear primary home in both code and docs.
- Extend the module that already owns the mental model instead of scattering helpers across unrelated files.
- When a feature spans multiple layers, pick one domain owner and make the other layers mirror that owner.
- Keep related runtime code, examples, checks, and docs close to the same domain name whenever practical.

### Examples
- Assembly and kinematics live under `src/forge/assembly.ts` and `docs/permanent/API/model-building/assembly.md`.
- Sketch constraints live under `src/forge/sketch/constraints.ts` and the sketch/entity API docs.
- Transform/placement helpers should stay grouped with transform and positioning surfaces, not reappear as ad-hoc helpers in unrelated modules.

### Enforcement
- Before adding a new API, state which domain owns it.
- If a concept currently has no clean home, create one instead of spreading the first implementation across multiple files.

## Backend Compiler Standard (Required)

This standard is package-wide for any geometry feature that affects runtime lowering, exact export, or backend capability routing.

Read [API/internals/compiler.md](API/internals/compiler.md) before changing this area.
For large multi-agent migrations or architecture programs, also read [PROGRAM-LEAD.md](../processes/PROGRAM-LEAD.md).

### Contract
- Forge semantic intent comes first. Backends are lowerers, not the authoring model.
- Scene-level capability routing must stay centralized. Do not re-derive export/runtime policy ad hoc in unrelated modules.
- Public feature APIs must not hide backend-specific behavior directly in their callsites. Backend code belongs in the lowerers.
- New backend limitations must surface as diagnostics, not silent fallback or silent exactness loss.

### Enforcement
- If a feature is compile-covered, update the canonical compile graph and the scene compiler.
- If a feature is not yet dual-lowered, add explicit unsupported diagnostics for the missing backend rather than bypassing the compiler.
- Any geometry feature change must update invariant coverage and the living backend-compiler tracker.

## Multi-Agent Program Standard (Required For Large Migrations)

For work that spans multiple agent branches or staged dependency waves, the Program Lead role in [PROGRAM-LEAD.md](../processes/PROGRAM-LEAD.md) is the default operating model.

Use it when:

- one missing foundation blocks several feature lanes
- multiple agents need isolated tasks with dependency ordering
- the repo needs a living task graph and capability tracker to stay truthful

The key rule is simple:

- solve the deepest shared prerequisite first
- only then open the parallel wave that builds on top of it

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
  - `forgecad check transforms`
- If the change affects user-facing geometry behavior, also run:
  - `forgecad run <affected-example>`

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

## Multi-File Native Standard (Required)

ForgeCAD projects must scale cleanly across multiple files. Complex models should be **expressible as a composition of separate, independently-authored files** — not as a single growing script.

### Tenet

Every user-facing import mechanism must make multi-file composition a first-class path, not an afterthought:

- A file that returns a `Shape` can be imported with `importPart()`.
- A file that returns a `ShapeGroup` can be imported with `importGroup()`, children accessed by name.
- A file that returns an `Assembly` can be imported with `importAssembly()`, with full kinematic and child-part access preserved.
- Plain JS helpers and constants belong in regular `.js` modules imported via `require()`.

No user should have to choose between "clean file structure" and "full API access". If a new return type or authoring primitive appears, **its import path must ship at the same time or in the same milestone**.

### Consequences for API design

- New authoring primitives (anything a user might `return` from a `.forge.js` file) need a corresponding `import*()` function.
- Imported objects must expose the same child-access and placement-reference ergonomics that inline objects do.
- Parameter overrides (`paramOverrides`) must be supported on every import function so multi-instance use is natural.
- If a sub-file feature cannot yet be fully composed (e.g. kinematic merge across file boundaries), document the limitation explicitly and create a tracked task — do not silently downgrade.

### Enforcement

- When adding a new return-type contract, check: is there an `import*()` function for it?
- When adding placement-reference or child-access APIs to an object type, check: do imported versions of that type also expose those APIs?
- Verify with `forgecad run` that a multi-file example using the new feature works end-to-end before merge.

## Script API Contract Standard (Required)

This standard is package-wide for any API exposed to user scripts.

### Contract
- Collection-shaped script APIs must accept the intuitive collection forms the docs advertise:
  - variadic operands when the operation naturally works on many inputs
  - a single array of operands when that keeps call sites composable
- Method syntax and function syntax must mirror each other for the same operation family.
- User-facing APIs must not silently ignore extra arguments. Unsupported arity or operand types must throw a direct runtime error with the API name in the message.
- If a future API needs configuration, do not smuggle it in as an ambiguous trailing object on an operand list. Use a distinct helper or a clearly named options-bearing API.

### Enforcement
- Any change to user-facing script APIs must run:
  - `forgecad check api`
- If the change also affects transforms, dimensions, placement refs, or geometry semantics, run the relevant existing invariant checks too.

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

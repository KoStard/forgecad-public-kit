# ⚒ ForgeCAD

Code-native parametric CAD for the LLM era.

**TypeScript IS the file format. The browser IS the CAD system.**

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:5173` — you'll see a split-pane editor + 3D viewport.

## How It Works

Write JavaScript/TypeScript in the left panel. The forge API is available globally:

```javascript
const width = param("Width", 80, { min: 40, max: 150, unit: "mm" });
const base = box(width, 60, 5);
const hole = cylinder(10, 8).translate(width / 2, 30, 0);
return base.subtract(hole);
```

- Every `param()` call creates a live slider
- Code auto-executes on change (400ms debounce)
- The 3D view updates in real-time
- Export to STL for 3D printing

## API Reference

### Primitives
- `box(x, y, z, center?)` — rectangular box
- `cylinder(height, radius, radiusTop?, segments?, center?)` — cylinder/cone
- `sphere(radius, segments?)` — geodesic sphere

### Booleans
- `union(...shapes)` — combine shapes
- `difference(...shapes)` — subtract shapes[1..n] from shapes[0]
- `intersection(...shapes)` — keep only overlapping volume

### Transforms (chainable)
- `.translate(x, y, z)`
- `.rotate(x, y, z)` — Euler angles in degrees
- `.scale(v)` — uniform or `[x, y, z]`
- `.mirror([nx, ny, nz])` — mirror over plane

### Parameters
- `param(name, default, { min?, max?, step?, unit? })` — declares a slider

## Architecture

```
Monaco Editor  ←→  Forge Runtime  ←→  Three.js Viewport
                       ↓
               Manifold (WASM)
              geometry kernel
```

~5 source files, ~500 lines of actual application code. Everything else is off-the-shelf:
Monaco, Three.js, Manifold WASM, React, Zustand.

## Tech Stack

- **Geometry**: [Manifold](https://github.com/elalish/manifold) (WASM) — fast boolean ops
- **Rendering**: Three.js via @react-three/fiber
- **Editor**: Monaco (VS Code's editor)
- **State**: Zustand
- **Build**: Vite

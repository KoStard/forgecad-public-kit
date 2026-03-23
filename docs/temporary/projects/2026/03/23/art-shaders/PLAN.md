# Art Shaders: Per-Object Materials & Capture Defaults

**Date**: 2026-03-23
**Status**: In Progress

---

## Goal

Unlock the next tier of ForgeCAD generative art by adding:

1. **Per-object material properties** — metalness, roughness, emissive glow, opacity, wireframe mode per shape
2. **Script-driven capture defaults** — let scripts specify framesPerTurn, pitchDeg, fps, etc. so `forgecad capture` just works without CLI flags
3. **New generative art examples** that demonstrate what's now possible with material control

## Current State (Baseline)

| Aspect | Current | After |
|--------|---------|-------|
| Per-object color | ✅ `.color('#ff0000')` or `{ color: '#ff0000' }` return | ✅ Same |
| Per-object metalness | ❌ Fixed 0.05 | ✅ `.material({ metalness: 0.9 })` |
| Per-object roughness | ❌ Fixed 0.35 | ✅ `.material({ roughness: 0.1 })` |
| Per-object emissive | ❌ None | ✅ `.material({ emissive: '#ff6b35', emissiveIntensity: 2 })` |
| Per-object opacity | ❌ Only via CLI scene state | ✅ `.material({ opacity: 0.5 })` |
| Per-object wireframe | ❌ Only via CLI render mode | ✅ `.material({ wireframe: true })` |
| Capture defaults from script | ❌ Hardcoded in CLI | ✅ `scene({ capture: { framesPerTurn: 120 } })` |

## Architecture

### Material Flow

```
.forge.js script
  shape.material({ metalness: 0.9, roughness: 0.1, emissive: '#ff0000' })
    ↓
  Shape stores materialProps alongside colorHex
    ↓
  runner.ts reads materialProps into SceneObject
    ↓
  Viewport.tsx / render.ts apply to MeshPhysicalMaterial
```

### Capture Defaults Flow

```
.forge.js script
  scene({ capture: { framesPerTurn: 120, pitchDeg: 25 } })
    ↓
  scene.ts validates + stores in SceneConfig
    ↓
  RunResult.sceneConfig includes capture
    ↓
  render.ts returns captureDefaults in __forgeCaptureInit result
    ↓
  forge-capture.ts applies script defaults before CLI overrides
```

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| P1 | Per-object material API on Shape + TrackedShape | ✅ Done |
| P2 | Wire materials through viewport + CLI renderer | ✅ Done |
| P3 | Capture defaults in scene() API | ✅ Done |
| P4 | New generative art examples (molten-forge, frost-spires) | ✅ Done |
| P5 | API docs + type definitions (forge-api.d.ts, viewport.md) | ✅ Done |
| P6 | Build + check suite | ✅ Done |

## Experiment Log

#### P1: Per-object material API (SUCCESS)
**What**: Added `ShapeMaterialProps` interface and `material()` method to both `Shape` and `TrackedShape` classes. Material properties (metalness, roughness, emissive, emissiveIntensity, opacity, wireframe, clearcoat, clearcoatRoughness) are stored on the shape and flow through transforms, clones, and boolean operations via `withCopiedDimensions`/`withTransformedDimensions`/`withMergedDimensions`.
**Result**: All examples compile. Material properties survive translate/rotate/scale chains.
**Lesson**: TrackedShape wraps Shape and has its own transform methods — any new Shape method needs a matching TrackedShape delegate.

#### P2: Wire materials through renderers (SUCCESS)
**What**: Updated Viewport.tsx (live rendering), cli/render.ts (headless capture), and serialization pipeline (serializeRunResult.ts, deserializeRunResult.ts, evalWorkerProtocol.ts) to carry materialProps from script through to MeshPhysicalMaterial.
**Result**: Per-object metalness, roughness, emissive glow, transparency, wireframe, and clearcoat all render correctly.

#### P3: Script-driven capture defaults (SUCCESS)
**What**: Added `capture` config to `scene()` API with validation. Capture defaults flow through `__forgeCaptureInit` result. CLI's `forge-capture.ts` tracks which flags were explicitly set (CLI or env) and only applies script defaults for unset values.
**Result**: Scripts can now specify `framesPerTurn`, `holdFrames`, `pitchDeg`, `fps`, `size`, and `background` — CLI flags still override.

#### P4: New generative art examples (SUCCESS)
**What**: Created `molten-forge.forge.js` (metallic pillars with emissive molten base, 50 objects) and `frost-spires.forge.js` (translucent ice crystals with inner glow, 51 objects). Updated all existing examples with capture defaults.
**Result**: All 5 generative art examples compile and produce geometry.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/kernel.ts` | Add `ShapeMaterialProps`, `material()` method, copy in dimension helpers |
| `src/forge/sketch/topology.ts` | Add `material()` delegate to TrackedShape |
| `src/forge/runner.ts` | Pass materialProps through SceneObject |
| `src/forge/scene.ts` | Add `SceneCaptureConfig` types + validation |
| `src/forge/serializeRunResult.ts` | Serialize materialProps in worker transfer |
| `src/forge/deserializeRunResult.ts` | Deserialize materialProps |
| `src/workers/evalWorkerProtocol.ts` | Add materialProps to SerializedSceneObject |
| `src/components/Viewport.tsx` | Apply per-object material props in live viewport |
| `cli/render.ts` | Apply material props + return captureDefaults in headless renderer |
| `cli/forge-capture.ts` | Track explicit CLI flags, apply script capture defaults |
| `src/forge/forge-api.d.ts` | Type definitions for ShapeMaterialProps, material(), SceneCaptureConfig |
| `src/forge/headless.ts` | Export new types |
| `src/forge/index.ts` | Re-export new types |
| `docs/permanent/API/runtime/viewport.md` | Document material() and capture config |
| `examples/generative-art/molten-forge.forge.js` | **New** — Metallic pillars + emissive molten base |
| `examples/generative-art/frost-spires.forge.js` | **New** — Translucent ice with inner glow |
| `examples/generative-art/crystal-growth.forge.js` | Added capture config |
| `examples/generative-art/neon-coral.forge.js` | Added capture config |
| `examples/generative-art/golden-spiral-tower.forge.js` | Added capture config |

# Scene API for Generative Art

**Date**: 2026-03-22
**Status**: Planning / Architecture Exploration

---

## Goal

Give ForgeCAD scripts full control over the **scene environment** — camera, lighting, background, materials, and post-processing — so that `.forge.js` files can produce presentation-ready renders and enter the generative art space.

Today ForgeCAD scripts control **geometry** but the scene is hardcoded. A generative art piece needs to control the full visual output: where the camera sits, what mood the lighting sets, whether there's bloom or grain, what the background looks like.

## Current State (Baseline)

| Aspect | Current | Controlled by script? |
|--------|---------|----------------------|
| **Camera position** | Auto-framed isometric, or persisted from localStorage | No |
| **Camera type** | Perspective (FOV 45°) / Orthographic toggle | No |
| **Background** | Hardcoded `0x252526` (dark gray) | No |
| **Ambient light** | White, intensity 0.3 | No |
| **Directional lights** | Two fixed lights (1.2 + 0.3 intensity) | No |
| **Hemisphere light** | Sky blue / gray, 0.4 intensity | No |
| **Environment map** | LocalStudioEnvironment with 4 Lightformers | No |
| **Material** | Fixed MeshPhysicalMaterial (blue, low metalness) | No |
| **Tone mapping** | ACES Filmic, exposure 1.0 | No |
| **Post-processing** | None (no bloom, SSAO, grain, vignette) | No |
| **Fog** | None | No |

Existing script-side scene APIs follow a **collect-during-execution** pattern:
- `viewConfig()` — joint overlay visuals
- `cutPlane()` — section planes
- `explodeView()` — exploded view directives
- `jointsView()` — joint animation

These all use the same architecture: script calls a function → state is collected → viewer reads collected state after execution. The scene API should follow this same pattern.

## Architecture Summary

### Proposed: `scene()` API

A new `scene(options)` function exported from the forge module, following the existing collect-during-execution pattern. Multiple calls merge (later overrides earlier), just like `viewConfig()`.

```js
// In a .forge.js script:
import { scene, box } from 'forgecad';

scene({
  background: '#0a0a0a',
  camera: {
    position: [200, 100, 150],
    target: [0, 0, 30],
    fov: 60,
  },
  lights: [
    { type: 'ambient', color: '#1a1a2e', intensity: 0.2 },
    { type: 'directional', position: [1, 2, 3], color: '#ff6b35', intensity: 1.5 },
    { type: 'point', position: [0, 0, 100], color: '#ffffff', intensity: 2, decay: 2 },
    { type: 'spot', position: [100, 0, 200], target: [0, 0, 0], angle: 0.3, penumbra: 0.5 },
  ],
  environment: {
    preset: 'sunset',       // or 'studio', 'warehouse', 'forest', 'night', 'none'
    intensity: 0.8,
    background: true,       // use env map as background too
  },
  fog: { color: '#0a0a0a', near: 100, far: 500 },
  postProcessing: {
    bloom: { intensity: 1.5, threshold: 0.8, radius: 0.4 },
    vignette: { darkness: 0.5, offset: 0.5 },
    grain: { intensity: 0.15 },
    toneMappingExposure: 1.2,
  },
});

// Geometry as usual
box(100, 100, 100);
```

### Per-Object Material Override

Materials are a separate concern — they should be controlled per-shape, not globally. This could be a future extension:

```js
box(100, 100, 100).material({
  color: '#ff6b35',
  metalness: 0.8,
  roughness: 0.2,
  emissive: '#ff6b35',
  emissiveIntensity: 0.3,
});
```

### Implementation Layers

```
┌──────────────────────────────────────────┐
│  .forge.js script                        │
│  scene({ camera, lights, background })   │
└────────────────┬─────────────────────────┘
                 │ collect-during-execution
                 ▼
┌──────────────────────────────────────────┐
│  src/forge/scene.ts                      │
│  Validates, stores SceneConfig           │
│  getCollectedScene() / resetScene()      │
└────────────────┬─────────────────────────┘
                 │ read after script run
                 ▼
┌──────────────────────────────────────────┐
│  Viewport.tsx / render.ts                │
│  Applies SceneConfig to Three.js scene   │
│  Camera, lights, bg, post-processing     │
└──────────────────────────────────────────┘
```

## Phased Rollout Plan

### Phase 1: Foundation — Camera + Background + Lights

**The 80/20.** These three controls unlock most generative art use cases.

| Feature | API | Implementation |
|---------|-----|----------------|
| Background color | `scene({ background: '#0a0a0a' })` | Set `scene.background` to `new THREE.Color(...)` |
| Background gradient | `scene({ background: { top: '#000', bottom: '#1a1a2e' } })` | Fullscreen gradient quad behind scene |
| Camera position | `scene({ camera: { position, target } })` | Override auto-frame with explicit values |
| Camera FOV | `scene({ camera: { fov: 60 } })` | Update PerspectiveCamera.fov |
| Camera type | `scene({ camera: { type: 'orthographic' } })` | Switch camera type |
| Lights array | `scene({ lights: [...] })` | Replace default lights with user-specified |
| Light types | ambient, directional, point, spot, hemisphere | Map to Three.js light classes |

### Phase 2: Environment + Fog

| Feature | API | Implementation |
|---------|-----|----------------|
| Environment presets | `scene({ environment: { preset: 'sunset' } })` | Use drei Environment presets or custom HDRIs |
| Environment intensity | `scene({ environment: { intensity: 0.8 } })` | Scale env map contribution |
| Env as background | `scene({ environment: { background: true } })` | Use env map as scene background |
| Fog | `scene({ fog: { color, near, far } })` | `THREE.Fog` or `THREE.FogExp2` |

### Phase 3: Post-Processing

| Feature | API | Implementation |
|---------|-----|----------------|
| Bloom | `scene({ postProcessing: { bloom: {...} } })` | `@react-three/postprocessing` UnrealBloomPass |
| Vignette | `scene({ postProcessing: { vignette: {...} } })` | Vignette effect |
| Film grain | `scene({ postProcessing: { grain: {...} } })` | Noise effect |
| Tone mapping | `scene({ postProcessing: { toneMappingExposure } })` | Adjust renderer exposure |
| Custom shaders | Future | ShaderPass with user GLSL |

### Phase 4: Per-Object Materials

| Feature | API | Implementation |
|---------|-----|----------------|
| Color/metalness/roughness | `.material({ color, metalness, roughness })` | Override default MeshPhysicalMaterial |
| Emissive | `.material({ emissive, emissiveIntensity })` | Glow effects for generative art |
| Wireframe | `.material({ wireframe: true })` | Wireframe rendering |
| Opacity | `.material({ opacity: 0.5 })` | Transparent objects |

## Progress Tracker

| # | Change | Scope | Status |
|---|--------|-------|--------|
| — | Baseline | No script scene control | Measured |
| P1 | `scene()` API foundation | Camera + Background + Lights | Done |
| P2 | Environment + Fog | Env presets, fog | Done |
| P3 | Post-processing | Bloom, vignette, grain | Done |
| P4 | Per-object materials | Material overrides on shapes | Future |

## Experiment Log

#### P1–P3: Full Scene API (SUCCESS)
**What**: Implemented `scene()` API with camera, lights (5 types), background (solid + gradient), fog (linear + exponential), environment presets, post-processing (bloom, vignette, grain, exposure), and ground plane. Wired into Viewport.tsx via SceneConfigurator component, CLI renderer (render.ts), and export scene builder (sceneBuilder.ts).
**Result**: All 4 demo scripts run successfully. 122-object golden spiral, 74-object neon coral, 13-object crystal growth, 4-object scene-basics — all compile and produce geometry. Check suite passes (only pre-existing SVG snapshot failure).
**Lesson**: The collect-during-execution pattern (`resetScene/getCollectedScene`) was the right choice — it exactly mirrors how viewConfig, cutPlane, etc. work.

## Competitive Landscape & Inspiration

### What generative art tools offer

| Tool | Scene Control | Key Strength |
|------|--------------|--------------|
| **Three.js (raw)** | Full — everything is code | Maximum flexibility, but no CAD |
| **p5.js** | WebGL mode with lights/camera | 2D-first, 3D is limited |
| **OpenSCAD** | None — geometry only | Parametric but no visual control |
| **Blender (Geometry Nodes)** | Full scene in Blender UI | Powerful but not code-first |
| **SDF tools (Shadertoy, hg_sdf)** | Full — shader-level control | Beautiful but no mesh output |
| **cables.gl** | Node-based, full Three.js | Visual programming |

### ForgeCAD's unique position

ForgeCAD combines **real CAD geometry** (boolean ops, extrusions, fillets, STEP export) with **code-first parametric design**. No other generative art tool can:

1. Generate art-quality renders **and** export manifold meshes for 3D printing
2. Use real CAD operations (fillets, chamfers, boolean ops) in generative workflows
3. Provide parametric sliders that work on both geometry and scene
4. Export to STEP for CNC machining of generative art pieces

The scene API would complete the pipeline: **design → render → fabricate**.

## Key Design Decisions

### 1. Additive vs. Replacement Lighting

**Decision**: When `scene({ lights: [...] })` is specified, it **replaces** the default lights entirely. If no lights are specified, defaults apply.

**Why**: Generative art needs full control. Additive lighting (adding to defaults) would force users to fight the defaults. The current defaults are good for CAD viewing but wrong for artistic scenes.

### 2. Camera Override vs. Auto-Frame

**Decision**: `scene({ camera: {...} })` overrides auto-framing. If camera is not specified, auto-frame behavior is preserved.

**Why**: Auto-frame is essential for CAD (you always want to see the whole part). But for art, the camera IS the composition — it must be explicit.

### 3. CLI Render Support

**Decision**: The scene API must work in both the browser viewer AND the headless CLI renderer (`forgecad render`).

**Why**: Generative art workflows need batch rendering — generate 100 variations, render them all. The CLI renderer (`cli/render.ts`) already has its own Three.js setup that must respect scene config.

### 4. `param()` Integration

**Decision**: Scene values should work with `param()` for interactive exploration.

```js
scene({
  camera: { position: [param('camX', 200), param('camY', 100), param('camZ', 150)] },
  lights: [
    { type: 'point', intensity: param('lightIntensity', 2) },
  ],
});
```

**Why**: This is ForgeCAD's killer feature for generative art — tweak scene parameters with sliders in real-time. No other tool offers this.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/scene.ts` | **New** — SceneConfig types, validation, collect/reset/get (286 lines) |
| `src/components/SceneConfigurator.tsx` | **New** — React component applying scene config in viewport (300 lines) |
| `src/forge/headless.ts` | Export scene API from headless module |
| `src/forge/index.ts` | Re-export scene API + types for browser |
| `src/forge/runner.ts` | Added scene to sandbox, RunResult, reset/collect cycle |
| `src/store/forgeStore.ts` | Added sceneConfig to error RunResult |
| `src/components/Viewport.tsx` | Conditional default lights/env, SceneConfigurator integration |
| `cli/render.ts` | Scene config application (lights, bg, fog, camera) in CLI renderer |
| `src/forge/sceneBuilder.ts` | Scene config application in export buildScene() |
| `examples/api/scene-basics.forge.js` | **New** — API reference demo |
| `examples/generative-art/crystal-growth.forge.js` | **New** — Crystal cluster with dramatic lighting |
| `examples/generative-art/golden-spiral-tower.forge.js` | **New** — Golden ratio spiral tower |
| `examples/generative-art/neon-coral.forge.js` | **New** — Neon coral colony showpiece |
| `package.json` | Added `@react-three/postprocessing` + `postprocessing` deps |

## Open Questions

1. **Animation**: Should `scene()` support animated cameras (orbit, dolly) for `forgecad capture`? Or is that a separate API?
2. **Shadow support**: Three.js shadows require specific light types and renderer config. Worth including in Phase 1?
3. **Custom HDRIs**: Should we support user-provided HDRI files, or just built-in presets?
4. **Ground plane / grid**: Should the scene API control the grid visibility and ground shadows?
5. **Per-object materials**: Should this be `.material()` on shapes, or a materials map in `scene()`?

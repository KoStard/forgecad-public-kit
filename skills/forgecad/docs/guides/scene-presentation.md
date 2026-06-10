---
skill-group: recipes
skill-order: 1
---

# Scene Presentation Recipes

Worked `scene()` setups. The option schema and behavioral cliffs (e.g. setting `lights` replaces all defaults) live in the `scene()` API docs (viewport group) — this file is copyable recipes only.

## Baseline studio setup

Every model deserves at least this; default lighting looks flat.

```js
scene({
  background: { top: '#1a1a2e', bottom: '#0a0a14' },
  camera: { position: [x, y, z], target: [0, 0, 0], fov: 42 },
  environment: { preset: 'studio', intensity: 0.6 },
  lights: [
    { type: 'ambient', color: '#c8cdd4', intensity: 0.15 },
    { type: 'directional', position: [80, -60, 120], target: [0, 0, 0], color: '#fff4e0', intensity: 1.8, castShadow: true },
    { type: 'directional', position: [-60, 40, 80], target: [0, 0, 0], color: '#b0c4de', intensity: 0.7 },
  ],
  ground: { visible: true, color: '#111118', height: -10, receiveShadow: true },
  postProcessing: {
    bloom: { intensity: 0.3, threshold: 0.85, radius: 0.3 },
    vignette: { darkness: 0.5, offset: 0.4 },
    toneMappingExposure: 1.3,
  },
});
```

Adapt to the material family: metallic/jewelry → `studio`, exposure 1.2–1.5, subtle bloom; organic/wood/matte → `warehouse`/`apartment`, warmer ambient, lower bloom; dark/dramatic → `night`, bloom + vignette. Ground with `receiveShadow: true` only for objects that stand on something.

Camera: 3/4 angle, `fov` 35–50 (lower = flatter/telephoto), `target` at the visual center of mass — not necessarily `[0,0,0]`.

## Matte industrial hero shot

For mechanisms, tools, product prototypes, and vehicles, prefer a matte studio look over gloss or atmosphere (ranges = tuning room, not options syntax):

```js
scene({
  background: { top: '#c3ccd7', bottom: '#566474' },
  camera: { position: [430, -540, 340], target: [0, 30, 125], fov: 38 },
  environment: { preset: 'studio', intensity: 0.2, background: false },  // 0.15–0.25
  lights: [
    { type: 'ambient', color: '#efe7dc', intensity: 0.15 },                                            // 0.12–0.2
    { type: 'directional', position: [260, -320, 420], color: '#ffe2bf', intensity: 2.8, castShadow: true }, // 2.6–3.2
    { type: 'directional', position: [-260, 210, 220], color: '#d4e6fb', intensity: 0.85 },             // 0.7–1.0
    { type: 'hemisphere', skyColor: '#c7d3df', groundColor: '#495463', intensity: 0.15 },               // 0.1–0.2
  ],
  postProcessing: {
    bloom: { intensity: 0.04, threshold: 0.94, radius: 0.28 },
    vignette: { darkness: 0.4, offset: 0.32 },
    toneMappingExposure: 1.1,  // 1.05–1.18
  },
});
```

Stage the model on an intentionally matte plinth:

```js
const stage = cylinder(16, 226).translate(0, 0, -26)
  .color('#8b97a4').material({ metalness: 0.04, roughness: 0.78 });
mock(stage, 'StudioPlinth');
```

Iteration rules that held up in practice:

- Prefer roughness over fog for softness — fog flattens form; matte materials keep shadow definition.
- Keep bloom near zero for mechanical scenes; too much reads toy-like.
- If the render is close but not right, nudge `toneMappingExposure` by ~0.05 before touching the light rig; avoid large ambient jumps — they kill contrast fastest.
- Add accent point lights near focal features, localized with `distance` and `decay`.

## Named render views

For repeatable review or hero renders, declare views in `scene({ views })` — wrap each camera in `{ camera: ... }`:

```js
scene({
  camera: { position: [430, -540, 340], target: [0, 30, 125], fov: 38 },
  views: {
    hero: { camera: { position: [430, -540, 340], target: [0, 30, 125], up: [0, 0, 1], fov: 38 } },
    side: { camera: { position: [700, 0, 180], target: [0, 30, 100], up: [0, 0, 1], fov: 32 } },
  },
});
```

Render one with `forgecad render 3d model.forge.js --view hero`.

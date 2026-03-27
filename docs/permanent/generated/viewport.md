# Viewport & Runtime

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

Cut planes, exploded views, joint animations, and scene configuration.

## Functions

### Viewport & Runtime

Configure viewport behavior: cut planes, exploded views, joint controls.

#### `jointsView()`

```ts
jointsView(options?: JointsViewOptions): void
```

Configure runtime joint controls that animate object transforms in the viewport without re-running the script.

#### `cutPlane()`

```ts
cutPlane(name: string, normal: [ number, number, number ], offset?: number, options?: CutPlaneOptions): void
```

Define a named section/cut plane. Appears as a toggle in the View Panel. When enabled, geometry on the positive side of the plane is clipped away.

#### `cutPlane()`

```ts
cutPlane(name: string, normal: [ number, number, number ], options?: CutPlaneOptions): void
```

#### `explodeView()`

```ts
explodeView(options?: ExplodeViewOptions): void
```

Configure viewport exploded-view behavior for the current script execution. Multiple calls merge; later values override earlier ones.

#### `scene()`

```ts
scene(options: SceneOptions): void
```

Configure the scene environment for the current script execution. Controls camera, lighting, background, fog, and post-processing. Multiple calls merge; later values override earlier ones. ```js scene({ background: '#0a0a0a', camera: { position: [200, 100, 150], target: [0, 0, 30], fov: 60 }, lights: [ { type: 'ambient', color: '#1a1a2e', intensity: 0.2 }, { type: 'point', position: [0, 0, 100], color: '#ff6b35', intensity: 2 }, ], fog: { color: '#0a0a0a', near: 100, far: 500 }, postProcessing: { bloom: { intensity: 1.5, threshold: 0.8, radius: 0.4 }, }, }); ```

#### `viewConfig()`

```ts
viewConfig(options?: ViewConfigOptions): void
```

Configure runtime viewport visuals for the current script execution. Multiple calls merge; later values override earlier ones.

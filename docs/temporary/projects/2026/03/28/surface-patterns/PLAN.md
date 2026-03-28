# Surface Patterns for 3D Printing

## Goal

Add surface pattern capabilities to ForgeCAD so users can create stunning patterned 3D-printable objects with a few lines of code. Done = noise functions, Voronoi, honeycomb, and pattern presets all work as SDF nodes with showcase examples.

## Phases

- **Phase 1** (this project): SDF pattern primitives + showcase examples
- **Phase 2** (future): Composition, masking, gradient/falloff
- **Phase 3** (future): UV parametrization, image displacement, surface-following patterns

---

## Workstreams (Phase 1)

### WS1: Noise Functions (SDF Nodes)
**Deliverable**: `sdf.noise()` and `sdf.voronoi()` as first-class SDF nodes with full evaluator + bounds support
**Dependencies**: none
**Status**: not started

The two fundamental building blocks everything else builds on.

Tasks:
- [ ] Add `SdfNoiseNode` to sdfNode.ts (kind: `sdf:noise`, params: scale, amplitude, octaves, seed)
- [ ] Implement Simplex 3D noise evaluator in sdfEval.ts (pure math, no deps)
- [ ] Add `SdfVoronoiNode` to sdfNode.ts (kind: `sdf:voronoi`, params: cellSize, wallThickness, seed)
- [ ] Implement Worley noise (Voronoi) evaluator in sdfEval.ts
- [ ] Add bounds estimation for both nodes
- [ ] Add cloneSdfNode cases for both nodes
- [ ] Export `sdf.noise()` and `sdf.voronoi()` factory functions in sdf.ts
- [ ] Verify both compile and mesh correctly via `.toShape()`

### WS2: Pattern Presets
**Deliverable**: High-level pattern functions built on top of SDF primitives (honeycomb, waves, knurl, perforated, scales)
**Dependencies**: WS1 (noise/voronoi are building blocks for some presets)
**Status**: not started

These can be pure SDF compositions — no new node types needed. They're convenience functions that combine existing primitives.

Tasks:
- [ ] `sdf.honeycomb({ cellSize, wallThickness })` — hex grid pattern (SDF composition)
- [ ] `sdf.waves({ wavelength, amplitude, axis })` — sinusoidal ridges
- [ ] `sdf.knurl({ pitch, depth, angle })` — helical grooves for cylindrical grips
- [ ] `sdf.perforated({ radius, spacing })` — regular hole array
- [ ] Export all from sdf.ts namespace

### WS3: API, Docs, Types
**Deliverable**: Updated public API types, documentation, and `npm run refresh` passing
**Dependencies**: WS1, WS2
**Status**: not started

Tasks:
- [ ] Run `npm run refresh` to regenerate types and docs
- [ ] Update `docs/permanent/API/core/sdf.md` with new pattern functions
- [ ] Ensure TypeScript compiles clean

### WS4: Showcase Examples
**Deliverable**: 3-5 stunning `.forge.js` example files demonstrating surface patterns
**Dependencies**: WS1, WS2
**Status**: not started

Tasks:
- [ ] Voronoi vase (the hero demo)
- [ ] Gyroid + noise organic sculpture
- [ ] Knurled handle / grip
- [ ] Honeycomb lampshade
- [ ] Run each through CLI to verify mesh output

## Dependency Map

```
WS1 (noise/voronoi) ──→ WS2 (presets) ──→ WS3 (docs/types)
                                       ──→ WS4 (examples)
```

WS1 is the critical path. WS2 partially depends on WS1 (honeycomb/waves/knurl don't need noise, but some presets may). WS3 and WS4 run after WS1+WS2.

## Progress Tracker

| Workstream | Status | Milestone | Notes |
|------------|--------|-----------|-------|
| WS1: Noise Functions | done | All nodes compile + mesh | simplex3 in noise.ts, worley3 in voronoi.ts, both integrated as SDF nodes |
| WS2: Pattern Presets | done | All presets verified | honeycomb, waves, knurl, perforated — all tested via CLI |
| WS3: API, Docs, Types | done | npm run refresh passes | Barrel exports updated, types regenerated |
| WS4: Showcase Examples | in progress | Agent writing 5 examples | voronoi-sphere, organic-noise, patterned-vase, perforated-box, gyroid-voronoi |

## Decision Log

| # | Decision | Why | Impact |
|---|----------|-----|--------|
| D1 | Implement noise/voronoi as native SDF nodes, not custom functions | Performance (evaluated millions of times during meshing) and bounds estimation | Requires changes to sdfNode.ts + sdfEval.ts + sdf.ts |
| D2 | Pattern presets as pure SDF compositions, not new node types | Keeps the node system lean; presets are just convenience wrappers | Less code, easier maintenance |
| D3 | Simplex noise over Perlin | Better isotropy (no axis-aligned artifacts), similar performance | Standard choice for 3D applications |
| D4 | Extracted TPMS functions to tpms.ts | sdfEval.ts was growing large — clean code | Keeps evaluator focused on compilation logic |

## Open Questions

- Should noise `seed` use a hash-based approach or offset-based? (hash is more principled but offset is simpler)
- What default edgeLength gives good pattern detail without being too slow?

## Files Modified

| File | Workstream | Purpose |
|------|------------|---------|
| `src/forge/sdf/sdfNode.ts` | WS1 | New node types: SdfNoiseNode, SdfVoronoiNode |
| `src/forge/sdf/sdfEval.ts` | WS1 | Evaluators for noise + voronoi nodes |
| `src/forge/sdf/sdf.ts` | WS1, WS2 | Factory functions + pattern presets (noise, voronoi, honeycomb, waves, knurl, perforated) |
| `src/forge/sdf/index.ts` | WS3 | Updated barrel exports |
| `src/forge/sdf/noise.ts` | WS1 | 3D Simplex noise implementation |
| `src/forge/sdf/voronoi.ts` | WS1 | 3D Worley noise (Voronoi) implementation |
| `src/forge/sdf/tpms.ts` | cleanup | Extracted TPMS evaluators from sdfEval.ts |
| `examples/api/voronoi-sphere.forge.js` | WS4 | Hero demo: voronoi sphere |
| `examples/api/organic-noise-sculpture.forge.js` | WS4 | Noise-displaced organic shape |
| `examples/api/patterned-vase.forge.js` | WS4 | Voronoi vase |
| `examples/api/perforated-box.forge.js` | WS4 | Perforated plate/speaker grille |
| `examples/api/gyroid-voronoi-blend.forge.js` | WS4 | Composing multiple patterns |

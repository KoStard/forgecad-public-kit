# Surface Patterns for 3D Printing

## Goal

Add surface pattern capabilities to ForgeCAD so users can create stunning patterned 3D-printable objects with a few lines of code. A clear differentiator for ForgeCAD — code-first, parametric, composable patterns that no other tool offers.

## Phases

- **Phase 1**: SDF pattern primitives + showcase examples — **DONE**
- **Phase 2**: Composition, parametric displacement, blend, more presets — **DONE**
- **Phase 3**: UV parametrization, image displacement, surface-following patterns — **FUTURE**

---

## Progress Tracker

| Workstream | Status | Notes |
|------------|--------|-------|
| WS1: Noise Functions | done | simplex3 (noise.ts), worley3 (voronoi.ts), both as native SDF nodes |
| WS2: Pattern Presets | done | honeycomb, waves, knurl, perforated, scales, brick |
| WS3: API, Docs, Types | done | Barrel exports, types regenerated, `npm run refresh` passes |
| WS4: Showcase Examples | done | 5 in examples/api/, 4 in examples/showcase/ |
| WS5: Closure Fix | done | `.displace(fn, { constants })` — param() values work in displacement |
| WS6: Spatial Blend | done | `sdf.blend(a, b, fn)` — smooth transitions between patterns |
| WS7: More Patterns | done | lidinoid TPMS, scales, brick |
| WS8: Voronoi Fix | done | F2-F1 wall distance instead of F1 blob distance |

## Known Issues

### Voronoi thin membranes
The (F2-F1)/2 wall distance metric produces thin residual layers in some cells instead of clean open holes. The approximation isn't perfect — true Voronoi edges are geometric bisectors, not exactly at (F2-F1)/2. Needs investigation: either a sharper falloff, a different distance metric, or post-processing.

### SDF docs not updated
`docs/permanent/API/core/sdf.md` only covers the original SDF features. The 12 new pattern functions, blend, and constants support need documentation. The forgecad skill also doesn't know about the new patterns yet.

## Decision Log

| # | Decision | Why | Impact |
|---|----------|-----|--------|
| D1 | Noise/voronoi as native SDF nodes | Performance (millions of evals) + bounds estimation | sdfNode.ts + sdfEval.ts changes |
| D2 | Pattern presets as sdf:custom wrappers | Keeps node system lean | Less code, easier maintenance |
| D3 | Simplex noise over Perlin | Better isotropy, no axis-aligned artifacts | Standard for 3D |
| D4 | Extracted TPMS to tpms.ts | sdfEval.ts was growing | Clean separation of concerns |
| D5 | Constants map for closure fix | Backwards compatible, clean injection | Unblocks parametric patterns |
| D6 | Spatial blend as linear SDF interpolation | Simple, composable, correct for mixing fields | Enables pattern gradients |
| D7 | Lidinoid as native node (not custom) | Performance parity with other TPMS types | Consistent architecture |
| D8 | Voronoi: F2-F1 wall distance | F1-only produced disconnected blobs | Connected walls, but has thin membrane issue |

## Recommended Next Steps

### Immediate (before merge to mainline)
1. **Fix voronoi thin membranes** — investigate sharper distance metric or threshold
2. **Visual verification** — check all showcase models in viewport after voronoi fix
3. **Update SDF docs** — document all 12+ new pattern functions in sdf.md

### Short-term (separate sessions)
4. **Variable density patterns** — `.warp((x,y,z) => [x',y',z'])` domain warp for spatially varying pattern scale
5. **More showcase models** — use closure fix for parametric patterns, use blend for gradient demos
6. **Skill update** — run `npm run refresh` after docs update so Claude knows about new patterns

### Medium-term (Phase 3)
7. **Image heightmap displacement** — load grayscale PNG, use as displacement source. Unlocks lithophanes and branded textures. Needs image decoding in eval worker.
8. **Mesh-level surface displacement** — `shape.surfaceDisplace(fn, depth)` pushes vertices along normals. Enables patterns on B-rep shapes, not just SDF. Risk: self-intersection.
9. **UV parametrization** — generate UVs for common shapes (cylinders, spheres, flat faces). Makes patterns follow surface curvature instead of world space. Hard for arbitrary shapes.

### Beyond code
10. **Community content** — "3 lines to a voronoi vase" demo post
11. **Landing page material** — showcase models as hero shots

## Files Modified

| File | Phase | Purpose |
|------|-------|---------|
| `src/forge/sdf/noise.ts` | P1 | 3D Simplex noise (seeded) |
| `src/forge/sdf/voronoi.ts` | P1 | 3D Worley noise returning [F1, F2] |
| `src/forge/sdf/tpms.ts` | P1 | Extracted TPMS evaluators + lidinoid |
| `src/forge/sdf/sdfNode.ts` | P1+P2 | Node types: noise, voronoi, lidinoid, spatialBlend, constants on displace/custom |
| `src/forge/sdf/sdfEval.ts` | P1+P2 | Evaluators for all new nodes, constants injection |
| `src/forge/sdf/sdf.ts` | P1+P2 | All factory functions + pattern presets |
| `src/forge/sdf/index.ts` | P1+P2 | Barrel exports |
| `examples/api/*.forge.js` | P1 | 5 API examples (voronoi-sphere, organic-noise, patterned-vase, perforated-box, gyroid-voronoi-blend) |
| `examples/showcase/*.forge.js` | P2 | 4 hero models (voronoi-lampshade, twisted-lattice-tower, coral-vase, nested-spheres) |

## Git History

| Commit | Description |
|--------|-------------|
| b64ece6 | Phase 1: noise, voronoi, honeycomb, waves, knurl, perforated + 5 examples |
| 0851ffb | Phase 2: closure fix, blend, lidinoid, scales, brick + 4 showcase models |
| 56bbf01 | Fix voronoi: F2-F1 wall distance instead of F1 center distance |

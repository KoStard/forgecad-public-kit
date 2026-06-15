---
skill-group: cli
skill-order: 2
---

# Inspection Bundles — Evidence Contract

`forgecad inspect <family> <mode>` writes a deterministic bundle: evidence PNGs under `evidence/<type>/` plus a root `manifest.json`. **The manifest is the authoritative contract** — take file paths, encodings, per-view ranges, thresholds, tolerances, and identity maps from it; never hard-code bundle layout or infer object identity from object order. The PNGs are a visual index for locating findings, not standalone artifacts. Command tree, flags, and `--focus`/`--hide` filtering live in `docs/skill/CLI.md` and `forgecad inspect evidence`; the inspection workflow lives in the `forgecad-inspect-model` skill. Model-authored `scene()` background, lights, fog, and exposure are ignored for inspection captures so evidence stays stable; named scene views remain available via `--view`.

Manifest evidence keys are evidence-oriented and stable for bundle readers: e.g. `fit interference` writes `manifest.evidence.collisions`, `physical components` writes `manifest.evidence.connectivity`.

## Reading Rules

- **Identity evidence** (`objects`, `connectivity`, `distance`, `collisions`): colors are bundle-local labels. Resolve every color through the manifest; the same color never carries universal meaning across bundles. Edge pixels may be antialiased blends — match solid interior colors.
- **Metric evidence** (`depth`, `thickness`, `roughness`, `distance`, `comparison`): read manifest thresholds, ranges, object summaries, and warnings before judging a PNG by eye.
- Black pixels are background = `null` (in `floating`, black also means ground-reachable geometry).
- Treat unexpected collisions, critical thin regions, high unresolved thickness, wrong component counts, floating bodies, or surprising gaps as **model bugs to fix and reinspect** — not rendering noise.
- Use section evidence to inspect hidden internals; never turn the production model into a permanent cutaway.

## The Physical-Contact Model

Connectivity, floating, distance, and thickness all share one contact model:

- **Bbox is broadphase only.** Bbox overlap or bbox face contact never merges separate scene objects and is never support evidence.
- Mesh surfaces within the contact tolerance (see manifest) count as **physically connected**.
- **Positive-volume boolean overlap** above the overlap threshold is a *collision defect* (`collisions` evidence), distinct from connectivity grouping. Face-touching parts are not collisions.
- A `union()` result with disconnected mesh islands is inspected as **separate bodies** (`Part body 1`, `Part body 2`, …).
- **Grounded** = a connected component reaches the ground plane (visible model minZ, or lowered by `scene({ ground: { offset } })`) within bed tolerance. Everything else is floating.

## Evidence Semantics

**image** — standard solid render with thin edge overlay, `inspection` render style.

**depth** — visible ray-distance heatmap, normalized per view between manifest `minDistance`/`maxDistance`; blue near → green → red far. A visual heatmap, not raw float depth.

```text
rayDistance = distance(cameraPosition, surfacePoint)
normalized = (rayDistance - minDistance) / (maxDistance - minDistance)
```

**normals** — camera-view normals (not world-space) packed into RGB:

```text
normal = normalize((rgb / 255) * 2 - 1)
```

**zebra** — reflective stripe render read by **stripe continuity**: smooth flowing bands are healthy; kinks, breaks, and faceting deserve investigation. A shader diagnostic, not a curvature-continuity proof — tessellation quality and available smooth normals limit its fidelity.

**roughness** — mesh-dihedral heatmap: smooth/moderate triangles render as a faint shadow; triangles adjacent to sharp edges render orange; harsh, boundary, or non-manifold edges render magenta (angle thresholds in the manifest). Point colors are local to physical feature edges — smooth tessellation diagonals do not light up, and moderate angles stay in the shadow layer so intentionally curved surfaces don't read as defects. Also writes `evidence/roughness/point-cloud.json` with per-sample object identity, local position, normal, angle, class, color, and represented area.

**objects** — one object-color image per view; resolve non-black pixels through `manifest.evidence.objects.objects` (index, color, id, name, group, tree path, mock flag).

**connectivity** — one physical-component-color image per view; resolve through `manifest.evidence.connectivity.components`; every visible object has a `componentIndex`. Components are the transitive closure over mesh-contact and exact-overlap edges (see contact model). Object-level in the PNG: disconnected kernel bodies are reported in the manifest but not split into per-body colors.

**floating** — highlights components with no contact path to the ground plane (see contact model for grounding). Use `connectivity`/`distance`/`collisions` for the full graph, rooted gaps, or overlap defects.

**distance** — rooted component-distance heatmap, green at the root through yellow to red. Root = largest component; `rootDistance` = shortest accumulated gap from root. **v1 metric is bbox-gap**, not closest mesh-surface distance — concave components can make reported gaps smaller than reality. The complete gap graph is quadratic, so the manifest stores a compact nearest-gap / root-parent edge subset (`gapEdges`); `gapEdgeCount` reports the logical complete-graph count.

**comparison** — reference-vs-candidate overlay (`--compare-with <ref>` or `compareWith('./reference.3mf')` in model code). **Amber = extra candidate surface; cyan = reference surface missing from the candidate.** PNG coverage is screen-space only — hidden/internal mismatches require `evidence/comparison/mismatch-points.json` and the geometric `compare 3d` score in the manifest, which are the source of truth; the PNG is the visual index.

**collisions** — ghosted source objects with solid per-finding palette colors on actual boolean intersection volumes; match interiors against `manifest.evidence.collisions.collisions[].color`. Broadphase pruning never changes findings (real intersection volume cannot exceed bbox intersection volume). Respects the same `--focus`/`--hide` visibility set as all evidence.

**thickness** — area-weighted surface point samples cast through the object along their normals; red = below min, orange = below warn, green = acceptable, blue = above max (thresholds in manifest; override via CLI flags). Contact-seam rule: rays crossing into a direct physical-contact neighbor skip hits within contact tolerance and continue to the next surface, so a modeled micro-gap between touching parts doesn't read as a paper-thin wall. **Gray/unresolved area means the heatmap is incomplete, NOT that the model is safe** — open meshes, concave geometry, coarse tessellation, or low sample counts leave unresolved regions. A mesh/raycast approximation, not FEA. Also writes `evidence/thickness/point-cloud.json` with per-sample object identity, local position, normal, thickness, class, color, and represented area.

**sections** — exact 2D contour slices, three explicit modes:

- `sections at` — one exact cut through a localized feature (`--plane yz --offset 12.5`).
- `sections stack` — periodic physical slices for reconstruction scans (`--every <spacing>`, plus a final max-bound slice when the span isn't an exact multiple).
- `sections sample` — sparse representative slices (`--count N`; defaults to the principal `xy`/`xz`/`yz` families when no plane is given).

`--angle` rotates a vertical plane family around Z without manual normal math: `0` ≈ YZ, `90` ≈ XZ. The renderer refuses bundles above `--max-slices`. Per-slice and per-family metadata (offsets, areas, ranges, spacing) comes from the manifest.

## `inspect section` Probe Contract

`inspect section` writes a one-off probe directory — `result.json`, `section.svg`, `section.png` — instead of a bundle. `result.json` fields:

- `section.frame` — `u`/`v` define the section-local coordinate system for rulers.
- `section.objects` — per-object areas, bounds, and loop counts; `section.svg` holds the actual outlines.
- `rulers[].insideSegments` — exact intervals where the ray is inside any sectioned object.
- `rulers[].gaps` — exact intervals between solid spans along the ray, including end gaps.
- `replaySpec` — the recipe to rerun the probe against a candidate via `inspect replay`.
- `comparison.rulers` — replay deltas against the original probe (present in replay results).

## `inspect sketch` JSON Contract

`inspect sketch` is external inspection: it runs the script, then reads returned scene objects and shape compile plans (model code never calls an inspection API). It reports selectable 2D regions from returned `Sketch`/`ConstraintSketch` objects and profile-bearing returned shapes (`extrude.profile`, `cut.profile`, `revolve.profile`).

JSON contract: `targets[]` are inspectable sketches/profile uses; `regions[]` are filled selectable areas sorted largest-first with run-local ids like `R0`; `holes[]` are excluded interiors; `selection` is present only with `--seed`; `profileTree` is compile-plan provenance, not JavaScript variable names. **Stable selection v1 is `--seed x,y`, not region id.** Seed failures are explicit and exit nonzero: outside every region, on a boundary, inside a hole, ambiguous, no regions, or incompatible operation. `--operation extrude` only checks whether the selected filled region can be consumed by extrusion; open path/rail selection is intentionally unsupported in v1.

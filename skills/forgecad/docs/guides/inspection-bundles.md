---
skill-group: cli
skill-order: 2
---

# Inspection Bundles

`forgecad inspect <evidence>` writes a deterministic directory bundle for
agents, tests, and automation. Use it when a single shaded PNG is too ambiguous
and the consumer needs geometry-aware evidence such as depth, normals, Zebra
stripes, surface roughness, part identity, physical connected components,
collisions, local thickness, or cross-sections.

## When To Use It

- Use `forgecad inspect <evidence>` for local agent repair loops, model
  debugging, and targeted visual evidence.
- Use `forgecad render 3d` for a quick human viewport PNG.
- Use `forgecad render section` when you only need one specific cut plane.
- Use `forgecad render hq` for presentation-quality output, docs, and marketing
  renders.

## Command

```bash
forgecad inspect collisions model.forge.js --camera iso
forgecad inspect objects model.forge.js --camera front --camera right
forgecad inspect thickness model.forge.js --min 1.2 --warn 2.0
forgecad inspect sections model.forge.js
forgecad inspect comparison model.forge.js --with reference.3mf
forgecad inspect evidence
```

The default output directory is `<script-name>-<evidence>-inspect/` next to the
input file. A bare command emits one `iso` view. Pass `--camera` repeatedly,
`--view`, `--camera-json`, or `--scene` to use the same view strategy as
`render 3d`. Pass `--force` to replace an existing bundle directory.

`--focus` and `--hide` use the same object-name filtering semantics as
`forgecad run` and `forgecad render 3d`. A bare `--focus` hides mock objects;
`--focus name1,name2` emits only matching objects; `--hide name1,name2` removes
matching objects from an otherwise visible scene. Matching is case-insensitive
and supports `*` / `?` globs, so grouped child objects are usually best matched
with patterns such as `Bench.*`.

## Bundle Layout

Bundles store image evidence under an `evidence/` directory. An
`inspect objects` bundle with `front`, `right`, and `iso` cameras has this
layout:

```text
model-objects-inspect/
  manifest.json
  evidence/
    objects/
      front.png
      right.png
      iso.png
```

Use targeted evidence commands for expensive analyses:

```bash
forgecad inspect depth model.forge.js --camera iso
forgecad inspect normals model.forge.js --camera iso
forgecad inspect zebra model.forge.js --camera iso
forgecad inspect roughness model.forge.js --camera iso
forgecad inspect objects model.forge.js --camera iso
forgecad inspect collisions model.forge.js --camera iso
forgecad inspect sections model.forge.js
forgecad inspect thickness model.forge.js --min 1.2 --warn 2.0 --camera iso
forgecad inspect comparison model.forge.js --with reference.3mf
```

Supported evidence commands are `image`, `depth`, `normals`, `zebra`,
`roughness`, `objects`, `connectivity`, `floating`, `distance`, `comparison`,
`collisions`, `thickness`, and `sections`. The same names are used in
`manifest.evidence`.

## How To Read A Bundle

Read inspection bundles as feedback about the model, not as standalone images.
Start with `manifest.json`, then use the evidence PNGs to locate and understand
the finding in the rendered geometry.

1. Confirm `bundle.evidenceRequested`, `bundle.evidenceEmitted`, and
   `bundle.filters` so you know what was inspected and what was hidden.
2. Check `scene.bbox`, `scene.volume`, and `scene.objects` for missing geometry,
   absurd scale, unexpected mocks, or wrong object names.
3. For identity evidence such as `objects`, `connectivity`, `distance`, and
   `collisions`, resolve colors through the evidence manifest. The same visual
   color does not carry a universal meaning across bundles.
4. For metric evidence such as `depth`, `roughness`, `thickness`, `distance`, and `comparison`,
   read the thresholds, ranges, object summaries, and warnings before judging a
   PNG by eye.
5. Inspect image and object evidence first when you need visual context, then
   the risk evidence and any orthographic view that exposes the issue. Use
   section slices only to inspect hidden internals; do not turn the production
   model into a permanent cutaway.
6. Treat unexpected collisions, critical thin regions, unresolved thickness,
   missing section detail, wrong component counts, floating bodies, or surprising
   distance gaps as model bugs to fix and reinspect.

Common color reading rules:

- Black is usually background; in `floating`, black also means ground-reachable
  geometry.
- `objects` and `connectivity` colors are labels. Use the manifest to map colors to
  objects, groups, components, or body entries.
- `collisions` colors mark solid overlap findings; match them to
  `manifest.evidence.collisions.collisions[].color`.
- `thickness` uses red/orange for critical or warning-thin regions, green/blue
  for acceptable or thick regions, and gray for unresolved samples.
- `distance` grades rooted component gaps from green near the root through
  yellow to red farther away.
- `comparison` uses the same Difference Only overlay as the viewport: faint
  model context, amber candidate mismatch evidence, and cyan reference mismatch
  evidence.
- `depth` grades visible camera distance from blue near the camera through green
  to red farther away.
- `roughness` uses orange and magenta for sharp, harsh, boundary, or
  non-manifold edge neighborhoods.
- `zebra` is read by stripe continuity: smooth flowing bands are healthy, while
  kinks, breaks, and faceting deserve investigation.
- `normals` is an encoded camera-view normal map. Use it with `image` and `zebra`
  to debug orientation and faceting rather than as a fixed semantic palette.

## Evidence Semantics

`image` emits the standard solid viewport render with a thin edge overlay. Views
are canonical `front`, `right`, `top`, and `iso`.

`depth` emits visible ray-distance heatmaps. Each shaded pixel is colored by the
distance from the camera position to the visible surface point, normalized per
view between `minDistance` and `maxDistance` from the manifest:

```text
rayDistance = distance(cameraPosition, surfacePoint)
normalized = (rayDistance - minDistance) / (maxDistance - minDistance)
```

The ramp is blue near the camera, green in the middle, and red far from the
camera. Background pixels are black and should be treated as `null`.

`normals` emits camera-view normals packed into RGB:

```text
normal = normalize((rgb / 255) * 2 - 1)
```

Background pixels are black and should be treated as `null`.

`zebra` emits reflective black-and-white stripe renders for visual
surface-continuity inspection. Stripes are generated from the visible
camera-view normal and simulated reflection direction, so smooth surfaces show
smooth flowing bands while normal discontinuities, faceting, and unexpected
creases kink or break the bands.

Use Zebra with `image` and `normals` when judging lofts, fillets, swept surfaces,
and skin-like forms. It is a human-readable shader diagnostic, not an exact
curvature-continuity proof; mesh tessellation quality and available smooth
normals determine how faithfully it represents the underlying surface.

`roughness` emits a mesh-dihedral surface-quality heatmap. Smooth and gently
curved triangles render as a faint translucent shadow over black, while
triangles adjacent to sharp, harsh, boundary, or non-manifold mesh edges render
in orange or magenta:

```text
shadow  = max adjacent angle < sharpAngleDeg
orange  = sharpAngleDeg <= angle < harshAngleDeg
magenta = angle >= harshAngleDeg, boundary, or non-manifold
```

The default thresholds are `smoothAngleDeg=5`, `sharpAngleDeg=30`, and
`harshAngleDeg=90`. The manifest stores the method, thresholds, palette, object
list, per-object triangle and edge counts, area percentages by smooth,
moderate, sharp, and harsh classes, angle percentiles, maximum angle, quality
score, and warnings. Moderate angles are reported in the manifest but stay in
the shadow layer by default so intentionally curved surfaces do not light up as
defects. Use this evidence to spot spiky tessellation, accidental faceting,
jagged boolean residue, and dense sharp-corner regions without losing the
silhouette of otherwise smooth surfaces.

The evidence also writes `evidence/roughness/point-cloud.json`. Each point sample
stores object identity, object-local position, normal, dihedral angle, class,
RGB color, and represented surface area. The PNG renders those samples over
muted source geometry so the visual evidence stays point-level instead of
painting a whole object.

`objects` emits one object-color image per view. Black is background. Non-black
pixels resolve through `manifest.evidence.objects.objects`, which includes object
index, RGB color, object id, name, group, tree path, and mock flag. Edge pixels
may be antialiased blends; use solid interior colors for exact object lookup.

`connectivity` emits one physical-component-color image per view. Black is
background. Non-black pixels resolve through
`manifest.evidence.connectivity.components`, and every visible object also has a
`componentIndex` in `manifest.evidence.connectivity.objects`.

Connectivity is computed from visible scene objects:

```text
bbox candidate = bbox interiors overlap or bbox contact gap <= 0.05 model units
mesh contact edge = minimum mesh-surface distance <= contactTolerance
overlap edge = exact boolean intersection volume > 0.1 model units^3 for positive-volume overlap
component = transitive closure over mesh contact and exact overlap edges
```

The manifest stores the edge list, component list, per-object body counts, and
warnings. Component colors group scene objects and mesh body entries. If one
scene object contains multiple disconnected mesh islands, those islands are
reported and colored separately as entries such as `Part body 1` and
`Part body 2`.

Connectivity uses bbox only as a broadphase. Bbox contact alone is not enough to
merge separate scene objects by default, but mesh surfaces within contact
tolerance count as physically connected. This keeps concave assemblies such as
cages and captive balls from being falsely colored as one component while still
allowing stacked or nearly touching parts to share a component. Use the
`collisions` evidence when you need positive-volume overlap evidence as a defect
report rather than a component grouping.

`floating` emits one disconnected-body highlight image per view. Black is
background or ground-reachable geometry. The highlight color marks physical
components that have no contact path to the ground plane.

Floating body detection splits visible meshes into disconnected body islands,
links bodies only when their minimum mesh-surface distance is within contact
tolerance (or exact positive-volume overlap when only shape evidence is
available), treats any connected component whose lower Z reaches the viewport
ground plane plus bed tolerance as grounded, then highlights every ungrounded
component. The default ground plane is the visible model's minimum Z;
`scene({ ground: { offset } })` moves it below that by the configured offset.

```text
grounded = component bbox minZ <= groundZ + bedTolerance
floating body = !grounded
```

This means a `union()` result with two disconnected mesh islands is inspected as
two separate bodies instead of being treated as one safe object. Bbox overlap or
bbox face contact alone is not support evidence. Use `connectivity`, `distance`,
or `collisions` when you need the full physical graph, rooted gap distances, or
collision defects.

`distance` emits one rooted physical-component-distance heatmap per view. Black
is background. Non-black pixels resolve through
`manifest.evidence.distance.components`, and every visible object also has
`componentIndex`, `rootDistance`, `nearestGap`, and parent-tree metadata in
`manifest.evidence.distance.objects`.

Distance is computed from visible scene objects:

```text
component = physical connectivity component
gap edge = Euclidean distance between component bounding boxes
root = largest component by body count, object count, then bbox volume
rootDistance = shortest accumulated gap distance from root component
```

For large scenes the manifest does not materialize the complete component gap
graph, because that graph is quadratic in the number of components. The
`gapEdgeCount` field reports the logical complete-graph edge count used by the
analysis. `gapEdges` stores a compact evidence subset containing nearest-gap
and root-parent edges.

The PNG colors components from green at the root/near distances through yellow to
red at the farthest rooted component. The manifest stores the root component,
maximum rooted distance, compact gap edge evidence, nearest-gap data, and
shortest-path parent fields. The current v1 metric is bbox-based: it measures air
gaps between component bounding boxes, not exact closest mesh-surface distance.

`comparison` emits one reference-vs-candidate overlay per view. Pass
`--compare-with <reference>` or declare the target in model code with
`compareWith('./reference.3mf')`. The PNG uses the same Difference Only
comparison overlay as the viewport. Amber marks candidate mismatch evidence,
cyan marks reference mismatch evidence, and faint candidate/reference context
keeps the overlay readable while rotating or comparing against the standard RGB
render.

Colored mismatch evidence comes from sampled nearest-surface distances: cyan
means reference surface missing from the candidate, and amber means extra
candidate surface. Run `forgecad inspect sections` when you also want the
explicit principal-plane cut atlas next to the comparison context views.

The manifest stores visual screen-space mismatch counts, the geometric
`compare 3d` score when the CLI can resolve both inputs, and a
`evidence/comparison/mismatch-points.json` point cloud with world-space sample
positions. Use the geometric score and point-cloud summary as the source of
truth; the PNG is the fast visual index for where to look.

`collisions` emits one ghosted-overlap image per view. It uses the same
`--focus` / `--hide` visibility set as every other inspect evidence: focused
objects are the only inspected objects. Source objects render as translucent
ghosts, while actual boolean intersection volumes render as solid per-finding
palette colors.

Collision findings are computed from visible scene objects:

```text
collision = boolean intersection volume > 0.1mm^3
```

The manifest stores the inspected objects, collision pair names/ids, overlap
volume, broadphase counters, warnings, render style, and each collision finding's
`groupIndex`, `color`, and `hex`. Exact interior pixels can be matched against
`manifest.evidence.collisions.collisions[].color`; antialiased edges may blend
with the ghosted source geometry. If `--focus PartA,PartB` is used, everything
except those objects is hidden, `PartA` and `PartB` are ghosted, and their
overlap volume is highlighted if present.

Collision broadphase prunes exact boolean checks when the bbox intersection
volume is already below the overlap threshold. This does not change findings:
the real intersection volume cannot exceed the bbox intersection volume.

`thickness` emits one local wall-thickness heatmap per view. The renderer places
deterministic area-weighted point samples across visible mesh surfaces, casts
through the object along each sample normal, and colors each point by the first
opposite-surface distance:

```text
red    = thickness <= minThickness
orange = thickness <= warnThickness
green  = acceptable thickness
blue   = thickness >= maxThickness
gray   = unresolved sample
```

Thickness uses the same physical-contact edges as `connectivity` and `floating`.
When a ray crosses from one object to a direct physical-contact neighbor, hits
within `contactTolerance` are treated as contact seams and the ray continues to
the next surface. This prevents a tiny modeled gap between touching parts from
being reported as a paper-thin wall.

The default thresholds are `minThickness=1.2`, `warnThickness=2.0`, and
`maxThickness=6.0` model units. Override them with `--min-thickness`,
`--warn-thickness`, and `--max-thickness`. Use `--thickness-samples` to raise or
lower the maximum thickness point samples per object.

The manifest stores the method, thresholds, palette, object list, per-object
triangle counts, sampled-triangle counts, minimum, p05, median, mean, maximum,
critical-area percentage, warning-area percentage, below-warning percentage, and
unresolved-area percentage. This makes the PNG useful for visual debugging while
the manifest remains the machine-readable source of truth.

The evidence also writes `evidence/thickness/point-cloud.json`. Each point sample
stores object identity, object-local position, normal, measured thickness,
class, RGB color, and represented surface area. The PNG renders those samples
over muted source geometry, so local evidence survives even when neighboring
triangles have very different values.

`roughness` uses the same area-weighted point placement. Point colors are local
to nearby physical feature edges: smooth tessellation diagonals do not become
visible roughness lines. Use `--roughness-samples` to raise or lower the maximum
roughness point samples per object.

`sections` emits five interior slices per principal plane. The current slicing
policy is:

```text
offset = bbox.min[axis] + fraction * (bbox.max[axis] - bbox.min[axis])
fractions = [1/6, 2/6, 3/6, 4/6, 5/6]
planes = xy, xz, yz
```

Each section slice records its exact offset, fraction, area, path count, size,
and contributing object count in the manifest.

## Manifest

`manifest.json` is the authoritative contract for consuming a bundle. It
contains:

- `schemaVersion` and generator metadata.
- Source entry file and project root paths.
- Requested evidence, emitted evidence, filters, image size, and quality.
- Canonical views.
- Scene metadata: bbox, volume, params, cut planes, animations, verifications,
  and objects.
- Evidence metadata and relative file paths.

A consumer should prefer paths from the manifest over hard-coding bundle layout.
The layout is intentionally simple, but the manifest is where encoding details,
per-view depth ranges, and object identity mappings live.

## Current Limits

- Depth is a visual heatmap, not an EXR or raw float array.
- Normals are camera-view normals, not world-space normals.
- Object evidence colors are stable within a bundle and resolved through the manifest; do
  not infer identity from object order alone.
- Connectivity is object-level. It reports disconnected kernel bodies in the
  manifest, but the PNG does not split a single scene object into per-body colors.
- Bbox contact is only broadphase evidence and does not merge separate scene
  objects by default. Boolean-overlap edges are exact.
- Distance is a physical-component bbox-gap metric in v1, not exact nearest
  mesh-surface distance. Concave components and loose bounding boxes can make the
  reported gap smaller than the real closest-surface distance.
- Comparison PNG coverage is screen-space evidence. Hidden or internal
  mismatches need the sampled point cloud and geometric score in the manifest.
- Collisions are only positive-volume boolean overlaps. Face-touching parts are
  not collision findings.
- Thickness is a mesh/raycast approximation, not FEA or a manufacturability
  guarantee. Open meshes, concave geometry, very coarse tessellation, or low
  `--thickness-samples` values can leave gray/unresolved or approximate regions.
- Section atlases use five default interior slices today.
- Zebra is a shader-based visual continuity aid, not exact curvature analysis.

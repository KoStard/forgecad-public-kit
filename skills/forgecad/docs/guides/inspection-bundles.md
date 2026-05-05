---
skill-group: cli
skill-order: 2
---

# Inspection Bundles

`forgecad render inspect` writes a deterministic directory bundle for agents,
tests, and automation. Use it when a single shaded PNG is too ambiguous and the
consumer needs geometry-aware signals such as depth, normals, part identity,
physical connected components, collisions, local thickness, or cross-sections.

## When To Use It

- Use `forgecad render inspect` for agent repair loops, model debugging, CI
  artifacts, and structured visual comparison.
- Use `forgecad render 3d` for a quick human viewport PNG.
- Use `forgecad render section` when you only need one specific cut plane.
- Use `forgecad render hq` for presentation-quality output, docs, and marketing
  renders.

## Command

```bash
forgecad render inspect examples/api/static-assembly-connectors.forge.js --channels rgb,mask
forgecad render inspect model.forge.js out/model-inspect --channels rgb,section --force
forgecad render inspect model.forge.js --channels rgb,mask,section
forgecad render inspect model.forge.js --channels collisions --focus Bench
forgecad render inspect model.forge.js --channels rgb,mask --hide "Bench.Slat0,Bench.Slat1"
forgecad render inspect model.forge.js --channels thickness --min-thickness 1.2 --warn-thickness 2.0
```

The default output directory is `<script-name>-inspect/` next to the input file.
Pass `--force` to replace an existing bundle directory.

There are no default channels. Pass `--channels` every time as a
comma-separated subset. Keep bundles targeted to the current question so heavy
analyses do not run unnecessarily.

`--focus` and `--hide` use the same object-name filtering semantics as
`forgecad run` and `forgecad render 3d`. A bare `--focus` hides mock objects;
`--focus name1,name2` emits only matching objects; `--hide name1,name2` removes
matching objects from an otherwise visible scene.

## Bundle Layout

A bundle that asks for `--channels rgb,depth,normals,mask,section` has this
layout:

```text
model-inspect/
  manifest.json
  channels/
    rgb/
      front.png
      right.png
      top.png
      iso.png
    depth/
      front.png
      right.png
      top.png
      iso.png
    normals/
      front.png
      right.png
      top.png
      iso.png
    mask/
      front.png
      right.png
      top.png
      iso.png
    section/
      xy/
        000.png
        001.png
        002.png
        003.png
        004.png
      xz/
        000.png
        ...
      yz/
        000.png
        ...
```

Use targeted channel groups for expensive analyses instead of running every
implemented channel in one bundle:

```bash
forgecad render inspect model.forge.js --channels depth,normals
forgecad render inspect model.forge.js --channels rgb,mask,collisions
forgecad render inspect model.forge.js --channels rgb,section,thickness
```

Supported channels are `rgb`, `depth`, `normals`, `mask`, `connectivity`,
`distance`, `collisions`, `thickness`, and `section`.

## Channel Semantics

`rgb` emits the standard solid viewport render with a thin edge overlay. Views
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

`mask` emits one object-color image per view. Black is background. Non-black
pixels resolve through `manifest.channels.mask.objects`, which includes object
index, RGB color, object id, name, group, tree path, and mock flag. Edge pixels
may be antialiased blends; use solid interior colors for exact object lookup.

`connectivity` emits one physical-component-color image per view. Black is
background. Non-black pixels resolve through
`manifest.channels.connectivity.components`, and every visible object also has a
`componentIndex` in `manifest.channels.connectivity.objects`.

Connectivity is computed from visible scene objects:

```text
bbox overlap edge = bbox interiors overlap
touching edge = bbox contact gap <= 0.05 model units
component = transitive closure over overlap/touching edges
```

The manifest stores the edge list, component list, per-object body counts, and
warnings. Component colors group scene objects; if one scene object contains
multiple disconnected kernel bodies and the caller supplied a body count, the
manifest reports `bodyCount > 1` but the PNG cannot color those internal bodies
separately yet.

Connectivity is a fast bbox-neighborhood graph. Use the `collisions` channel
when you need exact positive-volume boolean overlap evidence.

`distance` emits one rooted physical-component-distance heatmap per view. Black
is background. Non-black pixels resolve through
`manifest.channels.distance.components`, and every visible object also has
`componentIndex`, `rootDistance`, `nearestGap`, and parent-tree metadata in
`manifest.channels.distance.objects`.

Distance is computed from visible scene objects:

```text
component = physical connectivity component
gap edge = Euclidean distance between component bounding boxes
root = largest component by body count, object count, then bbox volume
rootDistance = shortest accumulated gap distance from root component
```

The PNG colors components from green at the root/near distances through yellow to
red at the farthest rooted component. The manifest stores the root component,
maximum rooted distance, complete component gap edge list, nearest-gap data, and
shortest-path parent fields. The current v1 metric is bbox-based: it measures air
gaps between component bounding boxes, not exact closest mesh-surface distance.

`collisions` emits one ghosted-overlap image per view. It uses the same
`--focus` / `--hide` visibility set as every other inspect channel: focused
objects are the only inspected objects. Source objects render as translucent
ghosts, while actual boolean intersection volumes render as solid per-finding
palette colors.

Collision findings are computed from visible scene objects:

```text
collision = boolean intersection volume > 0.1mm^3
```

The manifest stores the inspected objects, collision pair names/ids, overlap
volume, warnings, render style, and each collision finding's `groupIndex`,
`color`, and `hex`. Exact interior pixels can be matched against
`manifest.channels.collisions.collisions[].color`; antialiased edges may blend
with the ghosted source geometry. If `--focus PartA,PartB` is used, everything
except those objects is hidden, `PartA` and `PartB` are ghosted, and their
overlap volume is highlighted if present.

`thickness` emits one local wall-thickness heatmap per view. The renderer
samples visible mesh triangles, casts through the object along each triangle
normal, and colors the surface by the first opposite-surface distance:

```text
red    = thickness <= minThickness
orange = thickness <= warnThickness
green  = acceptable thickness
blue   = thickness >= maxThickness
gray   = unresolved sample
```

The default thresholds are `minThickness=1.2`, `warnThickness=2.0`, and
`maxThickness=6.0` model units. Override them with `--min-thickness`,
`--warn-thickness`, and `--max-thickness`. Use `--thickness-samples` to raise or
lower the maximum sampled triangles per object.

The manifest stores the method, thresholds, palette, object list, per-object
triangle counts, sampled-triangle counts, minimum, p05, median, mean, maximum,
critical-area percentage, warning-area percentage, below-warning percentage, and
unresolved-area percentage. This makes the PNG useful for visual debugging while
the manifest remains the machine-readable source of truth.

`section` emits five interior slices per principal plane. The current slicing
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
- Requested channels, emitted channels, filters, image size, and quality.
- Canonical views.
- Scene metadata: bbox, volume, params, cut planes, animations, verifications,
  and objects.
- Channel metadata and relative file paths.

A consumer should prefer paths from the manifest over hard-coding bundle layout.
The layout is intentionally simple, but the manifest is where encoding details,
per-view depth ranges, and object-mask mappings live.

## Current Limits

- Depth is a visual heatmap, not an EXR or raw float array.
- Normals are camera-view normals, not world-space normals.
- Mask indices are stable within a bundle and resolved through the manifest; do
  not infer identity from object order alone.
- Connectivity is object-level. It reports disconnected kernel bodies in the
  manifest, but the PNG does not split a single scene object into per-body colors.
- Bbox contact is intentionally simple and may over-connect concave shapes whose
  bounding boxes touch while surfaces do not. Boolean-overlap edges are exact.
- Distance is a physical-component bbox-gap metric in v1, not exact nearest
  mesh-surface distance. Concave components and loose bounding boxes can make the
  reported gap smaller than the real closest-surface distance.
- Collisions are only positive-volume boolean overlaps. Face-touching parts are
  not collision findings.
- Thickness is a mesh/raycast approximation, not FEA or a manufacturability
  guarantee. Open meshes, concave geometry, very coarse tessellation, or low
  `--thickness-samples` values can leave gray/unresolved or approximate regions.
- Section atlases use five default interior slices today.
- Zebra/reflection-line inspection is a follow-up channel, not part of the v1
  bundle.

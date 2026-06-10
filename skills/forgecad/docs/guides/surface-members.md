---
skill-group: curves
skill-order: 1
---

# Surface Members: When To Route Through Carrier + SurfaceBody

Surface members model physical material that follows a carrier surface: bottle-cage arms, grip inlays, brace ribs, prop guards, helmet vents. Full API, parameter rules, and worked examples: [../generated/curves.md](../generated/curves.md).

## When to use

Route through this layer when the model has: a carrier surface (cylinder, plane, or `ProductSkin`); paths or bands in carrier-local coordinates; member-local features (slots, cutouts, lips, cups, ribs, section thickness/edge radius); or explicit joins between named members. Not for plain boxes, simple extrusions, sheet-metal bends, exact machined faces, or free-floating connector-positioned assemblies.

## Mental model

- `Carrier` owns surface coordinates and frames. `SurfaceBody(name)` owns named members — `band()` or `plate()` — and the joins between them.
- Features attach to a member's local coordinate system before lowering. This is not a global boolean recipe.
- Cylinder paths take degrees and handle seam wrapping — never compute angles with trig.
- A ProductSkin path stays on one side. For multi-side detail, split into one member per side and join them at named transition anchors; `sideTransition` / `sideTransitionChain` / `sideRoute` generate the matching side-local endpoints.
- `Product.ribbon()` stays the simple path for a one-side conformal ribbon. Upgrade to `Carrier.productSkin(skin)` + `SurfaceBody` when the detail needs member-local features, repeated ribs, explicit joins, or mirrored members.

## Verification loop

- `build()` returns the member geometry. `buildWithDiagnostics()` adds a serializable member graph + IR; `buildDebug()` adds visible debug markers (anchors, join radii, centerlines, frame axes) alongside the normal shapes.
- Every diagnostic carries a stable `code` field (e.g. `region.centerOutOfBounds`). Repair loops must match on `code`, never on English prose. Clipped or crossing regions and invalid joins are reported as diagnostics, never silently accepted as valid geometry.
- Only a limited join set lowers to real geometry: close endpoint pairs, selected named-anchor pairs, sampled landing pads, and unambiguous shared endpoints via `autoJoinAtSharedAnchors()`. Farther, missing-anchor, or ambiguous joins remain diagnostic-only intent — decompose the design into supported joins instead of expecting a fallback.

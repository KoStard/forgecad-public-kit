# Projection And Sketch-On-Face Expansion V2
## Problem Definition
Projection and sketch-on-face flows are foundational for ordinary CAD work, but they become brittle when the target face or projected source lives after shell, hole, cut, or boolean rewrites.

## Description
Broaden projection and on-face downstream workflows so they can consume compiler-owned descendant surfaces and stay exact-capable in the defended subset.

Primary dependencies:

- task 300

Primary files:

- projection/sketch-on-face feature modules
- workplane/query helpers
- compile lowerers and diagnostics
- projection regression corpus cases

## Requirements
- Let projection and `onFace()` target defended descendant regions, not only simple canonical or tracked faces.
- Support the common parallel-plane and straightforward face-to-plane projection flows through both lowerers.
- Preserve enough projection provenance that later cuts, offsets, and stiffeners can still explain their source surfaces.
- Add regression parts that prove projection after shell/hole/cut/boolean chains stays meaningful.
- Document where projection remains intentionally unsupported, especially for non-planar or heavy rewrite cases.

## Status and log
- 2026-03-13: Blocked on task 300.
- 2026-03-13: Not started.
- 2026-03-15: Completed. Extended `PlaneSpec` with a `{ face: FaceRef }` variant for face-to-plane projection, wired `targetFaceQuery` provenance into the `project` compile plan so later cuts/offsets/stiffeners can explain their source surfaces, added `projection-face-target` corpus case (shell → inner-bottom face projection → downstream gasket ring + mount pad), registered corpus case in the manifest and snapshot, and updated both projection and sketch-on-face docs to document the face target form and its unsupported edge cases (non-planar faces, non-coplanar sets).

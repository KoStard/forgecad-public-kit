---
skill-group: geometry
skill-order: 1
---

# Coordinate System

Z-up right-handed: +X right, +Y back, +Z up. Ground plane is XY at Z = 0; extrusion goes along +Z. Units are millimeters; angles are degrees.

Model fronts (face/nose/camera side) point toward **-Y**; rear is +Y; the forward vector is `[0, -1, 0]`. Anchors follow: `front` resolves to the minimum-Y side, `back` to the maximum-Y side.

A `front` view camera sits on the -Y side looking toward +Y, so it sees the model's front face. The other views follow: back +Y, right +X, left -X, top +Z, bottom -Z.

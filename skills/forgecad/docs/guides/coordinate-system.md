---
skill-group: geometry
skill-order: 1
---

# Coordinate System Convention

ForgeCAD uses a **Z-up** right-handed coordinate system.

## Axes

| Axis | Direction       | Positive |
|------|-----------------|----------|
| X    | Left / Right    | Right    |
| Y    | Forward / Back  | Forward  |
| Z    | Up / Down       | Up       |

## Standard Views

| View   | Camera position direction | Sees plane |
|--------|--------------------------|------------|
| Front  | −Y                       | XZ         |
| Back   | +Y                       | XZ         |
| Right  | +X                       | YZ         |
| Left   | −X                       | YZ         |
| Top    | +Z                       | XY         |
| Bottom | −Z                       | XY         |

## GizmoViewcube Face Mapping

Three.js BoxGeometry material indices vs ForgeCAD labels (Z-up remapping):

| Index | Three.js direction | ForgeCAD label |
|-------|--------------------|----------------|
| 0     | +X                 | Right          |
| 1     | −X                 | Left           |
| 2     | +Y                 | Front          |
| 3     | −Y                 | Back           |
| 4     | +Z                 | Top            |
| 5     | −Z                 | Bottom         |

Default drei labels are Y-up; ForgeCAD passes `faces={['Right','Left','Front','Back','Top','Bottom']}`.

## Grid

The ground plane is XY (Z = 0). Extrusion goes along +Z. Manifold is Y-up internally — if a kernel-facing operation behaves as if axes are swapped, check for Manifold Y-up semantics leaking through.

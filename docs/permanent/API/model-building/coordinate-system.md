# Coordinate System Convention

ForgeCAD uses a **Z-up** right-handed coordinate system.

## Axes

| Axis | Direction       | Positive |
|------|-----------------|----------|
| X    | Left / Right    | Right    |
| Y    | Forward / Back  | Forward  |
| Z    | Up / Down       | Up       |

## Standard Views

| View   | Camera position direction | Sees plane | Camera up |
|--------|--------------------------|------------|-----------|
| Front  | −Y (camera at −Y)        | XZ         | Z         |
| Back   | +Y (camera at +Y)        | XZ         | Z         |
| Right  | +X (camera at +X)        | YZ         | Z         |
| Left   | −X (camera at −X)        | YZ         | Z         |
| Top    | +Z (camera at +Z)        | XY         | +Y        |
| Bottom | −Z (camera at −Z)        | XY         | −Y        |
| Iso    | +X −Y +Z (diagonal)      | —          | Z         |

## GizmoViewcube Face Mapping

Three.js BoxGeometry material indices (cube face order):

| Index | Three.js direction | ForgeCAD label |
|-------|--------------------|----------------|
| 0     | +X                 | Right          |
| 1     | −X                 | Left           |
| 2     | +Y                 | Front          |
| 3     | −Y                 | Back           |
| 4     | +Z                 | Top            |
| 5     | −Z                 | Bottom         |

Default drei labels are `['Right', 'Left', 'Top', 'Bottom', 'Front', 'Back']` (Y-up).
For Z-up we pass `faces={['Right', 'Left', 'Front', 'Back', 'Top', 'Bottom']}`.

## Grid

The ground plane is XY (Z = 0). The grid lies on this plane.

---
skill-group: toolbox
skill-order: 100
---

# Woodworking

Wood boards with grain/species metadata, and joinery operations: dado, rabbet, mortise & tenon. Access via `Wood.*`.

## Contents

- [WoodBoard](#woodboard)
- [Wood](#wood)

---

## Classes

### `WoodBoard`

A board of wood with metadata for manufacturing: grain direction, species, and dimensions. The underlying geometry is a simple box.

WoodBoard operations are immutable. Joint operations return new boards instead of carving the original in-place, and transform methods preserve all metadata.

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `shape` | `Shape` | The underlying 3D shape. |
| `width` | `number` | Board width (mm) — the longer flat dimension |
| `height` | `number` | Board height (mm) — the shorter flat dimension |
| `thickness` | `number` | Board thickness (mm) |
| `grain` | `string` | Grain direction: "long" or "cross" |
| `species` | `string` | Wood species, e.g. "birch", "oak" |
| `material` | `string` | Material label for BOM |

**Methods:**

#### `cut(cutter: Shape): WoodBoard` — Subtract a cutter from this board, returning a new board. Used by joint functions (dado, rabbet, mortiseAndTenon).

#### `translate(x: number, y: number, z: number): WoodBoard` — Translate the board in 3D space.

#### `rotate(axis: Vec3, angleDeg: number, options?: { pivot?: Vec3; }): WoodBoard` — Rotate the board around an axis by a given angle in degrees.

#### `rotateX(angleDeg: number): WoodBoard` — Rotate the board around the X axis by a given angle in degrees.

#### `rotateY(angleDeg: number): WoodBoard` — Rotate the board around the Y axis by a given angle in degrees.

#### `rotateZ(angleDeg: number): WoodBoard` — Rotate the board around the Z axis by a given angle in degrees.

#### `mirror(normal: Vec3): WoodBoard` — Mirror the board across a plane defined by its normal.

#### `color(value: string): WoodBoard` — Set the board's display color.

#### `clone(): WoodBoard` — Clone the board (creates an independent copy of the underlying shape).

---

## Constants

### `Wood`

Woodworking namespace — create boards and cut joints.

**Boards:** `Wood.board()` creates a WoodBoard with grain, species, and BOM metadata.

**Joints:** `Wood.dado()`, `Wood.rabbet()`, and `Wood.mortiseAndTenon()` are immutable — they return new board value(s) with the joint cut applied.

- `board: (width: number, height: number, thickness: number, opts?: WoodBoardOptions) => WoodBoard` — Create a wood board with metadata for manufacturing.

  The board is a box(width, height, thickness) centered on XY, base at Z=0. Width along X, height along Y, thickness along Z (0 to thickness).
- `dado(host: WoodBoard, guest: WoodBoard, opts: DadoOptions): WoodBoard` — Cut a dado (channel) across the face of a host board for a guest board to sit in.

  Returns a new host board with the dado cut applied.
- `rabbet(board: WoodBoard, opts: RabbetOptions): WoodBoard` — Cut a rabbet (L-shaped step) along an edge of a board.

  Returns a new board with the rabbet cut applied.
- `mortiseAndTenon(mortiseBoard: WoodBoard, tenonBoard: WoodBoard, opts?: MortiseAndTenonOptions): MortiseAndTenonResult` — Cut a mortise in one board and shape a tenon on another.

  Returns new boards with the mortise pocket and tenon cuts applied.

# Parameters

ForgeCAD scripts declare parameters that automatically generate UI controls (sliders, checkboxes). Parameters make models interactive — change a value, see the geometry update.

## `param(name, default, options?)`

Declare a numeric parameter. Creates a slider in the UI.

**Parameters:**
- `name` (string) — Display name in the parameter panel
- `default` (number) — Initial value
- `options` (object, optional):
  - `min` (number) — Minimum slider value. Default: `0`
  - `max` (number) — Maximum slider value. Default: `default * 4`
  - `step` (number) — Slider increment. Auto-calculated if omitted
  - `unit` (string) — Display unit label, e.g. `"mm"`, `"°"`, `"%"`
  - `integer` (boolean) — Round to whole numbers; step defaults to `1`. Use for counts, sides, quantities
  - `reverse` (boolean) — Invert the slider direction

**Returns:** `number` — Current parameter value (default or overridden)

```javascript
const width = param("Width", 50);
const angle = param("Angle", 45, { min: 0, max: 180, unit: "°" });
const thick = param("Thickness", 2, { min: 0.5, max: 10, step: 0.5, unit: "mm" });
const sides = param("Sides", 6, { min: 3, max: 12, integer: true });
```

## `boolParam(name, default)`

Declare a boolean parameter. Creates a checkbox in the UI.

**Parameters:**
- `name` (string) — Display name in the parameter panel
- `default` (boolean) — Initial checkbox state

**Returns:** `boolean` — Current boolean value

```javascript
const showHoles = boolParam("Show Holes", true);
const centerOrigin = boolParam("Center at Origin", false);

// Conditional geometry
const plate = box(100, 60, 5);
if (showHoles) {
  return difference(plate, cylinder(10, 5).translate(50, 30, 0));
}
return plate;
```

> **Callout:** `boolParam` was added to complement `param()` for on/off toggles. It renders as a checkbox rather than a slider. Internally the boolean is stored as `0`/`1`.

## Parameter Overrides

When importing files with `importPart()` or `importSketch()`, you can override their parameters:

```javascript
const bracket = importPart("bracket.forge.js", { Width: 80, Thickness: 3 });
const logo = importSketch("logo.svg", { scale: 0.5 });
```

Override keys must match the `name` string passed to `param()` or `boolParam()` in the imported file. For `boolParam`, pass `1` (true) or `0` (false) as the override value.

## Tips

- **Avoid recomputation**: Parameters trigger a full script re-execution on every change. Keep expensive operations behind boolean guards when possible.
- **Use `integer: true`** for discrete quantities (bolt count, polygon sides, array copies) — it prevents fractional values that would produce invalid geometry.
- **Unit labels are cosmetic**: The `unit` option only affects the UI display; it does not convert values.

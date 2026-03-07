# Dimension Annotations

Dimension annotations are visual callouts used in the viewport and report export.
They are not constraints and do not change geometry, so they live outside the core model-building docs.

## `dim(from, to, opts?)`

Add a dimension between two points.

**Parameters:**
- `from` (`[number, number] | [number, number, number] | Point2D`)
- `to` (`[number, number] | [number, number, number] | Point2D`)
- `opts` (optional):
  - `offset` (number, default `10`)
  - `label` (string)
  - `color` (string hex, for example `"#ffaa44"`)
  - `component` (`string | string[]`) - explicit report ownership by returned object name
  - `currentComponent` (boolean) - bind to the owning returned component instance

```javascript
const w = 120;
const h = 60;
const plate = box(w, 30, h, true);

dim([-w / 2, 0, 0], [w / 2, 0, 0], { label: "Width" });
dim([0, 0, -h / 2], [0, 0, h / 2], { label: "Height", offset: 14 });

return plate;
```

Ownership examples:

```javascript
dim([0, 0, 0], [0, 80, 0], {
  label: "Leg Width",
  currentComponent: true,
});

dim([0, 0, 0], [0, 0, 18], {
  label: "Top Gap",
  component: "Tabletop",
});
```

## `dimLine(line, opts?)`

Add a dimension along a `Line2D`.

```javascript
const a = point(0, 0);
const b = point(100, 0);
dimLine(line(a, b), { label: "Span", offset: -8 });
```

## Ownership Rules (Report Pages)

- Use `currentComponent: true` when authoring imported parts and you want deterministic ownership by the calling instance.
- Use `component: "Part Name"` to route a dimension to another named returned object.
- If multiple owners are bound, the dimension is shared and appears on the assembly overview page.
- If no ownership is set, report export attempts automatic ownership via endpoint-in-bbox inference.

See `examples/api/dimensioned-bracket.forge.js` for baseline usage.

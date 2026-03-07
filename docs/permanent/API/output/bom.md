# Bill of Materials

These APIs annotate a model for report/export workflows. They do not change geometry, so they are outside the required model-building reading set.

## `bom(quantity, description, opts?)`

Register a bill-of-materials entry for report export.

Use this for real-world parts or materials that cannot be inferred reliably from geometry alone.

**Parameters:**
- `quantity` (number) - must be finite and `>= 0`; `0` is ignored
- `description` (string) - human-readable item description
- `opts` (object, optional):
  - `unit` (string) - default `"pieces"`
  - `key` (string) - explicit aggregation key when multiple descriptions should collapse to one line item

**Returns:** `void`

```javascript
const tubeLen = param("Tube Length", 1200, { min: 300, max: 4000, unit: "mm" });
const boltCount = param("Bolt Count", 16, { min: 0, max: 200, integer: true });
const boltLength = param("Bolt Length", 16, { min: 6, max: 80, unit: "mm" });

bom(tubeLen, "iron tube 30 x 20", { unit: "mm" });
bom(boltCount, `M4 bolt of ${boltLength} mm length`, { unit: "pieces" });
```

Aggregation behavior:
- rows are grouped by normalized `description + unit`
- `key` overrides the default grouping rule
- grouped rows render on the report's Bill of Materials page

## Assembly BOM Helpers

Assembly graphs can also carry metadata for downstream reporting:

- `addPart(name, shape, { metadata? })`
- `solved.bom()`
- `solved.bomCsv()`
- `bomToCsv(rows)`

```javascript
const mech = assembly("Arm")
  .addPart("base", box(80, 80, 20, true), {
    metadata: { material: "PETG", process: "FDM", qty: 1 },
  });

const solved = mech.solve();
const csv = solved.bomCsv();
```

See `examples/api/bill-of-materials.forge.js` for a complete script-authored BOM example.

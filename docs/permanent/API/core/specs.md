# Specs — Named Requirement Bundles

A **Spec** is a named, reusable group of `verify.*` checks. When you call `spec.check(shape)`, every `verify` call inside the check function is tagged with the spec name and displayed as a collapsible section in the Checks panel.

## Why Specs

Bare `verify.*` calls produce a flat list. With 15 checks across 3 different concerns, the panel becomes hard to scan. Specs add structure:

- **Grouping** — related checks appear under a named, collapsible header
- **Reusability** — one spec, applied to many shapes: `printable.check(bracket); printable.check(standoff);`
- **Composability** — combine independent specs: check fit, strength, and printability separately
- **Separation** — define what "good" looks like before building geometry (spec-first / TDD workflow)

## Quick Start

```javascript
// Define a spec
const printable = spec("Fits printer bed", (shape) => {
  verify.notEmpty("Has geometry", shape);
  const bb = shape.boundingBox();
  const size = [bb.max[0] - bb.min[0], bb.max[1] - bb.min[1], bb.max[2] - bb.min[2]];
  verify.lessThan("Width  < 220mm", size[0], 220);
  verify.lessThan("Depth  < 220mm", size[1], 220);
  verify.lessThan("Height < 250mm", size[2], 250);
});

// Build something
const part = box(100, 80, 40);

// Check it
printable.check(part);

return part;
```

The Checks panel shows:

```
▼ ✓ Fits printer bed — 4/4
    ✓ Has geometry
    ✓ Width  < 220mm
    ✓ Depth  < 220mm
    ✓ Height < 250mm
```

## API

### `spec(name, checkFn)`

Create a named spec.

| Parameter | Type | Description |
|-----------|------|-------------|
| `name` | `string` | Display name in the Checks panel |
| `checkFn` | `(...args) => void` | Function that calls `verify.*` methods |

Returns a `Spec` object with a `.check()` method.

### `Spec.check(...args)`

Run the spec's check function. Any `verify.*` calls inside are grouped under the spec name.

Returns a `SpecResult`:

```typescript
interface SpecResult {
  name: string;     // Spec name
  passed: number;   // Checks that passed
  total: number;    // Total checks
  results: VerificationResult[];
}
```

The return value is optional — you can ignore it and just let the Checks panel show the results.

## Patterns

### Reusable Spec — Apply to Multiple Shapes

```javascript
const structural = spec("Structural", (shape) => {
  verify.greaterThan("Min volume", shape.volume(), 500);
  verify.notEmpty("Not degenerate", shape);
});

structural.check(bracket);
structural.check(plate);
structural.check(standoff);
// Each call adds a "Structural" group to the panel
```

### Multi-Shape Spec — Check Relationships

Specs can accept multiple arguments for checking relationships between parts:

```javascript
const fitSpec = spec("Assembly fit", (partA, partB) => {
  verify.notColliding("No interference", partA, partB, 10);
  verify.minClearance("Min gap 0.3mm", partA, partB, 0.3, 10);
  verify.parallel("Mating faces aligned",
    partA.face('top'), partB.face('bottom'));
});

fitSpec.check(bracket, standoff);
```

### Importable Spec Library

Specs can live in separate `.forge.js` files and be imported via `require()`:

```javascript
// specs/printers.forge.js
const prusaMK3S = spec("Prusa MK3S", (shape) => {
  const bb = shape.boundingBox();
  const size = [bb.max[0]-bb.min[0], bb.max[1]-bb.min[1], bb.max[2]-bb.min[2]];
  verify.lessThan("X", size[0], 220);
  verify.lessThan("Y", size[1], 220);
  verify.lessThan("Z", size[2], 250);
});

return { prusaMK3S };
```

```javascript
// my-part.forge.js
const { prusaMK3S } = require("./specs/printers.forge.js");
const part = box(100, 80, 40);
prusaMK3S.check(part);
return part;
```

### Reference Geometry in Specs

Specs can create shapes internally as test fixtures — these are used only for checking and never rendered:

```javascript
const fitsInEnclosure = spec("Fits in enclosure", (shape) => {
  // Reference geometry — not returned, not rendered
  const enclosure = box(200, 150, 100);
  const overlap = shape.intersect(enclosure);

  verify.that("Fully contained", () =>
    Math.abs(overlap.volume() - shape.volume()) < 1
  );
  verify.minClearance("2mm clearance", shape, enclosure, 2.0, 20);
});
```

### Spec-First Workflow (TDD for CAD)

Write specs before geometry. Watch checks go from red to green as you build:

```javascript
// Step 1: Define what we need
const caseSpec = spec("Phone case", (shape) => {
  verify.notEmpty("Has geometry", shape);
  verify.that("Is hollow (< 40% fill)", () => {
    const bb = shape.boundingBox();
    const bboxVol = (bb.max[0]-bb.min[0]) * (bb.max[1]-bb.min[1]) * (bb.max[2]-bb.min[2]);
    return shape.volume() < bboxVol * 0.4;
  });
  verify.greaterThan("Weighs under 30g (PLA)", 30, shape.volume() * 0.00124);
});

// Step 2: Build iteratively — specs tell you when you're done
const myCase = box(75, 150, 12).shell(2, { openFaces: ['top'] });
caseSpec.check(myCase);
return myCase;
```

## Mixing Specs and Plain Verify Calls

Plain `verify.*` calls (outside any spec) still work. They appear ungrouped below the spec sections:

```javascript
// Grouped under spec name
printable.check(part);

// Ungrouped — shown separately
verify.greaterThan("Custom check", someValue, 10);
```

## See Also

- **[Verification demo](../../../examples/api/verification-demo.forge.js)** — all `verify.*` methods
- **[Spec demo](../../../examples/api/spec-demo.forge.js)** — `spec()` in action

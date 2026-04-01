# Spec-Driven CAD — Defining "Done" Before Building

**Date**: 2026-03-28
**Status**: Investigation / Concept Exploration
**Type**: Investigation — API design exploration

---

## The Problem

ForgeCAD is built for iterative modeling. But every iteration loop needs a target: **how does the user know they're done?**

Today, "done" is visual — the user eyeballs it. There's no way to say "this model must fit inside an iPhone 15" and have the system tell you whether it does. The `verify` API exists for checking individual properties, but there's no concept of **a named, reusable set of requirements that defines what a model must satisfy.**

The gap: you can check `verify.lessThan("width", w, 80)`, but you can't say "this model satisfies the iPhone 15 case spec" as a coherent, importable, composable thing.

---

## What Exists Today

The `verify` API (`src/forge/verification.ts`) provides 20+ non-fatal assertions:

```javascript
verify.volumeApprox("bracket", shape, 5000, 50);
verify.notColliding("clearance", partA, partB);
verify.parallel("alignment", faceA, faceB);
verify.boundingBoxSize("fits", shape, [100, 50, 30], 1);
verify.that("custom", () => myCondition, "reason");
```

**What's good:** Rich primitives. Non-fatal (model renders even when checks fail). Source line click-to-navigate. Expected vs actual display.

**What's missing:**
1. **No grouping** — all verify results are a flat list. 15 checks from 3 different concerns show as 15 unrelated items.
2. **No reusability** — can't say "apply the same 5 checks to these 3 different parts."
3. **No composability** — can't combine "fits printer" + "fits enclosure" + "structural" as named requirement sets.
4. **No spec-first workflow** — verify calls are always inline with geometry. You can't define what you need BEFORE you build it.
5. **No reference geometry** — can't say "must fit around this other shape" as a first-class concept.

---

## The Concept: `spec()` as a First-Class API

A **Spec** is a named, reusable bundle of requirements that can be checked against any shape.

### Basic API

```javascript
// spec(name, checkFn) → Spec
// Spec.check(shape) → runs checkFn, groups verify results under name
```

### Example: Phone Case

```javascript
// Define what we need — no geometry yet
const iPhone15 = spec("Fits iPhone 15", (shape) => {
  const phone = [71.6, 146.7, 7.8];
  const bb = shape.boundingBox();
  const size = [bb.max[0]-bb.min[0], bb.max[1]-bb.min[1], bb.max[2]-bb.min[2]];

  verify.greaterThan("Wider than phone",  size[0], phone[0]);
  verify.greaterThan("Taller than phone", size[1], phone[1]);
  verify.greaterThan("Deeper than phone", size[2], phone[2]);
  verify.lessThan("Not too bulky (width)",  size[0], phone[0] + 6);
  verify.lessThan("Not too bulky (height)", size[1], phone[1] + 6);
});

const printable = spec("Fits Prusa MK3S", (shape) => {
  verify.notEmpty("Has geometry", shape);
  verify.boundingBoxSize("Fits bed", shape, [220, 220, 250]);
});

// Now build something
const myCase = box(75, 150, 12).shell(2, { openFaces: ['top'] });

// Check it
iPhone15.check(myCase);
printable.check(myCase);

return myCase;
```

### What the Checks Panel Shows

Instead of a flat list of 8 items:

```
▼ ✓ Fits iPhone 15 — 5/5
    ✓ Wider than phone
    ✓ Taller than phone
    ✓ Deeper than phone
    ✓ Not too bulky (width)
    ✓ Not too bulky (height)

▼ ✓ Fits Prusa MK3S — 2/2
    ✓ Has geometry
    ✓ Fits bed
```

Grouped. Named. Each spec is a collapsible section. You see at a glance: "I satisfy 2 out of 2 specs" vs "check #7 out of 12 failed."

---

## Why This Is Powerful

### 1. Spec-First Workflow (TDD for CAD)

Write what you need first. Then build until the checks go green.

```javascript
// Step 1: Define requirements (all fail — no model yet)
const caseSpec = spec("Phone Case Requirements", (shape) => {
  verify.notEmpty("Has geometry", shape);
  verify.that("Is a shell", () => {
    const bb = shape.boundingBox();
    const bboxVol = (bb.max[0]-bb.min[0]) * (bb.max[1]-bb.min[1]) * (bb.max[2]-bb.min[2]);
    return shape.volume() < bboxVol * 0.5;
  });
  verify.lessThan("Under 30g (PLA)", shape.volume() * 0.00124, 30);
});

// Step 2: Build iteratively, watching specs go green
const myCase = box(75, 150, 12);  // ✗ not a shell yet
// ... iterate ...

caseSpec.check(myCase);
return myCase;
```

The user sees requirements as red checks immediately. As they build, checks flip to green. **The spec tells them when they're done.**

### 2. Reusable Specs (Apply to Multiple Shapes)

```javascript
const structural = spec("Structural Integrity", (shape) => {
  verify.greaterThan("Min volume", shape.volume(), 500);
  verify.notEmpty("Not degenerate", shape);
});

// Check every part in an assembly
const parts = [bracket, plate, standoff];
for (const part of parts) {
  structural.check(part);
}
```

One spec definition, applied to N shapes. Each appears as a separate group in the UI.

### 3. Importable Spec Libraries

```javascript
// specs/printers.forge.js
module.exports = {
  prusaMK3S: spec("Prusa MK3S", (s) => { /* bed size checks */ }),
  bambuX1:   spec("Bambu X1C",  (s) => { /* bed size checks */ }),
  ender3:    spec("Ender 3",    (s) => { /* bed size checks */ }),
};

// my-part.forge.js
const { prusaMK3S } = require("./specs/printers.forge.js");
const part = box(100, 100, 50);
prusaMK3S.check(part);
return part;
```

A library of standard specs: printer beds, phone dimensions, standard bolt holes, material properties. Import what you need.

### 4. Reference Geometry in Specs

Specs can include shapes that aren't rendered — they exist only as test fixtures.

```javascript
const fitsInEnclosure = spec("Fits in enclosure", (shape) => {
  // The enclosure is reference geometry — not rendered
  const enclosure = box(200, 150, 100);

  // Shape must fit inside with clearance
  verify.that("Fits inside", () => {
    const diff = enclosure.subtract(shape);
    return diff.volume() > 0;  // enclosure is bigger
  });

  // At least 2mm clearance on all sides
  verify.minClearance("Min clearance", shape, enclosure, 2.0, 20);
});
```

The enclosure exists only inside the spec. It's used for validation but never appears in the viewport. **The spec defines the world the model must fit into.**

### 5. Composable Specs

```javascript
// Combine specs
const allRequirements = spec.all(
  fitsIPhone15,
  printableOnMK3S,
  structural,
);

allRequirements.check(myModel);
```

Or apply multiple individually — each gets its own group in the panel.

### 6. Multi-Shape Specs (Fit Between Parts)

Not all specs are about a single shape. Some are about relationships:

```javascript
const assemblyFit = spec("Assembly Fit", (partA, partB) => {
  verify.notColliding("No interference", partA, partB);
  verify.minClearance("Assembly clearance", partA, partB, 0.2, 10);
  verify.parallel("Mating faces aligned",
    partA.face('top'), partB.face('bottom'));
});

assemblyFit.check(bracket, plate);
```

---

## How It Works Internally

### The Spec Object

```typescript
interface Spec {
  name: string;
  check(...shapes: Shape[]): SpecResult;
}

interface SpecResult {
  name: string;
  passed: number;
  total: number;
  results: VerificationResult[];
}
```

### Verification Grouping

When `spec.check()` runs, it:
1. Records the current verify count
2. Calls the user's check function
3. Captures all new verify results since step 1
4. Tags them with the spec name (new `group` field on VerificationResult)

```typescript
// In verification.ts
interface VerificationResult {
  id: string;
  label: string;
  status: 'pass' | 'fail';
  message: string;
  line?: number;
  expected?: string;
  actual?: string;
  group?: string;        // ← NEW: spec name for grouping
}
```

### UI Changes

`VerificationsPanel.tsx` groups results by `group` field:
- Results with a group → collapsible section with spec name and pass/total count
- Results without a group → shown ungrouped (backward compatible)
- Each group header shows: spec name + status icon + "N/M" badge
- Groups with failures expand automatically (existing behavior, scoped to group)

---

## What This Does NOT Do

| Non-goal | Why |
|----------|-----|
| Physics simulation | No FEA/CFD. Specs check geometry, not stress/flow. |
| Manufacturing analysis | No wall-thickness scanning, overhang detection (yet). |
| Tolerance stack-up | Statistical analysis is a separate concern. |
| Auto-generate geometry | The spec checks, it doesn't build. The user (or an agent) still writes the model. |
| Replace verify API | `verify.*` still works standalone. Specs are an optional grouping layer on top. |

---

## Implementation Sketch

### What Changes

| File | Change | Size |
|------|--------|------|
| `src/forge/verification.ts` | Add `group` field to `VerificationResult`. Add `spec()` function. | ~40 lines |
| `src/forge/forge-public-api.ts` | Export `spec`. | 1 line |
| `src/components/VerificationsPanel.tsx` | Group results by `group` field, render collapsible sections. | ~60 lines |

### The `spec()` Implementation

```typescript
// In verification.ts

export function spec(name: string, checkFn: (...shapes: any[]) => void) {
  return {
    name,
    check(...shapes: any[]) {
      const before = _collected.length;
      // Set the active group so verify calls get tagged
      _activeGroup = name;
      try {
        checkFn(...shapes);
      } finally {
        _activeGroup = null;
      }
      // Return summary
      const added = _collected.slice(before);
      return {
        name,
        passed: added.filter(r => r.status === 'pass').length,
        total: added.length,
        results: added,
      };
    },
  };
}

let _activeGroup: string | null = null;

// Modify push() to tag results:
function push(result: VerificationResult): void {
  if (_activeGroup) result.group = _activeGroup;
  _collected.push(result);
}
```

That's it. ~15 lines of core logic.

---

## Open Questions

1. **Spec composition syntax** — `spec.all(a, b, c)` that runs all specs and shows a combined group? Or just call each `.check()` separately?

2. **Spec parameters** — Should specs be parameterizable? E.g., `printerBed(width, depth, height)` → creates a spec for that specific printer.

3. **Severity levels** — Should some checks be "warnings" vs "errors"? Currently everything is pass/fail. A spec might have "must-have" vs "nice-to-have" checks.

4. **Spec status on shape** — Should `shape.specs` or `shape.status` expose which specs have been checked and their results? Useful for multi-file projects.

5. **Spec-aware rendering** — Could failing specs influence the viewport? E.g., show the enclosure as a ghost/wireframe when the "fits in enclosure" spec fails? This would make the mismatch visible.

---

## Concrete Use Cases

| Use Case | Spec Contents |
|----------|---------------|
| Phone case design | Phone dimensions, wall thickness range, screen opening, camera cutout |
| 3D printing validation | Printer bed limits, min wall thickness, no overhangs > 45° |
| Assembly fit check | Clearance between mating parts, alignment of mounting faces |
| Gear specification | Module, tooth count, pitch diameter, mesh clearance with partner gear |
| Structural bracket | Bolt hole positions match mounting pattern, min cross-section area |
| Parametric validation | Spec runs at multiple param values to ensure it works across the range |

---

## Progress Tracker

| # | Change | Status |
|---|--------|--------|
| — | Concept exploration | Done |
| P1 | Add `group` to VerificationResult + `spec()` function | Not started |
| P2 | Update VerificationsPanel for grouped display | Not started |
| P3 | Create example: phone-case-spec.forge.js | Not started |
| P4 | Create example: printer-bed-spec library | Not started |

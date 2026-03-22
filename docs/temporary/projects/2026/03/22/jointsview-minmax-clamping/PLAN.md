# JointsView min/max Clamping: Analysis and Recommendation

## Goal

Determine whether the `min`/`max` clamping on `jointsView` joints should be removed, made opt-in, or restricted to slider-only contexts. The immediate problem: animation keyframe values (e.g. IK-computed elbow angle of -45) get silently clamped by joint limits (e.g. `min: 0`), producing wrong geometry.

## Current State

Joint `min`/`max` are optional fields on `JointViewInput` / `JointViewDef` (defined in `src/forge/jointsView.ts:11-12, 48-49`). When present, they are enforced at multiple layers via `clampJointValue()` functions. There is already a `{ clamp: false }` option on `resolveJointViewValues()` (line 391), but it is only used in two places.

---

## All Clamping Call Sites

### 1. `src/forge/jointsView.ts:374-378` -- Core `clampJointValue`

```ts
const clampJointValue = (joint: JointViewDef, value: number): number => {
  let clamped = Number.isFinite(value) ? value : joint.defaultValue;
  if (joint.min !== undefined) clamped = Math.max(joint.min, clamped);
  if (joint.max !== undefined) clamped = Math.min(joint.max, clamped);
  return clamped;
};
```

Called from `resolveJointViewValues()` (lines 408, 421) when `options.clamp !== false`. This is the canonical clamping point for the jointsView pipeline.

**Purpose**: Enforce joint limits on resolved values.
**Assessment**: HARMFUL for animation -- silently destroys keyframe values that exceed limits.

### 2. `src/store/forgeStore.ts:691-700` -- Store-level `clampJointValue`

```ts
const clampJointValue = (value: number, min?: number, max?: number): number => { ... };
```

Called in two places:
- **`syncJointValues()` (line 724)**: When a new `RunResult` arrives, re-syncs persisted joint values against new joint definitions. Clamps values that may have been valid under old limits.
- **`setJointValue()` (line 1275)**: When the user moves a slider in the UI.

**Purpose**: Keep the store's `jointValues` within declared limits.
**Assessment**: `setJointValue` clamping is APPROPRIATE (slider input). `syncJointValues` clamping is DEBATABLE -- it silently discards values that animations may need.

### 3. `src/components/Viewport.tsx:921-925` -- Viewport `clampJointValue`

```ts
const clampJointValue = (joint: JointViewDef, value: number): number => { ... };
```

Called in two places:
- **`computeJointNodeMatrices()` (line 1021)**: Computes the transform matrix for each joint node. Clamps before applying the rotation/translation.
- **Joint overlay rendering (line 5056)**: Computes visual overlay data (axis arrows, arcs).

**Purpose**: Ensure the transform matrices and visual overlays use clamped values.
**Assessment**: HARMFUL -- this is where animation values get clamped before being applied to the 3D scene. The `effectiveJointValues` passed in are already resolved (possibly with `clamp: false` for continuous animations at line 4816), but then clamped again here.

### 4. `src/components/Viewport.tsx:4811-4818` -- `effectiveJointValues` resolution

```ts
const effectiveJointValues = useMemo(
  () => resolveJointViewValues(joints, jointCouplings, animatedJointValues,
    { clamp: !(activeJointAnimation?.continuous ?? false) }),
  ...
);
```

**Purpose**: Disable clamping for continuous animations only.
**Assessment**: PARTIALLY CORRECT -- recognizes that continuous animations need unclamped values, but non-continuous animations still get clamped. Also, even when `clamp: false` is passed here, call site #3 re-clamps inside `computeJointNodeMatrices`.

### 5. `cli/render.ts:211-216` -- CLI render `clampJointValue`

```ts
function clampJointValue(joint: JointViewDef, value: number): number { ... }
```

Called in `computeJointNodeMatrices()` (line 265) -- same pattern as Viewport.

**Purpose**: Enforce limits during headless/CLI rendering.
**Assessment**: Same problem as Viewport -- animation values get silently clamped.

### 6. `src/forge/assembly.ts:235-240` -- Assembly `clampJointValue`

```ts
function clampJointValue(joint: JointRecord, value: number): { value: number; wasClamped: boolean } { ... }
```

Called during `assembly.resolve()` (line 896). This is the **assembly system** (build-time), not the jointsView (runtime). Returns a `wasClamped` flag and emits a warning.

**Purpose**: Enforce physical joint limits in assembly construction.
**Assessment**: APPROPRIATE for assembly -- these are physical constraints on the mechanism. The warning is good practice.

### 7. `src/forge/sdfExport.ts:211-216` -- SDF export `clampJointValue`

```ts
function clampJointValue(joint: AssemblyJointDef, value: number): { value: number; clamped: boolean } { ... }
```

Called during `resolveJointValues()` (line 231) for SDF export. Also uses min/max as `<limit>` elements in the SDF XML (lines 751-752).

**Purpose**: (a) Clamp initial joint state for SDF, (b) Export physical limits to SDF format.
**Assessment**: APPROPRIATE -- SDF format requires valid joint limits for simulation.

### 8. `src/components/ViewPanel.tsx:66-69` -- `resolveJointRange` (slider range)

```ts
const resolveJointRange = (type, min, max) => ({
  min: min ?? (type === 'prismatic' ? -100 : 0),
  max: max ?? (type === 'prismatic' ? 100 : 360),
});
```

Used at line 768 to set slider `min`/`max` attributes, and then the displayed value is clamped to slider range at line 771: `Math.max(min, Math.min(max, clampedValue))`.

**Purpose**: Define slider range for the UI. Also provides default ranges when user omits min/max.
**Assessment**: APPROPRIATE -- sliders need a range to render. Note: `displayedRawJointValues` (unclamped) is used for the numeric label (line 787), while `displayedJointValues` (clamped) is used for slider position.

### 9. `src/forge/jointsView.ts:112-118` -- `clampDefault`

```ts
const clampDefault = (jointName, value, min, max): number => { ... };
```

Called at line 166 to clamp the `defaultValue` to within `[min, max]` at normalization time.

**Purpose**: Ensure default value is within declared limits.
**Assessment**: APPROPRIATE -- a default outside limits would be nonsensical for slider initial position.

---

## The Double-Clamping Bug

There is a critical double-clamping path:

1. `Viewport.tsx:4816` correctly passes `{ clamp: false }` for continuous animations
2. But `computeJointNodeMatrices()` at line 1021 calls `clampJointValue()` again unconditionally
3. So even when the resolution says "don't clamp", the matrix computation re-clamps

The same pattern exists in `cli/render.ts:265`.

---

## Tests

There are **no unit test files** (`*.test.*`) that test clamping behavior.

There is one integration check in `cli/check-transforms.ts:454-458` that explicitly tests clamped vs unclamped:

```ts
const clamped = resolveJointViewValues(joints, [], thirdCycle);
const unclamped = resolveJointViewValues(joints, [], thirdCycle, { clamp: false });
assert(approx(clamped['Input Drive'], 1440), ...);
assert(approx(unclamped['Input Drive'], 1800), ...);
```

This test uses `min: -1440, max: 1440` and verifies that clamped caps at 1440 while unclamped allows 1800. This test would need updating if default clamping behavior changes.

---

## What Clamping Protects Against

1. **NaN/Infinity propagation**: All `clampJointValue` implementations fall back to `defaultValue` for non-finite inputs. This is genuinely useful.
2. **Slider out of range**: Without clamping, the HTML `<input type="range">` would clamp itself anyway, but the internal state could drift.
3. **SDF validity**: SDF joint limits are a real physical concept -- they define the range of motion for simulation.
4. **Assembly physical limits**: Assembly joints represent real mechanical constraints.

What it does NOT protect against:
- There is no evidence of any crash, NaN explosion, or rendering artifact from unclamped values. Rotations and translations work fine with any finite angle/distance.

---

## Blast Radius of Removing Clamping

### Option A: Remove min/max entirely
- **Breaks**: SDF export (needs limits for `<limit>` elements), assembly system (physical constraints), slider UI (needs range)
- **Verdict**: Too aggressive

### Option B: Remove clamping from animation pipeline, keep for sliders and export
- **Breaks**: `cli/check-transforms.ts` assertion at line 457 (expects clamped value of 1440)
- **Fixes**: Animation keyframe values flow through unclamped to geometry
- **Verdict**: Best option

### Option C: Make clamping opt-in (default off)
- **Breaks**: Same as B, plus any user code relying on implicit clamping
- **Verdict**: More disruptive than needed

---

## Recommendation

**Option B: Slider-only clamping.** Concretely:

1. **`resolveJointViewValues()`** -- change default from `clamp: true` to `clamp: false`. Callers that want clamping (the store's `setJointValue`) should explicitly pass `{ clamp: true }`.

2. **`computeJointNodeMatrices()` in Viewport.tsx and cli/render.ts** -- remove the `clampJointValue()` calls. These functions receive already-resolved values; they should not re-clamp. This fixes the double-clamping bug.

3. **`syncJointValues()` in forgeStore.ts** -- keep clamping, but only for non-animated state. When animation is active, the animated values bypass the store anyway.

4. **`setJointValue()` in forgeStore.ts** -- keep clamping. This is the slider path and clamping is appropriate.

5. **`computeJointNodeMatrices()` overlay rendering (line 5056)** -- remove clamping. The overlay should show the actual value, not the clamped one.

6. **Assembly and SDF export** -- no changes. These are separate systems with legitimate physical constraints.

7. **Keep NaN/Infinity guard** -- the `Number.isFinite(value) ? value : defaultValue` part is valuable and should remain in all paths.

8. **Update `cli/check-transforms.ts`** -- adjust the test that asserts clamped behavior, or split it into explicit clamped/unclamped tests.

### Key Files to Modify

| File | Change |
|------|--------|
| `src/forge/jointsView.ts:391` | Change default `clamp` to `false` |
| `src/components/Viewport.tsx:921-925` | Remove or gate behind parameter |
| `src/components/Viewport.tsx:1021` | Stop calling `clampJointValue` |
| `src/components/Viewport.tsx:5056` | Stop calling `clampJointValue` |
| `src/components/Viewport.tsx:4816` | Remove the conditional -- no longer needed if default is unclamped |
| `src/store/forgeStore.ts:1275` | Keep (slider path) |
| `src/store/forgeStore.ts:724` | Keep (sync path) |
| `cli/render.ts:265` | Stop calling `clampJointValue` |
| `cli/check-transforms.ts:454-458` | Update expected values |

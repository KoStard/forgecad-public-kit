# path() Arc Support — Investigation

**Started:** 2026-03-27
**Branch:** worktree-path-arc-support
**Triggered by:** path() doesn't support arcs; user wants to chain arcs (2 parallel lines + 2 small arcs + 1 large arc)

---

## Goal & Current State

`path()` is a fluent 2D outline builder. Currently it only accumulates line vertices — no arcs, no curves. The user wants arc support, specifically for patterns like:

```
  ┌────────────────────┐        ← parallel lines (top, bottom)
  │  small  large  small│
  └────────────────────┘

  top-line ─▶ small-arc ─▶ large-arc ─▶ small-arc ─▶ bottom-line ─▶ close
```

**Immediate answer:** This shape is achievable TODAY with `constrainedSketch()` using chained `arcTo()`. See [→ How to do it now](#how-to-chain-arcs-today).

**Design question:** Should `path()` grow arc support, or should `constrainedSketch()` be the recommended API for arcs?

---

## Architecture Summary

### Two APIs, different levels

| | `path()` | `constrainedSketch()` |
|---|---|---|
| **Location** | `src/forge/sketch/path.ts` | `src/forge/sketch/constraints/` |
| **Storage** | `[number, number][]` — raw points only | Entity graph: points, lines, arcs, beziers, loops |
| **Arc support** | ❌ None | ✅ `arcTo()`, `arcByCenter()`, `blendTo()`, `addProfileLoop()` |
| **Solver** | No | Yes (Rust/WASM constraint solver) |
| **Close** | Returns `Sketch` directly | Returns `this` (builder), need `.solve()` |
| **Ergonomics** | Simple, short | Full-featured but more ceremony |

### `arcTo()` in constrainedSketch

`arcTo(x, y, radius, clockwise?)` — draws a circular arc from current cursor to (x, y):
- Auto-computes arc center from start, end, radius, and direction (no manual center needed)
- Adds the arc to the current profile loop segment list
- Returns `this` → fully chainable

Chaining two `arcTo()` calls works — they share the endpoint:
```js
sk.moveTo(0, 0);
sk.arcTo(r, r, r, false);     // CCW quarter-circle
sk.arcTo(0, 2*r, r, true);    // CW quarter-circle (S-shape)
sk.close();
sk.solve().extrude(5);
```

---

## How to Chain Arcs Today

The "2 parallel lines + 2 small arcs + 1 large arc" shape with `constrainedSketch()`:

```js
// Imagine:  two horizontal parallel lines (length L, gap W apart)
// The right end closes with: small arc (r1) → large arc (R) → small arc (r1)
// The left end closes straight.

const L = 40, W = 20, r1 = 5, R = 20;

const sk = constrainedSketch();
// Top-left start
sk.moveTo(0, 0);
// Top line rightward
sk.lineTo(L, 0);
// Small arc: top-right corner, sweeping CW to meet large arc
sk.arcTo(L + r1, r1, r1, true);
// Large arc: sweeps CCW across the right end bulge
sk.arcTo(L + r1, W - r1, R, false);
// Small arc: bottom-right corner, sweeping CW to bottom line
sk.arcTo(L, W, r1, true);
// Bottom line leftward
sk.lineTo(0, W);
// Close (straight left end)
sk.close();

return sk.solve().extrude(8);
```

See example: `examples/api/arc-chain-demo.forge.js`

**Caveat:** The exact coordinates for each `arcTo()` endpoint depend on the geometry.
For the right-end bulge, the math is:
- top corner arc ends at `(L + r1, r1)` — tangent point on vertical
- large arc connects `(L + r1, r1)` → `(L + r1, W - r1)`, radius R
- bottom corner arc ends at `(L, W)`

---

## Gap Analysis: What path() is Missing

| Feature | path() | constrainedSketch() |
|---|---|---|
| `arcTo(x, y, r)` | ❌ | ✅ |
| `arcByCenter(...)` | ❌ | ✅ |
| `blendTo(x, y)` — tangent Bezier from arc | ❌ | ✅ |
| `bezierTo(...)` | ❌ | ✅ |
| Chained arc-arc (S-curves) | ❌ | ✅ |
| `stroke()` — polyline to solid | ✅ | ❌ |
| No `.solve()` needed | ✅ | ❌ |

---

## Paths Forward

### Option A — Add arcTo to path() via tessellation (simplest)

Add `arcTo(x, y, radius, clockwise?)` to `PathBuilder`. Compute arc geometry inline (reuse `addArc` center calculation), sample to `N` polyline points, append to `this.points`.

**Pros:**
- Zero dependency change — path() stays a pure polyline accumulator
- Works with existing `close()` and `stroke()` unchanged
- Very small implementation (~20 lines)
- Arc-to-arc chaining works automatically since cursor advances

**Cons:**
- Tessellated arcs → faceted edges at low sample counts
- No true arc entities — can't apply arc constraints later
- `stroke()` corner handling at arc joints may look bad

**Verdict:** Good for quick wins. `stroke()` + arc joints may need care.

---

### Option B — Add arcTo to path() as a stored segment (medium)

Change `PathBuilder` to store typed segments instead of raw points:

```ts
type PathSeg =
  | { kind: 'line'; x: number; y: number }
  | { kind: 'arc'; x: number; y: number; radius: number; clockwise: boolean };
```

Tessellate only at `close()` / `stroke()` time.

**Pros:**
- `stroke()` can handle arc joints properly (round joins are geometrically correct)
- Could later output true arc entities for OCCT/BRep pipelines
- Clean architecture for future Bezier/spline addition

**Cons:**
- Larger refactor of PathBuilder internals
- `close()` needs to tessellate segments (not just reverse winding)

**Verdict:** Best long-term architecture. Moderate work.

---

### Option C — Make path() delegate to constrainedSketch() (heavy)

When an arc is added, internally switch to a `ConstrainedSketchBuilder`. `close()` calls `.solve()` internally and returns the sketch.

**Pros:**
- True arc entities — constraints, tangency, BRep export
- Reuses all existing arc code

**Cons:**
- Heavy dependency — path() pulls in the constraint solver
- `.solve()` adds latency (Rust/WASM init)
- Mixes two very different paradigms

**Verdict:** Over-engineered for most use cases. The solver is not needed for simple arc chains.

---

### Option D — Promote constrainedSketch() path API (no path() changes)

Document that `constrainedSketch()` is the right tool for arc-containing profiles. Add examples. Keep `path()` as a pure line builder.

**Pros:**
- No code changes
- Clear separation of concerns

**Cons:**
- `constrainedSketch()` requires `.solve()`, more ceremony
- Users expect `path().arcTo()` (the JSDoc even says "arcTo" in the docstring!)
- Two APIs for what feels like the same concept

**Verdict:** Acceptable interim state, but creates user confusion. Path() docstring already promises `arcTo`.

---

## Recommendation

**Short term:** Option A — add `arcTo()` to `PathBuilder` via tessellation. It's 20 lines, unblocks the user immediately, and arc-arc chaining works out of the box. Sample count = 32 by default (matches Bezier tessellation).

**Medium term:** Option B — refactor PathBuilder to store typed segments. This properly fixes `stroke()` at arc joints and opens the door to native arc export.

**Not recommended:** Option C (over-engineered), Option D (ignores the docstring promise).

---

## Progress Tracker

| # | Change | What tested | Status |
|---|--------|-------------|--------|
| — | Baseline — no arc support in path() | Manual inspection | ✅ confirmed |
| E1 | Example: arc chain with constrainedSketch() | arc-chain-demo.forge.js | ✅ runs, vol=6886mm³, bbox x=44.7 (sagitta=0.7mm confirmed) |
| E2 | Prototype arcTo in PathBuilder (tessellation) | TBD | — |

---

## Experiment Log

#### E1 — Arc chain example with constrainedSketch() (SUCCESS)
**What**: Wrote `examples/api/arc-chain-demo.forge.js` — parallel lines + triple-arc right end.
**Result**: Runs cleanly, vol=6886mm³, bbox x=44.7 (L+r+sagitta=44+0.7=44.7 ✅). Large arc bulges correctly outward.
**Key finding**: `clockwise=false` on the large cap arc (center goes left/inward → arc bulges right/outward). The sagitta with R=25, chord=12 is only ~0.7mm — for a visible bulge, use a smaller R or wider chord.
**Lesson**: Arc chaining works today with `constrainedSketch()`. The `clockwise` flag is intuitive once you know: CW=center right of travel, CCW=center left of travel.

---

## Files Modified

| File | Purpose |
|------|---------|
| `docs/temporary/projects/2026/03/27/path-arc-support/PLAN.md` | This document |
| `examples/api/arc-chain-demo.forge.js` | Demonstration of arc chaining (to be created) |
| `src/forge/sketch/path.ts` | arcTo() addition (Option A, pending decision) |

# Rect 180° Rotation Blind Spot

**Goal**: Fix the CCW constraint (or rect initialization) so that axis-aligned rectangles cannot converge to a 180°-rotated state where `bottomLeft` is physically at the top-right, `.left` is on the right, etc.

**Current state**: SOLVED ✓ (55/55 tests pass, 480/480 parameter sweep pass)

## Root Cause

The CCW constraint checks `signed_area(bl, br, tr, tl) >= 0`. For a rect with width `w` and height `h`:

- `w > 0, h > 0` → area > 0 → CCW ✓ (correct orientation)
- `w > 0, h < 0` → area < 0 → CW → CCW catches it ✓
- `w < 0, h > 0` → area < 0 → CW → CCW catches it ✓
- **`w < 0, h < 0` → area > 0 → CCW ✓ but rect is INSIDE-OUT** ← THE BUG

In the inside-out state:
- `.bottomLeft` is at the physical top-right
- `.left` side is on the physical right
- `.right` side is on the physical left
- All structural constraints (horizontal/vertical) satisfied (they only check slope, not direction)
- CCW satisfied (positive area)
- Length constraints satisfied (distance is always positive)

## Progress Tracker

| # | Change | Sweep (480) | Tests (55) | Status |
|---|--------|-------------|------------|--------|
| — | Baseline | 0 pass | 55 pass | ❌ 180° rotated |
| P1 | blockRotation + sameDirection + oppositeDirection | 480 pass | 55 pass | ✅ Fixed |

## Experiment Log

### Baseline (CONFIRMED BUG)

**What**: Ran diagnostic with default params (475×350 surface, 32.5×339 sides).
**Result**: LEFT SIDE rect has `w = -32.5`, `h = -339.0`, signed_area = +11017.5 (CCW).
**Why**: CCW only checks sign of area. Negative width × negative height = positive area.

### P1: Three new constraints (SUCCESS)

**What**: Added three constraint types:
1. `blockRotation` — one-sided barrier ensuring first edge points in +x (applied automatically to all rects)
2. `sameDirection` — forces two lines co-directional (not just parallel)
3. `oppositeDirection` — forces two lines anti-parallel

**Result**: 480/480 parameter sweep pass. 55/55 existing tests pass. Left side rect now has `w=32.5, h=339.0`.

**Why it works**: `blockRotation` mirrors point positions around centroid when the first edge direction is negative, seeding LM in the correct basin. The one-sided residual provides gradient information to keep it there. `sameDirection`/`oppositeDirection` give users explicit control over line direction for `lineDistance` sign semantics.

## Files Modified

| File | Change | Purpose |
|------|--------|---------|
| `defs/sameDirection.ts` | New constraint | Forces two lines co-directional |
| `defs/oppositeDirection.ts` | New constraint | Forces two lines anti-parallel |
| `defs/blockRotation.ts` | New constraint | Prevents 180° rotation via first-edge direction check |
| `defs/index.ts` | Register new defs | Side-effect imports |
| `builder.ts` | Builder methods | `sameDirection()`, `oppositeDirection()`, `blockRotation()` |
| `concepts/rect.ts` | Auto-apply blockRotation | Every rect gets `blockRotation([bl, br, tr, tl])` |

# Sheet Metal Authoring Reflection

Date: 2026-03-13

Context: building a new personal-project part, `aurora-signal-shroud`, against the current `sheetMetal()` v1 subset.

## What Slowed the Work Down

### 1. The semantic subset was clear, but the practical safe lane was not

The permanent docs explained what sheet metal supports:

- one panel
- up to four flanges
- panel/flange cutouts
- folded and flat outputs

What they did not yet make obvious was the practical "start here" authoring lane for decorative or vented parts.

I still had to discover by trial that the fastest current path is:

- simple cutout sketches
- low cutout counts
- panel-first detailing
- flange cutouts added one region at a time

### 2. Slow execution was a worse failure mode than a hard error

The hardest part of the exploration was not a crisp "unsupported" diagnostic.

The hard part was that richer cutout compositions could push validation into very slow runtime. That creates a bad loop:

1. author a more expressive motif
2. run the file
3. wait long enough that it is unclear whether the file is invalid, merely expensive, or stuck on a complexity cliff
4. simplify by intuition

That is much slower than a targeted defended-subset error.

### 3. The example surface is still too narrow

`folded-service-panel-cover` is a strong proof artifact, but it teaches only one flavor of part:

- ordinary rectangular panel
- ordinary flange cutout
- ordinary mounting holes

It does not yet teach:

- decorative vent language
- mirrored flange detail patterns
- how far composed sketches can go before iteration quality drops
- what a "cool but still defended" cover should look like in practice

### 4. Flange-local placement was easy to misread

It was easy to guess wrong about flange-local `u` / `v` intent, especially on side flanges.

The fix was simple once discovered:

- place one asymmetric test cutout on one flange
- validate orientation
- only then mirror or repeat

But that guidance was learned from the build instead of from the docs.

### 5. Parameter drift showed up during simplification

During the simplification pass, one parameter (`Orbit Count`) stopped affecting the geometry for a bit.

This was not a sheet-metal kernel bug, but it is a useful reminder that exploratory simplification can quietly turn a once-real control into a no-op. Fast authoring flows should make that kind of drift easier to notice.

## What Ended Up Working Reliably

- Base panel plus flanges first.
- Validate folded and flat outputs before any cutouts.
- Use mostly `roundedRect(...)` and `circle2d(...)` for the first pass.
- Prefer fewer, larger openings over dense composed detail.
- Add flange cutouts on one flange first, then mirror once placement is confirmed.
- Re-run validation after each new region instead of doing all panel and flange detail in one jump.

## What This Suggests

Short-term:

- permanent docs should explicitly teach the practical first-pass workflow
- sheet-metal examples should include at least one vented/decorative cover
- authoring guidance should recommend one-flange-first validation for flange cutouts

Medium-term:

- sheet-metal needs targeted diagnostics for cutout complexity cliffs
- repeated and mirrored cutout placement deserves higher-level helpers

Related backlog proposal:

- [`tasks/backlog/sheet-metal-authoring-ergonomics.md`](../../../../../../../tasks/backlog/sheet-metal-authoring-ergonomics.md)

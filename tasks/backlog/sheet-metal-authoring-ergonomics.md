# Sheet Metal Authoring Ergonomics
## Problem Definition
ForgeCAD now has a real compiler-owned `sheetMetal()` family, but the current authoring experience still falls short of the preferred state:

"Open the docs, understand the defended lane quickly, and write a cool sheet-metal project almost immediately."

In practice, exploratory sheet-metal work still burns time on boundary-finding instead of design:

- the semantic subset is documented, but the practical "safe first pass" is still implicit
- richer cutout sketches can degrade into slow validation instead of a targeted diagnostic
- there is only one strong canonical example, so authors still have to discover the practical cutout vocabulary themselves
- repeated or mirrored flange detailing is still more manual than it should be

The result is that new sheet-metal work feels more frontier-mapping than normal ForgeCAD authoring.

## Description
Improve the sheet-metal authoring experience so ordinary cover/bracket work becomes fast and predictable without widening the semantic subset dishonestly.

This task should focus on the gap between "sheet metal exists" and "sheet metal is immediately pleasant to use."

Primary areas:

- codify the practical fast lane for cutout-heavy authoring
- make out-of-bounds or too-expensive cutout patterns fail with targeted feedback
- reduce manual placement boilerplate for repeated and mirrored cutout workflows
- expand the maintained example surface so authors are not forced to infer the safe lane from one proof artifact

This is an ergonomics and defended-workflow task, not a request to widen sheet metal into generic manufacturing CAD.

## Requirements
- Preserve the existing compiler-owned `sheetMetal()` semantic ownership and defended v1 subset from task 310.
- Add targeted diagnostics for cutout patterns that exceed the currently defended or practical runtime lane. Slow "mystery hangs" are not acceptable as the primary feedback path.
- Introduce at least one authoring helper for common repetitive workflows such as:
  - mirrored cutouts across panel center
  - evenly spaced cutout rows or columns
  - repeated flange detail placement without manual coordinate duplication
- Add at least two maintained examples beyond `folded-service-panel-cover`, with at least one intentionally decorative but still defended vented cover.
- Add regression coverage for the new helpers and for the failure/diagnostic path when a cutout pattern exceeds the defended lane.
- Keep unsupported operations explicit. This task must not smuggle in bend cutouts, non-90 degree flanges, or arbitrary solid-to-sheet-metal conversion.
- Update permanent docs so the "fast first pass" is part of the official guidance instead of tribal knowledge.

## Status and log
- 2026-03-13: Created after a real project build showed that `sheetMetal()` exists semantically, but the practical authoring lane for cutout-heavy parts is still too implicit and too easy to discover by trial and error.
- 2026-03-13: Not started.

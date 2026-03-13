# Broader Shell Workflows
## Problem Definition
`shell()` exists as a narrow defended subset today. That is useful, but not yet broad enough to count as a comfortable daily-use part-design feature.

## Description
Broaden shell support from the current v1 subset into a stronger ordinary part-design workflow while staying compiler-owned and explicit about limits.

Primary dependencies:

- task 300

Primary files:

- shell feature modules
- `src/forge/shapeFaces.ts`
- compile lowerers and diagnostics
- shell regression corpus cases

## Requirements
- Broaden shell coverage beyond the narrow v1 base subset where both lowerers can defend it honestly.
- Support richer opening selection using compiler-owned descendant regions instead of fixed top/bottom slots only.
- Preserve created-face ownership well enough for downstream projection, holes, cuts, and finishing in the defended subset.
- Add regression parts that prove shell-created inner/outer wall faces can be targeted later without brittle synthetic naming.
- Document unsupported shell shapes and topology situations explicitly.

## Status and log
- 2026-03-13: Blocked on task 300.
- 2026-03-13: Not started.

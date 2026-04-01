# Pattern And Mirror Feature Ownership
## Problem Definition
Mirror/pattern-style workflows need compiler-owned downstream ownership semantics. Without that, repeated features will look correct in isolated cases but lose provenance once the model gets more complex.

## Description
Implement downstream ownership for mirrored and patterned feature results on top of the shared face-query backbone.

Primary files:

- feature modules for pattern/mirror ownership and lowering
- thin compile/lowerer integration
- compiler regression cases for repeated feature results

Isolation rule:

- do not redefine face/body query semantics
- focus on repeated-result ownership and diagnostics

## Requirements
- Preserve meaningful provenance for mirrored/patterned feature results.
- Keep both lowerers aligned for the supported subset.
- Add curated regression parts that combine repeated features with booleans and workplane-driven details.
- Document the supported repetition modes honestly.

## Status and log
- 2026-03-12: Ready after task 100.
- 2026-03-12: Completed. Added compiler-owned repeated-result ownership for `Shape.mirror()`, `linearPattern()`, and `circularPattern()`, plus repeated-feature placement/BREP/compiler regressions and honest docs for the supported subset.

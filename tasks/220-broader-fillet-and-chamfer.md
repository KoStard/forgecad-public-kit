# Broader Fillet And Chamfer
## Problem Definition
Task 130 landed an honest first finishing subset. The next step is not "support all fillets" by brute force. The next step is to widen finishing only where propagated edge meaning is defended.

Without that discipline, fillet/chamfer will become the exact kind of brittle feature family this compiler program is trying to avoid.

## Description
Expand compiler-owned fillet/chamfer support on top of propagated post-rewrite edge queries.

Scope this task to the next defended subset:

- supported propagated edges after supported boolean/repetition/rewrite flows
- broader but still explicit exact/runtime support boundaries
- downstream ownership preserved through the new finishing subset where the compiler can defend it

Primary files:

- edge-finish feature modules
- edge-query resolution / propagation integration
- exact/runtime regression checks
- capability docs

## Requirements
- Reuse propagated edge queries from task 190 instead of inventing local matching rules.
- Keep both lowerers aligned for the supported subset.
- Add regression parts that prove normal downstream edits still work after the broadened finishing subset.
- Reject ambiguous or unsupported propagated-edge cases explicitly.
- Document the broadened subset and remaining gaps honestly.

## Isolation Rule
- Depends on task 180 and task 190; do not re-implement query propagation here.
- Avoid hole/cut or projection feature work.
- Keep central lowerer edits thin and push logic into finishing-specific modules.

## Dependencies
- task 160
- task 180
- task 190
- task 130

## Parallelization
Can start after tasks 180 and 190 land. Safe to run in parallel with:

- task 200
- task 210

## Status and log
- 2026-03-12: Created for the second post-160 feature wave.
- 2026-03-12: Completed. Broadened compiler-owned fillet/chamfer support to defended preserved propagated sibling vertical edges through supported finishing and boolean-union chains, kept merged selected-edge cases explicit with propagation diagnostics, expanded API/placement/query-propagation/compiler/BREP/corpus coverage, and updated the permanent docs to describe the supported and unsupported subset honestly.

# Exploded View In Standard Library

## Description
Promote exploded-view behavior from ad-hoc script logic into a reusable standard-library feature.
Current projects need custom offset math, staged multipliers, and manual per-part separation. This should be first-class.

## Requirements
- Add a standard API for exploded views, for example:
  - `lib.explode(items, options)` for arrays/groups
  - or `assembly.explode(level)` when an assembly API exists
- Support staged explosion (multiple depth levels, not one global offset).
- Support directional control per part/group:
  - explicit vectors
  - automatic radial mode from assembly root
  - optional axis-locked modes (X/Y/Z)
- Preserve object identity and naming in view panel.
- Work with nested `group` outputs.
- Be deterministic across re-runs so animation/inspection is stable.
- Interoperate with cut sections and color-preserving multi-object returns.
- Include at least one API example in `examples/api/*`.

## Status and log
- Requested during development of `examples/robot_hand_2.forge.js`.
- Motivation: debugging internals and presenting mechanics requires reliable exploded assemblies.
- Next step: design exact API signature and implementation location (`lib` helper vs core scene transform pass).

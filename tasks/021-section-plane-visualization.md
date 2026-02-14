# Section Plane Visualization Strategy

## Problem Definition
Current sectioning in `robot_hand_2` needs visible plane context, but manually modeled guide meshes are noisy and not a proper engine-level solution.

## Description
Design a standard way to visualize active section planes with transparency and clear orientation cues, without injecting custom geometry into user models.

## Requirements
- Provide a built-in section plane visual mode in the viewer/runtime.
- Support translucent fills and optional border/axis indicators.
- Keep guides decoupled from user geometry (no CSG/model pollution).
- Work with multiple active cut planes simultaneously.
- Make visibility and style toggles user-controllable in the View Panel.
- Ensure section visuals track param updates in real time.
- Document the behavior in API docs and add one focused example in `examples/api/*`.

## Status and log
- 2026-02-14: Requested after testing `examples/robot_hand_2.forge.js`.
- Temporary manual guide meshes were removed.
- Next: propose renderer-side implementation options and pick one.

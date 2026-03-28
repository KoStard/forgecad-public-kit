# Task: Gear Reducer

Build a simple single-stage spur gear reducer with a 3:1 ratio.

## Requirements

Return an **assembly** with:
- A part named `Pinion` (small driving gear)
- A part named `Gear` (large driven gear)
- A frame or part named `Base` (mounting frame)
- A revolute joint named `drive` connecting Base to Pinion
- A revolute joint named `output` connecting Base to Gear
- A gear coupling so that when the Pinion turns, the Gear turns at 1/3 speed

## Functional expectations

- **Gear ratio**: When the drive joint is at 90 deg, the output should be at approximately -30 deg (3:1 reduction, reversed direction for external mesh)
- **Both gears rotate around parallel axes** (both Z-axis joints)
- **Gears are close together** — their centers should be separated by approximately the sum of their pitch radii
- **No collision** between gears at rest
- **Both gears have real geometry** (not empty shapes)
- **Base/frame exists** as a mounting reference

## Hints

You can use `lib.gearPair()` to create matched gear geometry and `addGearCoupling()` for the kinematic link. Or build the gears manually — the harness only tests function, not implementation.

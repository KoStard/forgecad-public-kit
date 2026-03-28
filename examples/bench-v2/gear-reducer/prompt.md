# Task: 3:1 Gear Reducer

Build a single-stage spur gear reducer with a 3:1 ratio.

## Requirements

Return an **Assembly** with:
- A part named `Pinion` (small driving gear)
- A part named `Gear` (large driven gear)
- A part named `Base` (mounting frame)
- A revolute joint named `drive` connecting Base to Pinion
- A revolute joint named `output` connecting Base to Gear
- A gear coupling so that when the Pinion turns, the Gear turns at 1/3 speed

## Functional expectations
- **Gear ratio**: When drive=90 degrees, output should be approximately -30 degrees
- **Gears must mesh**: their centers should be separated by the sum of their pitch radii
- **Both gears must be round** (disc-shaped, not boxes)
- The Gear should be visibly larger than the Pinion

## Hint
`lib.gearPair()` creates matched gear geometry. The returned shapes are centered at origin (pinion) and at the correct center distance (gear). When using assemblies, be careful not to double-position parts — if gearPair pre-positions the gear, don't also translate it via the joint frame.

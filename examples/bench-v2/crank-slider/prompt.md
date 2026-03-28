# Task: Crank-Slider Mechanism

Build a crank-slider mechanism that converts rotation into linear reciprocating motion.

## Requirements

Return an **Assembly** with:
- A part named `Base` (the fixed frame)
- A part named `Crank` (the rotating disc/arm)
- A part named `Rod` (the connecting rod)
- A part named `Slider` (the reciprocating piece)
- A revolute joint named `drive` connecting Base to Crank
- A revolute joint named `wrist` connecting Crank to Rod
- A prismatic joint named `slide` connecting Base to Slider

## Functional expectations
- **Crank radius**: approximately 20mm
- **Rod length**: approximately 60mm (longer than crank radius)
- When `drive` rotates 360 degrees, the Slider should reciprocate along one axis
- The Slider's travel distance should be approximately 2x the crank radius (40mm)
- All parts should be physically connected (no ghost joints)

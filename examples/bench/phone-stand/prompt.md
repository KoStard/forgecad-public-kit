# Task: Phone Stand

Build a simple phone stand that holds a phone at an angle.

## Requirements

Return an **assembly** with:
- A part named `Base` (the flat bottom that sits on a table)
- A part named `Support` (the angled piece that holds the phone)
- A **fixed** joint named `mount` connecting Support to Base

## Functional expectations

- **Stability**: The Base must sit flat — its bounding box minimum Z should be at or near 0
- **Viewing angle**: The Support should be angled (not vertical, not horizontal). Its bounding box should extend higher in Z than the Base.
- **Footprint**: The Base should be wider than tall (landscape orientation for stability)
- **Size**: The overall assembly should fit within 200x200x200mm
- **Support height**: The Support should reach at least 60mm above the Base top, to hold a phone
- **Both parts have real geometry** (volume > 500mm cubed each)

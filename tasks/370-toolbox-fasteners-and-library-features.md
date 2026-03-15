# Toolbox Fasteners And Library Features
## Problem Definition
A strong CAD system needs more than primitives and booleans. Developers should be able to drop in common fasteners, profiles, and reusable hardware-oriented helpers without bypassing the compiler.

## Description
Build a first library/toolbox lane on top of the compiler-owned part feature stack.

Primary dependencies:

- task 300

Primary files:

- new library/toolbox modules
- example parts
- docs for supported catalog scope

## Requirements
- Add a defended first library family such as:
  - bolts, nuts, washers, and clearance-hole pairings
  - or common profiles/brackets if that proves cleaner
- Keep the implementation compiler-owned: library features should compose supported semantic part features instead of reaching into backend APIs directly.
- Add at least one example assembly or part that shows the library pieces used in a normal mechanical workflow.
- Keep the initial catalog intentionally small and documented rather than pretending to support every standard.
- Keep the components efficient and avoid triangles count explosions.

## Status and log
- 2026-03-13: Blocked on task 300.
- 2026-03-13: Not started.

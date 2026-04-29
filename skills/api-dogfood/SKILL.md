---
name: api-dogfood
description: Build a ForgeCAD model while actively hunting for API friction — missing helpers, awkward patterns, bad defaults, verbose boilerplate. Use when asked to dogfood, stress-test the API, or build a model with the goal of improving ForgeCAD.
forgecad-public: true
---

# API Dogfood: Build to Find Friction

Build a real ForgeCAD model **and** systematically surface every point where the API fights the developer. The model is the vehicle; the real output is a prioritized list of API improvements with concrete proposals.

## Mindset

You are Steve Jobs reviewing a developer API. Every extra line of code is a failure of the framework. Every time you think "I wish I could just..." — that's a finding. The API should make the obvious thing trivial, the common thing easy, and the hard thing possible.

## Workflow

### 1. Pick or receive a model to build

Choose something that exercises real geometry: curves, patterns, assemblies, boolean operations, fillets, parametric dimensions. Simple boxes won't surface friction. Good candidates:
- Mechanical parts (gears, hinges, enclosures)
- Organic shapes (vases, sculptures, ergonomic grips)
- Multi-part assemblies (furniture, toys, mechanisms)
- Patterns and repetition (tiles, lattices, arrays)

### 2. Load the ForgeCAD skill

Invoke the `forgecad` skill to get the current API docs. Read the Core API reference thoroughly — you need to know what exists before you can identify what's missing.

### 3. Build bottom-up, journal friction as you go

Follow the same decomposition strategy as make-a-model (smallest piece first, verify, compose upward). But at every step, maintain a **friction journal** — a running list of issues encountered.

For each friction point, capture:
- **What you were trying to do** (intent)
- **What you had to write** (actual code)
- **What you wish you could write** (dream API)
- **Category** (see below)

### 4. Friction categories

| Category | Description | Example |
|----------|-------------|---------|
| **Missing primitive** | A common shape/op that doesn't exist | No `torus()`, no `wedge()` |
| **Verbose boilerplate** | Too many lines for a simple intent | 5 lines to create a circular pattern |
| **Bad defaults** | Default behavior is rarely what you want | `center` defaulting to `false` when `true` is almost always better |
| **Missing transform** | A transform that should be chainable but isn't | No `.mirrorX()` shorthand |
| **Naming friction** | Name doesn't match mental model | Function named differently than what you'd search for |
| **Composition gap** | Hard to combine things that should compose naturally | Can't easily array along a curve |
| **Error unhelpfulness** | Error message doesn't help you fix the problem | "Invalid geometry" with no indication of where or why |
| **Discovery gap** | Feature exists but you couldn't find it | Had to read source to discover a useful helper |
| **Parameter awkwardness** | Argument order or types feel wrong | Height before radius when you think radius-first |

### 5. Validate the model

Run `forgecad run <file>` after each piece. Note any errors — confusing error messages are themselves friction findings.

### 6. Write the friction report

After the model is complete, produce a structured report. Place it alongside the model file as `<model-name>.friction.md`.

```markdown
# API Friction Report: <Model Name>

## Summary
- Model: <what was built>
- Lines of code: <count>
- Friction points found: <count>
- Estimated lines with dream API: <count>

## Critical (API should not ship without fixing)
### <Title>
- **Intent**: What I wanted to do
- **Actual**: ```js\n<what I had to write>\n```
- **Dream**: ```js\n<what I wish I could write>\n```
- **Proposed fix**: Concrete API change

## High (Common operation, significant friction)
...

## Medium (Nice to have)
...

## Low (Paper cuts)
...
```

### 7. Propose API changes

For the top 3 friction points, go beyond the report:
- Draft the actual API signature
- Show how it would simplify the model code
- Check if it conflicts with existing API surface
- Estimate implementation complexity (trivial / moderate / significant)

If a fix is trivial (< 20 lines, no breaking changes), offer to implement it right now.

## What makes a great friction finding

- **Specific**: "I needed 4 lines to round-robin colors on an array" not "coloring is hard"
- **Comparative**: Show the actual code vs. the dream code side by side
- **Prioritized**: Based on how often other users would hit this, not just your annoyance
- **Actionable**: Includes a concrete proposal, not just a complaint

## Anti-patterns to avoid

- Don't invent API surface nobody would use just because you can imagine it
- Don't confuse "I didn't know about this feature" with "this feature is missing" — check the docs first
- Don't propose breaking changes for minor ergonomic gains
- Don't let the friction hunt derail the model — build the model first, journal as you go
- Don't propose thin wrappers that add no real value (`.moveRight(x)` vs `.translate([x,0,0])`)

## File Placement

Place model files in the ForgeCAD project under:
```
docs/temporary/dogfood/YYYY-MM-DD/<model-name>.forge.js
docs/temporary/dogfood/YYYY-MM-DD/<model-name>.friction.md
```

## Tips

- The most valuable friction is the kind you almost didn't notice — the "oh I always have to do this" patterns
- Compare with other CAD APIs (OpenSCAD, CadQuery, JSCAD) — what do they make easy that we don't?
- Pay special attention to the first 5 minutes of building — onboarding friction compounds
- If you find yourself copy-pasting code between parts, that's a composition gap

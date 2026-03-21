# Parameterized Groups — Auto-detect & Exploit Rigid Subgraphs

## Goal

Automatically detect rigid or semi-rigid subgraphs in the constraint system and collapse them into parameterized groups, reducing solver variables dramatically.

**Motivating example**: `sk.rect()` creates 4 points (8 DOF) + perpendicular/parallel constraints. A parameterized rect group needs only 5 DOF (x, y, θ, w, h) — or 3 DOF if dimensions are constrained. For 16 rectangles: 128 → 80 → 48 variables.

## Two-layer design

### Layer 1: Automatic detection (Rust presolve)
The solver analyzes the constraint graph and detects subgraphs that can be collapsed:
- Fully rigid (internal DOF = 0) → standard group (3 DOF: x, y, θ)
- Semi-rigid (internal DOF = k) → parameterized group (3 + k DOF)

No API change needed. User writes whatever constraints they want, solver exploits the structure.

### Layer 2: User API (TS builder)
Optional explicit API for when the user knows the structure:
```js
// Current: rigid group, dimensions baked in
const r = sk.groupRect({ width: 100, height: 50 });

// New: parameterized group, dimensions are solver variables
const r = sk.paramRect();  // width + height are free
sk.length(r.top, 100);     // constrain width via normal API
// height remains a solver variable (5 DOF total)
```

The user API would create the same internal representation that auto-detection produces.

## Architecture

### Current group model
```
SketchGroup {
  x, y, θ           — solver variables (frame DOF)
  points: [{lx, ly}] — FIXED local coordinates
}

point_world = rotate(θ) * [lx, ly] + [x, y]
```

### Proposed parameterized group model
```
ParameterizedGroup {
  x, y, θ              — solver variables (frame DOF)
  params: [p0, p1, …]  — solver variables (shape DOF)
  points: [{lx_expr, ly_expr}]  — local coords as functions of params
}

// For a rectangle:
params = [w, h]
points = [(0,0), (w,0), (w,h), (0,h)]
point_world = rotate(θ) * [lx(params), ly(params)] + [x, y]
```

### Key design questions

1. **How to express `lx_expr`?** Options:
   - Simple: each local coord is either a constant or a direct reference to one param
   - General: local coords are linear combinations of params (covers more patterns)
   - Most general: arbitrary expressions (overkill?)

2. **How does the Jacobian work?** For FD, we perturb params instead of individual point coords. For analytic: `∂point_world/∂param = rotate(θ) * ∂[lx,ly]/∂param`.

3. **What patterns can auto-detection find?**
   - Rectangles (4 points, perpendicular corners)
   - Regular polygons (equal sides + equal angles)
   - Any polygon with all angles constrained (angles lock topology, sides may vary)
   - Symmetric structures

4. **Variable substitution in constraints**: When a subgraph is collapsed, constraints referencing its points must be rewritten to use group frame + params. E.g., `length(line_AB)` becomes a function of the rect's `w` param.

## Algorithm sketch for auto-detection

```
1. Build constraint hypergraph: nodes = entities, edges = constraints
2. Find connected components
3. For each component, compute internal DOF:
   - Count entity DOF (2 per point, 1 per circle radius, etc.)
   - Subtract constraint DOF (each constraint removes rows)
   - Subtract 3 (frame DOF: x, y, θ)
   - Result = internal DOF = number of shape params needed
4. If internal DOF is small (say ≤ 4), profitable to collapse:
   - Fix the frame (e.g., anchor one point + angle)
   - Solve for internal geometry with remaining DOF
   - Express local coords as functions of remaining params
5. Replace original entities + constraints with the parameterized group
6. Rewrite external constraints to reference group frame + params
```

Step 4 is the tricky part — we need to identify which DOF are "shape" vs "frame". One approach: fix the centroid at origin and one axis direction, then the remaining free variables are the shape params.

## Incremental approach

### Phase 1: Rectangle-specific optimization
Detect the rectangle pattern specifically (4 points, 4 lines, perpendicular constraints). This is the most common case and easiest to implement. No general algorithm needed.

**Detection**: In presolve, scan for sets of 4 lines forming a cycle where all adjacent pairs have perpendicular constraints. Check which dimensions (if any) are constrained.

**Collapse**: Replace with a rect group: frame (x, y, θ) + optional (w, h) params.

### Phase 2: General rigid subgraph detection
Extend to arbitrary polygons and constraint patterns using the DOF analysis algorithm above.

### Phase 3: User API
Expose `sk.paramRect()`, `sk.paramPolygon()`, etc. that create parameterized groups directly.

## Expected impact

| Scenario | Current vars | With param groups | Speedup |
|----------|-------------|-------------------|---------|
| 16 rects, all dimensioned | 128 | 48 (3 DOF each) | ~7× |
| 16 rects, no dimensions | 128 | 80 (5 DOF each) | ~2.5× |
| Spectrometer (triangles) | 60 | ~30 | ~2× |
| Mixed sketch | varies | varies | depends |

The speedup is super-linear because the FD Jacobian is O(n²) in variable count (n columns × n-dependent rows).

## Files likely affected

| File | Change |
|------|--------|
| `solver/src/types.rs` | `ParameterizedGroup` struct, or extend `SketchGroup` with params |
| `solver/src/solver/mod.rs` | Detection algorithm in presolve |
| `solver/src/solver/lm.rs` | `build_variables` to handle parameterized groups |
| `src/forge/sketch/constraints/builder.ts` | `paramRect()` API |
| `src/forge/sketch/constraints/types.ts` | TS types for parameterized groups |

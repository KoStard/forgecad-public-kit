# API Friction Report: Cam Actuator

## Summary
- Model: Cam actuator with hub, curved banana arm, bolt circle, central bore, inner slot cutout
- Lines of code: 84 (ForgeCAD) vs ~45 (build123d) — 1.87x ratio
- Friction points found: 6
- Estimated lines with dream API: ~50

## Critical (API should not ship without fixing)

### 1. `circularLayout()` and `polygonVertices()` exist but aren't exposed to scripts

- **Intent**: Place 6 bolt holes on a bolt circle at radius 32.5, starting at 90 degrees
- **Actual**:
  ```js
  // circularLayout() is defined in src/forge/sketch/layout.ts
  // and exported from forge-public-api.ts, but NOT registered
  // in runner.ts sandbox globals — so scripts can't use it.
  // Workaround: position seed manually
  const boltHole = circle2d(11).translate(0, 32.5);
  const boltHoles = circularPattern2d(boltHole, 6);
  ```
- **Dream**:
  ```js
  const boltHoles = circularLayout(6, 32.5, { startDeg: 90 })
    .map(({ x, y }) => circle2d(11).translate(x, y));
  ```
- **Proposed fix**: Add `circularLayout` and `polygonVertices` to the sandbox globals in `runner.ts`. They're already exported — just missing from the runtime exposure. Trivial fix (~2 lines).

### 2. `circularPattern2d()` has no `startDeg` option

- **Intent**: Bolt pattern starting at 90 degrees
- **Actual**: Must rotate the seed shape to the desired start angle before patterning
- **Dream**:
  ```js
  circularPattern2d(circle2d(11).translate(32.5, 0), 6, { startDeg: 90 })
  ```
- **Proposed fix**: Accept an options object like `circularPattern` does for 3D. Moderate (~20 lines).

## High (Common operation, significant friction)

### 3. No selective 2D vertex fillet after boolean union

- **Intent**: Fillet only where the arm meets the hub (R5), not all convex corners
- **Actual**:
  ```js
  // offset(-r).offset(+r) rounds ALL convex corners — banana tips too
  const roundedProfile = solidProfile.offset(-filletR).offset(filletR);
  ```
- **Dream** (build123d approach):
  ```js
  // Filter vertices by position range, then fillet just those
  solidProfile.filletVertices({ xMin: 40, xMax: 48 }, 5)
  ```
- **Impact**: build123d's `filter_by_position` + `fillet` on sketch vertices is a killer feature for mechanical parts. ForgeCAD has `filletCorners()` but only for explicit polygon point lists — not for post-boolean profiles.
- **Proposed fix**: Add `.filletAt(position, radius)` or `.filletNear([x, y], radius, tolerance)` that finds the nearest vertex on the contour and rounds it. Significant effort.

### 4. Arc endpoint computation requires manual trig

- **Intent**: Create a stroked arc from -37 to +37 degrees at radius 135 centered at (-21.6, 0)
- **Actual**:
  ```js
  const DEG = Math.PI / 180;
  const arcStartX = arcCenterX + pitchR * Math.cos(startAngle * DEG);
  const arcStartY = pitchR * Math.sin(startAngle * DEG);
  const arcEndX = arcCenterX + pitchR * Math.cos(endAngle * DEG);
  const arcEndY = pitchR * Math.sin(endAngle * DEG);

  path().moveTo(arcStartX, arcStartY).arcTo(arcEndX, arcEndY, pitchR, false)
  ```
- **Dream**:
  ```js
  // Arc by center, radius, and angle range — no trig needed
  arcPath(arcCenter, pitchR, { from: -37, to: 37 })
  // or on PathBuilder:
  path().arc(center, radius, fromDeg, toDeg)
  ```
- **Impact**: Violates the blueprint-first "no trig tax" principle. `arcTo` takes endpoints, so you must compute them from angles. This is the most common arc construction in mechanical CAD.
- **Proposed fix**: Add `arc(cx, cy, radius, startDeg, endDeg)` to PathBuilder that emits the arc segment without requiring endpoint math. Moderate (~30 lines).

## Medium (Nice to have)

### 5. `rect()` has no alignment/anchor option

- **Intent**: Rectangle with left edge at X=0, centered on Y
- **Actual**:
  ```js
  rect(100, armWidth, true).translate(50, 0)  // center=true then shift half-width
  ```
- **Dream** (build123d approach):
  ```js
  rect(100, armWidth, { anchor: 'left' })
  // or
  rect(100, armWidth).anchor('left')
  ```
- **Impact**: Minor — the `center + translate` pattern works but adds cognitive load.

### 6. No `slotArc()` / curved slot primitive

- **Intent**: Create an arc-shaped slot (common mechanical feature)
- **Actual**:
  ```js
  // Compute arc endpoints (4 lines of trig), then stroke
  path().moveTo(arcStartX, arcStartY)
    .arcTo(arcEndX, arcEndY, pitchR, false)
    .stroke(armWidth, 'Round');
  ```
- **Dream**:
  ```js
  slotArc(center, pitchR, -37, 74, armWidth)
  // center, radius, startAngle, sweepAngle, width
  ```
- **Impact**: The `path().arcTo().stroke()` pattern is functional but requires arc endpoint math. A dedicated `slotArc()` would eliminate the trig entirely. build123d has this as a first-class primitive.
- **Note**: This combines findings #4 and #6 — if `arc()` on PathBuilder existed, the trig would be eliminated even without a dedicated `slotArc`.

## Top 3 Proposed API Changes

### 1. Expose `circularLayout` + `polygonVertices` in runner sandbox (Trivial)

```diff
// src/forge/runner.ts
+ circularLayout,
+ polygonVertices,
```

No new code needed — just register the already-exported functions. Immediately enables trig-free circular positioning for both 2D and 3D workflows.

### 2. Add `arc(cx, cy, r, startDeg, endDeg)` to PathBuilder (Moderate)

```ts
// On PathBuilder
arc(cx: number, cy: number, radius: number, startDeg: number, endDeg: number): this {
  const DEG = Math.PI / 180;
  const sx = cx + radius * Math.cos(startDeg * DEG);
  const sy = cy + radius * Math.sin(startDeg * DEG);
  const ex = cx + radius * Math.cos(endDeg * DEG);
  const ey = cy + radius * Math.sin(endDeg * DEG);
  if (!this.segs.length) this.moveTo(sx, sy);
  return this.arcTo(ex, ey, radius, endDeg < startDeg);
}
```

Eliminates the trig tax for any arc-based geometry. Combined with `stroke()`, this also gives `slotArc` for free:
```js
path().arc(cx, cy, 135, -37, 37).stroke(40, 'Round')  // curved slot!
```

### 3. Add `startDeg` to `circularPattern2d` (Trivial)

```ts
circularPattern2d(sketch: Sketch, count: number, opts?: {
  centerX?: number, centerY?: number, startDeg?: number
}): Sketch
```

Matches the options-bag pattern already used by `circularPattern` (3D) and `circularLayout`.

# Core API

> **Auto-generated** from `src/forge/forge-public-api.ts`. Do not edit by hand — run `npm run gen:docs` to regenerate.

3D primitives, boolean operations, transforms, patterns, imports, and parameters.

## Functions

### 3D Primitives

Create basic 3D shapes.

#### `sphere()`

```ts
sphere(radius: number): SdfShape
```

#### `box()`

```ts
box(x: number, y: number, z: number): SdfShape
```

#### `cylinder()`

```ts
cylinder(height: number, radius: number): SdfShape
```

#### `box()`

```ts
box$1(x: number, y: number, z: number, center?: boolean): TrackedShape
```

Create a rectangular box with named faces and edges. When center is false (default), one corner sits at the origin. Returns a TrackedShape with faces (top, bottom, side-left, side-right, side-top, side-bottom) and edges (vert-bl, vert-br, vert-tr, vert-tl, etc.).

#### `cylinder()`

```ts
cylinder$1(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): TrackedShape
```

Create a cylinder or cone with named faces and edges. When radiusTop differs from radius, creates a tapered cone. Use segments for regular prisms. Returns a TrackedShape with faces (top, bottom, side) and edges (top-rim, bottom-rim).

#### `sphere()`

```ts
sphere$1(radius: number, segments?: number): Shape
```

Create a sphere centered at the origin. Use segments for lower-poly approximations.

### Boolean Operations

Combine shapes using set operations.

#### `union()`

```ts
union(...shapes: (_ShapeOperand | _ShapeOperand[])[]): Shape
```

Combine shapes into a single solid (additive boolean). Accepts individual shapes or arrays.

#### `difference()`

```ts
difference(...shapes: (_ShapeOperand | _ShapeOperand[])[]): Shape
```

Subtract shapes from a base shape. The first shape is the base; all subsequent shapes are subtracted.

#### `intersection()`

```ts
intersection(...shapes: (_ShapeOperand | _ShapeOperand[])[]): Shape
```

Keep only the overlapping volume of the input shapes (intersection boolean).

### Patterns & Topology

Repeat, mirror, fillet, and chamfer geometry.

#### `filletEdgeSegment()`

```ts
filletEdgeSegment(shape: ShapeArg, segment: EdgeSegment, radius: number, segments?: number): Shape
```

Apply a fillet (rounded edge) to a mesh-selected edge. Works on any straight edge of any shape — not limited to tracked box edges. The edge must have been obtained from selectEdge() / selectEdges().

#### `chamferEdgeSegment()`

```ts
chamferEdgeSegment(shape: ShapeArg, segment: EdgeSegment, size: number): Shape
```

Apply a chamfer (beveled edge) to a mesh-selected edge. Works on any straight edge of any shape — not limited to tracked box edges.

#### `selectEdges()`

```ts
selectEdges(shape: Shape | TrackedShape, query?: EdgeQuery): EdgeSegment[]
```

Select all edges from a shape that match the given query. Extracts sharp edges from the mesh (dihedral angle > 1°), applies filters, and returns the matching EdgeSegment array.

#### `selectEdge()`

```ts
selectEdge(shape: Shape | TrackedShape, query?: EdgeQuery): EdgeSegment
```

Select the single best-matching edge from a shape. When `near` is specified, returns the closest matching edge. Otherwise returns the first matching edge (by mesh order). Throws if no edges match.

#### `coalesceEdges()`

```ts
coalesceEdges(segments: EdgeSegment[], tolerance?: number): EdgeSegment[]
```

Coalesce collinear edge segments into longer logical edges. Multiple short mesh segments along the same line (e.g. from tessellation) are merged into a single EdgeSegment spanning the full extent. The `tolerance` controls how far endpoints can deviate from collinearity.

#### `arcBridgeBetweenRects()`

```ts
arcBridgeBetweenRects(rectA: RectAreaArg, rectB: RectAreaArg, segments?: number): Shape
```

Build an arc bridge between two rectangular areas.

#### `filletEdge()`

```ts
filletEdge(shape: ShapeArg$2, edge: EdgeRef, radius: number, quadrant?: [ number, number ], segments?: number): Shape
```

Round a named edge of a shape with a circular fillet of the given radius. Requires a compile-covered target.

#### `chamferEdge()`

```ts
chamferEdge(shape: ShapeArg$2, edge: EdgeRef, size: number, quadrant?: [ number, number ]): Shape
```

Bevel a named edge of a shape with a 45-degree chamfer of the given size. Requires a compile-covered target.

#### `filletCorners()`

```ts
filletCorners(points: PointInput[], corners: FilletCornerSpec[]): Sketch
```

Create a polygon from points with specified corners rounded to arc fillets. Each corner spec identifies a vertex index and radius.

#### `linearPattern()`

```ts
linearPattern(shape: ShapeArg$3, count: number, dx: number, dy: number, dz?: number): Shape
```

Repeat a shape in a linear pattern along a direction vector and union the copies.

#### `circularPattern()`

```ts
circularPattern(shape: ShapeArg$3, count: number, centerX?: number, centerY?: number): Shape
```

Repeat a shape in a circular pattern around the Z axis and union the copies.

#### `mirrorCopy()`

```ts
mirrorCopy(shape: ShapeArg$3, normal: [ number, number, number ]): Shape
```

Mirror a shape across a plane defined by its normal and union the mirror with the original.

### Imports & Composition

Import model files and SVG assets from other files.

#### `require()`

```ts
require$1(path: string, paramOverrides?: Record<string, number>): any
```

Import a module with optional ForgeCAD parameter overrides. Returns the module's exports.

#### `importSvgSketch()`

```ts
importSvgSketch(fileName: string, options?: SvgImportOptions): Sketch
```

Parse an SVG file and return it as a Sketch with options for region filtering, scaling, and simplification.

### Parameters

Declare user-adjustable parameters with UI controls.

#### `param()`

```ts
param(name: string, defaultValue: number, opts?: { min?: number; max?: number; step?: number; unit?: string; integer?: boolean; reverse?: boolean; }): number
```

Declare a parameter. Returns the current value (default or overridden). Each call registers the param for UI generation.

#### `boolParam()`

```ts
boolParam(name: string, defaultValue: boolean): boolean
```

Declare a boolean parameter. Returns the current boolean value. Renders as a checkbox in the UI.

### Grouping

Organize multiple shapes into named groups.

#### `group()`

```ts
group(...items: GroupInput[]): ShapeGroup
```

Group multiple shapes/sketches for joint transforms without merging into a single mesh. Unlike union(), colors and individual identities are preserved. Children can be plain shapes, named descriptors ({ name, shape/sketch/group }), or nested groups. The returned ShapeGroup supports all Shape transforms (translate, rotate, etc.).

### Section & Projection

Slice or project 3D shapes to 2D.

#### `intersectWithPlane()`

```ts
intersectWithPlane(shape: Shape, plane: PlaneSpec): Sketch
```

Cross-section: slice a 3D shape with a plane and return the intersection as a 2D Sketch.

#### `projectToPlane()`

```ts
projectToPlane(shape: Shape, plane: PlaneSpec): Sketch
```

Orthographically project a 3D shape onto a plane and return the silhouette as a 2D Sketch.

### Other

#### `composeChain()`

```ts
composeChain(...steps: TransformInput[]): Transform
```

Compose transforms in chain order. Equivalent to Transform.identity().mul(a).mul(b).mul(c)...

#### `portFactory()`

```ts
portFactory(input: PortInput): PortDef
```

#### `torus()`

```ts
torus(majorRadius: number, minorRadius: number): SdfShape
```

#### `capsule()`

```ts
capsule(height: number, radius: number): SdfShape
```

#### `cone()`

```ts
cone(height: number, radius: number): SdfShape
```

#### `smoothUnion()`

```ts
smoothUnion(a: SdfShape, b: SdfShape, options: { radius: number; }): SdfShape
```

#### `smoothDifference()`

```ts
smoothDifference(a: SdfShape, b: SdfShape, options: { radius: number; }): SdfShape
```

#### `smoothIntersection()`

```ts
smoothIntersection(a: SdfShape, b: SdfShape, options: { radius: number; }): SdfShape
```

#### `morph()`

```ts
morph(a: SdfShape, b: SdfShape, t: number): SdfShape
```

#### `gyroid()`

```ts
gyroid(options: TpmsOptions): SdfShape
```

#### `schwarzP()`

```ts
schwarzP(options: TpmsOptions): SdfShape
```

#### `diamond()`

```ts
diamond(options: TpmsOptions): SdfShape
```

#### `fromFunction()`

```ts
fromFunction(fn: (x: number, y: number, z: number) => number, bounds: { min: Vec3$1; max: Vec3$1; }): SdfShape
```

#### `twist()`

```ts
twist(shape: SdfShape, degreesPerUnit: number): SdfShape
```

#### `bend()`

```ts
bend(shape: SdfShape, radius: number): SdfShape
```

#### `repeat()`

```ts
repeat(shape: SdfShape, spacing: Vec3$1, count?: Vec3$1): SdfShape
```

#### `fillet()`

```ts
fillet(shape: ShapeArg$1, radius: number, edges?: EdgeSelector, segments?: number): Shape
```

Apply fillets (rounded edges) to one or more edges of a shape. Works on both straight and curved edges. Supports OCCT and Manifold backends. When using OCCT, all edges are filleted in a single kernel operation for best quality. When using Manifold, edges are filleted sequentially. - EdgeSegment: a single edge from selectEdge() - EdgeSegment[]: multiple edges from selectEdges() - EdgeQuery: inline query (same options as selectEdges) - undefined: all sharp edges on the shape // Fillet all edges fillet(myShape, 2) // Fillet edges at the top fillet(myShape, 1.5, { atZ: 20, convex: true }) // Fillet specific edges const edges = selectEdges(myShape, { parallel: [0, 0, 1] }) fillet(myShape, 3, edges)

#### `chamfer()`

```ts
chamfer(shape: ShapeArg$1, size: number, edges?: EdgeSelector): Shape
```

Apply chamfers (beveled edges) to one or more edges of a shape. Works on both straight and curved edges. Supports OCCT and Manifold backends. // Chamfer all edges chamfer(myShape, 1) // Chamfer vertical edges only chamfer(myShape, 2, { parallel: [0, 0, 1] })

#### `draft()`

```ts
draft(shape: ShapeArg$1, angleDeg: number, pullDirection?: [ number, number, number ], neutralPlaneOffset?: number): Shape
```

Apply a draft angle (taper) to all faces of a solid for mold extraction. Draft angle is a manufacturing feature that adds taper to the vertical faces of a solid so that it can be extracted from a mold. The neutral plane is where the draft angle is zero — faces above and below are tapered symmetrically. Requires the OCCT backend. Throws on Manifold. // Add 3° draft to a box for injection molding draft(myBox, 3) // Draft with custom pull direction and neutral plane draft(myShape, 2, [0, 0, 1], 10)

#### `offsetSolid()`

```ts
offsetSolid(shape: ShapeArg$1, thickness: number): Shape
```

Uniformly offset all surfaces of a solid inward or outward by a thickness value. Unlike shell(), which hollows a solid, offsetSolid() produces a new solid whose surfaces are all shifted by the given thickness. Positive = outward, negative = inward. Requires the OCCT backend. Throws on Manifold. // Grow a box outward by 1mm on all sides offsetSolid(myBox, 1) // Shrink a shape inward by 0.5mm offsetSolid(myShape, -0.5)

#### `loftAlongSpine()`

```ts
loftAlongSpine(profiles: Sketch[], spine: Curve3D | Vec3$3[], tValues: number[], options?: LoftAlongSpineOptions): Shape
```

Loft between multiple profiles positioned along an arbitrary 3D spine curve. Unlike loft() which only supports Z heights, loftAlongSpine() places each profile at a position along a 3D spine, oriented perpendicular to the spine tangent. This enables lofting along curved paths — e.g., a wing root-to-tip transition that follows a swept-back leading edge. The tValues array specifies where each profile sits along the spine (0 = start, 1 = end). Must have the same length as profiles and be in [0, 1]. Internally uses variableSweep infrastructure with SDF interpolation. Performance note: uses level-set meshing, heavier than simple loft().

#### `variableSweep()`

```ts
variableSweep(spine: Curve3D | Vec3$3[], sections: VariableSweepSection[], options?: VariableSweepOptions): Shape
```

Sweep a variable cross-section along a 3D spine curve. Unlike sweep(), which uses a single constant profile, variableSweep() interpolates between multiple profiles at different stations along the spine. This enables organic shapes like tapering tubes, bone-like structures, and sculptural forms. Each section specifies a t parameter (0 = start, 1 = end of spine) and a 2D profile sketch. The SDF-based level-set mesher smoothly blends between profiles at intermediate positions. Performance note: like sweep(), this uses level-set meshing internally.

#### `loadFont()`

```ts
loadFont(source: string | ArrayBuffer, cacheKey?: string): opentype$1.Font
```

Load and cache a font. - A built-in font name: `'sans-serif'` or `'inter'` (works everywhere) - A file path to a TTF/OTF/WOFF file (CLI/Node only) - An ArrayBuffer of font data (works everywhere)

#### `hermiteTransition()`

```ts
hermiteTransition(a: EdgeEndpoint, b: EdgeEndpoint): HermiteCurve3D
```

Create a Hermite transition curve between two edge endpoints. The curve starts at `a.point` tangent to `a.tangent` and ends at `b.point` tangent to `b.tangent`, with smooth G1-continuous interpolation. Weight controls: - weight = 1.0 (default): balanced transition - weight > 1.0: curve follows this edge's direction longer before turning - weight < 1.0: curve turns sooner, shorter tangent influence

#### `hermiteTransitionG2()`

```ts
hermiteTransitionG2(a: QuinticHermiteCurveEndpoint, b: QuinticHermiteCurveEndpoint): QuinticHermiteCurve3D
```

Create a quintic Hermite transition curve between two edge endpoints (G2 continuity). The curve starts at `a.point` tangent to `a.tangent` with curvature `a.curvature`, and ends at `b.point` tangent to `b.tangent` with curvature `b.curvature`, with smooth G2-continuous interpolation matching position, tangent, and curvature.

#### `linearPattern2d()`

```ts
linearPattern2d(sketch: Sketch, count: number, dx: number, dy?: number): Sketch
```

Repeat a sketch in a linear pattern

#### `circularPattern2d()`

```ts
circularPattern2d(sketch: Sketch, count: number, centerX?: number, centerY?: number): Sketch
```

Repeat a sketch in a circular pattern around a center point

#### `surfacePatch()`

```ts
surfacePatch(curves: { ... }, options?: SurfacePatchOptions): Shape
```

Create a smooth surface patch from 4 boundary curves (Coons patch). The four curves form the boundary of a quadrilateral patch: - bottom: u=0..1 at v=0 (from corner00 to corner10) - top: u=0..1 at v=1 (from corner01 to corner11) - left: v=0..1 at u=0 (from corner00 to corner01) - right: v=0..1 at u=1 (from corner10 to corner11) The interior is filled using bilinear Coons patch interpolation: P(u,v) = Lc(u,v) + Ld(u,v) - B(u,v) The result is a thin solid created by offsetting the surface mesh along its normals by the specified thickness. Note: curves should meet at corners. Small gaps are tolerated.

#### `transitionCurve()`

```ts
transitionCurve(edgeA: TransitionEdge, edgeB: TransitionEdge, options?: TransitionCurveOptions): HermiteCurve3D
```

Create a smooth transition curve between two edges. Returns a `HermiteCurve3D` that starts at `edgeA.point` tangent to `edgeA.tangent` and ends at `edgeB.point` tangent to `edgeB.tangent`. The curve maintains G1 continuity (matching tangent direction) at both endpoints. Weight parameters control the shape of the transition. ```js // Connect two edges with a balanced transition const curve = transitionCurve( { point: [0, 0, 0], tangent: [1, 0, 0] }, { point: [10, 5, 0], tangent: [1, 0, 0] }, ); // Weighted: curve hugs edge A longer const weighted = transitionCurve( { point: [0, 0, 0], tangent: [1, 0, 0] }, { point: [10, 5, 0], tangent: [1, 0, 0] }, { weightA: 2.0, weightB: 0.5 }, ); ```

#### `transitionSurface()`

```ts
transitionSurface(edgeA: TransitionEdge, edgeB: TransitionEdge, options?: TransitionSurfaceOptions): Shape
```

Create a solid transition surface between two edges by sweeping a profile along a Hermite transition curve. This produces a watertight solid that smoothly connects the two edges. Works with both Manifold and OCCT backends. ```js // Circular tube connecting two edges const tube = transitionSurface( { point: [0, 0, 0], tangent: [1, 0, 0] }, { point: [10, 5, 3], tangent: [0, 1, 0] }, { radius: 0.5 }, ); // Custom profile with weights const custom = transitionSurface( { point: [0, 0, 0], tangent: [1, 0, 0] }, { point: [10, 5, 3], tangent: [0, 1, 0] }, { profile: mySketch, weightA: 1.5, weightB: 0.8 }, ); ```

#### `transitionCurveFromPoints()`

```ts
transitionCurveFromPoints(startPoint: Vec3$6, startTangent: Vec3$6, endPoint: Vec3$6, endTangent: Vec3$6, options?: TransitionCurveOptions): HermiteCurve3D
```

Convenience: create a transition curve from raw coordinate data. Useful when you have endpoints and directions as plain arrays without constructing TransitionEdge objects.

#### `pickEdge()`

```ts
pickEdge(edge: EdgeRef, options?: EdgePickOptions): TransitionEdge
```

Pick a connection point from an EdgeRef (tracked topology edge). EdgeRef has `start` and `end` positions. The tangent is inferred from the edge direction. ```js const box1 = rect(10, 10).extrude(10); const topEdge = box1.edge('top-front'); // Connect from the start of the top-front edge, tangent along the edge const edgeA = pickEdge(topEdge, { end: 'start' }); // Connect from the end, with flipped tangent const edgeB = pickEdge(topEdge, { end: 'end', flip: true }); ```

#### `pickEdgeSegment()`

```ts
pickEdgeSegment(edge: EdgeSegment, options?: EdgePickOptions): TransitionEdge
```

Pick a connection point from an EdgeSegment (from selectEdge/selectEdges). EdgeSegment has richer data including surface normals on both sides, enabling 'outward' tangent mode for transitions that leave the surface. ```js const myBox = box(20, 20, 20); const topEdge = selectEdge(myBox, { atZ: 20, parallel: [1, 0, 0] }); // Connect from edge start, tangent along the edge direction const edgeA = pickEdgeSegment(topEdge, { end: 'start' }); // Connect from midpoint, tangent pointing outward (away from surface) const edgeB = pickEdgeSegment(topEdge, { end: 'mid', tangentMode: 'outward' }); ```

#### `connectEdges()`

```ts
connectEdges(edgeA: EdgeSegment, edgeB: EdgeSegment, options?: ConnectEdgesOptions): Shape
```

#### `spec()`

```ts
spec(name: string, checkFn: (...args: any[]) => void): Spec
```

Create a named spec — a reusable bundle of verification checks. ```js const fitSpec = spec("Fits enclosure", (shape) => { verify.lessThan("Width",  shape.boundingBox().max[0] - shape.boundingBox().min[0], 200); verify.notEmpty("Has geometry", shape); }); fitSpec.check(myShape);   // grouped as "Fits enclosure" in the Checks panel fitSpec.check(otherShape); // can be reused on multiple shapes ``` calls `verify.*` methods. Any verify calls made inside this function are tagged with the spec name for grouped display.

#### `faceProfile()`

```ts
faceProfile(shape: Shape | TrackedShape, face: FaceSelector): Sketch
```

#### `torus()`

```ts
torus$1(majorRadius: number, minorRadius: number, segments?: number): Shape
```

Create a torus (donut shape) centered at the origin, lying in the XY plane.

#### `importMesh()`

```ts
importMesh(fileName: string, options?: { scale?: number; center?: boolean; }): Shape
```

Import an external mesh file (STL, OBJ, 3MF) as a Shape.

#### `highlight()`

```ts
highlight(entityId: string, opts?: HighlightOptions): void
```

Highlight any geometry for visual debugging in the viewport. Supported inputs: - `string` — sketch entity ID (e.g. `'L0'`, `'P0'`, `'C0'`) - `[x, y, z]` — 3D point - `[[x1,y1,z1], [x2,y2,z2]]` — edge (line segment) - `{ normal: [x,y,z], offset: number }` — plane by normal + distance from origin - `{ normal: [x,y,z], point: [x,y,z] }` — plane by normal + point on plane - `Shape` or `TrackedShape` — highlight entire 3D shape - `FaceRef` (from `shape.face('top')`) — highlight as plane at face center - `EdgeRef` (from `shape.edge('left')`) — highlight as edge segment

#### `highlight()`

```ts
highlight(point: [ number, number, number ], opts?: HighlightOptions): void
```

#### `highlight()`

```ts
highlight(edge: [ [ number, number, number ], [ number, number, number ] ], opts?: HighlightOptions): void
```

#### `highlight()`

```ts
highlight(plane: { normal: [ number, number, number ]; offset: number; }, opts?: HighlightOptions): void
```

#### `highlight()`

```ts
highlight(plane: { normal: [ number, number, number ]; point: [ number, number, number ]; }, opts?: HighlightOptions): void
```

#### `highlight()`

```ts
highlight(shape: Shape | TrackedShape, opts?: HighlightOptions): void
```

#### `highlight()`

```ts
highlight(face: FaceRef, opts?: HighlightOptions): void
```

#### `highlight()`

```ts
highlight(edge: EdgeRef, opts?: HighlightOptions): void
```

---

## Classes

### `Shape`

Core 3D solid shape. All operations are immutable and return new shapes. Supports transforms (translate, rotate, scale, mirror, transform, rotateAround, pointAlong), booleans (add, subtract, intersect), cutting (split, splitByPlane, trimByPlane), shelling, anchor positioning (attachTo, onFace), placement references, and queries (volume, surfaceArea, boundingBox, isEmpty, numTri, geometryInfo).

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `materialProps` | `ShapeMaterialProps | undefined` | — |

**Methods:**

- `setColor()` — Set the color of this shape (hex string, e.g. "#ff0000")
- `color()` — Alias for setColor
- `material()` — Set material properties for this shape's visual appearance. Returns a new Shape with the specified material properties merged. ```js box(50, 50, 50).material({ metalness: 0.9, roughness: 0.1 }); sphere(30).material({ emissive: '#ff6b35', emissiveIntensity: 2 }); cylinder(40, 20).material({ opacity: 0.3 }); ```
- `clone()` — Return a new Shape wrapper for explicit duplication in scripts.
- `duplicate()` — Alias for clone()
- `geometryInfo()` — Inspect which backend/representation produced this solid.
- `withReferences()` — Attach named placement references that survive normal transforms and imports.
- `referenceNames()` — List named placement references carried by this shape.
- `withPorts()` — Attach named assembly ports (origin + axis + up) that survive transforms and imports.
- `portNames()` — List named port identifiers carried by this shape.
- `referencePoint()` — Resolve a named placement reference or built-in anchor to a 3D point.
- `face()` — Resolve a semantic face by name or query.  Works on compile-covered shapes and, as a fallback, on any planar-faced mesh (e.g. the result of boolean ops) via coplanar triangle clustering.
- `faces()` — Return all faces matching a query, or all mesh-detected faces when no query is given.
- `faceNames()` — List defended semantic face names currently available on this shape.
- `faceHistory()` — Get the transformation history for a specific face.
- `placeReference()` — Translate the shape so the given reference lands on the target coordinate.
- `translate()` — Move the shape relative to its current position. All transforms are immutable and return new shapes.
- `moveTo()` — Position the shape so its bounding box min corner is at the given global coordinate.
- `moveToLocal()` — Position the shape relative to another shape's local coordinate system (bounding box min corner).
- `rotate()` — Rotate using Euler angles in degrees around each axis.
- `transform()` — Apply a 4x4 affine transform matrix (column-major) or a Transform object.
- `scale()` — Scale the shape uniformly or per-axis. Accepts a single number or [x, y, z] array.
- `mirror()` — Mirror across a plane defined by its normal vector (does not need to be unit length).
- `pointAlong()` — Reorient a shape so its primary axis (Z) points along the given direction. Useful for laying cylinders/extrusions along X or Y without thinking about Euler angles. Example: cylinder(40, 5).pointAlong([1, 0, 0]) — lays cylinder along X
- `rotateAround()` — Rotate around an arbitrary axis through a pivot point. Equivalent to: translate(-pivot) → rotate around axis → translate(+pivot)
- `rotateAroundTo()` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point. `movingPoint` / `targetPoint` may be raw world points or this shape's anchors/references.
- `add()` — Union this shape with others (additive boolean). Method form of union().
- `subtract()` — Subtract other shapes from this one. Method form of difference().
- `intersect()` — Keep only the overlap with other shapes. Method form of intersection().
- `split()` — Split into [inside, outside] by another shape.
- `splitByPlane()` — Split by infinite plane. Returns [positive-side, negative-side].
- `trimByPlane()` — Keep the positive side of the plane and discard the opposite side.
- `shell()` — Hollow out compile-covered boxes, cylinders, and straight extrudes. `openFaces` names any subset of the base shape's faces to leave open (no wall). Box bases accept any of: top, bottom, front (=side-bottom), back (=side-top), left (=side-left), right (=side-right), or the raw internal names. Cylinder and extrude bases accept top and bottom only.
- `boundingBox()` — Get the axis-aligned bounding box as { min: [x,y,z], max: [x,y,z] }.
- `volume()` — Volume in mm cubed.
- `surfaceArea()` — Surface area in mm squared.
- `isEmpty()` — True if the shape contains no geometry.
- `numTri()` — Triangle count of the mesh representation.
- `getMesh()` — Extract triangle mesh for Three.js rendering
- `slice()` — Slice the runtime solid by a plane normal to local Z at the given offset.
- `project()` — Orthographically project the runtime solid onto the local XY plane.
- `attachTo()` — Position this shape relative to another using named 3D anchor points. Anchors are bounding-box-relative: 'center', face centers ('top', 'front', ...), edge midpoints ('top-front', 'back-left', ...), and corners ('top-front-left', ...). Anchor word order is flexible: 'front-left' and 'left-front' are equivalent. Named placement references (from withReferences) can also be used as anchors.
- `onFace()` — Place this shape on a face of a parent shape. Think of it like sticking a label on a box surface: - `face` picks which surface ('front', 'back', 'top', etc.) - `u, v` position within that face's 2D plane (from center) - front/back: u = left/right (X), v = up/down (Z) - left/right: u = forward/back (Y), v = up/down (Z) - top/bottom: u = left/right (X), v = forward/back (Y) - `protrude` = how far the child sticks out (positive = outward from face)
- `pocket()` — Cut a pocket (cavity) into this solid through the named face. box(100, 100, 20).pocket('top', 8) box(100, 100, 20).pocket('top', 8, { inset: 5 }) box(100, 100, 20).pocket('top', 8, { scale: 0.8 })
- `boss()` — Add a boss (protrusion) from the named face. box(100, 100, 20).boss('top', 5) box(100, 100, 20).boss('top', 10, { scale: 0.6 })
- `hole()` — Drill a hole into this solid at a face. box(50, 50, 20).hole('top', { diameter: 8, depth: 10 }) box(50, 50, 20).hole('top', { diameter: 6, counterbore: { diameter: 12, depth: 3 } })
- `cutout()` — Cut a profile-shaped pocket through a face using a placed sketch. The sketch must be placed on a face with `Sketch.onFace(...)`. The cut follows the sketch's 2D profile. const profile = circle2d(10).onFace(body, 'top'); body.cutout(profile, { depth: 5 })

### `TrackedShape`

A Shape that knows its topology — which faces and edges it has by name. Created by extruding known geometry (rectangles, polygons with named edges).

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `shape` | `Shape` | — |
| `topology` | `Topology` | — |

**Methods:**

- `face()` — Get a named face or a face matching a query
- `faces()` — Return all faces matching a query, or all mesh-detected faces when no query is given.
- `edge()` — Get a named edge
- `faceNames()` — List all face names
- `edgeNames()` — List all edge names
- `clone()` — Return a new TrackedShape wrapper with copied topology metadata.
- `duplicate()` — Alias for clone()
- `geometryInfo()` — Inspect backend/representation info, including tracked-topology status.
- `withReferences()` — Attach named placement references that survive normal transforms and imports.
- `withPorts()` — Attach named assembly ports (origin + axis + up) that survive transforms and imports.
- `portNames()` — List named port identifiers carried by this shape.
- `referenceNames()` — List named placement references carried by this tracked shape.
- `referencePoint()` — Resolve a named placement reference or built-in anchor to a 3D point.
- `placeReference()` — Translate the tracked shape so the given reference lands on the target coordinate.
- `translate()` — translate(x: number, y: number, z: number): TrackedShape
- `moveTo()` — Move so bounding box min corner is at the given global coordinate
- `moveToLocal()` — Move so bounding box min corner is at target's bounding box min + (x, y, z) offset
- `moveBy()` — Alias for translate — matches ideal API's moveBy
- `rotateAroundEdge()` — Rotate around a named edge by angle in degrees
- `rotate()` — Rotate using Euler angles (degrees), topology is cleared
- `transform()` — Apply a 4x4 transform matrix or Transform object. Topology is cleared.
- `pointAlong()` — Reorient so primary axis (Z) points along direction. Topology is cleared.
- `rotateAround()` — Rotate around an arbitrary axis through a pivot point. Topology is cleared.
- `rotateAroundTo()` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point.
- `scale()` — Scale the shape. Topology is cleared for non-uniform scale.
- `mirror()` — Mirror across a plane. Topology is cleared.
- `color()` — Set the display color. Returns a new TrackedShape.
- `material()` — Set material properties (metalness, roughness, emissive, etc.). Returns a new TrackedShape.
- `toShape()` — Access the underlying Shape for boolean ops etc
- `attachTo()` — Position this tracked shape relative to another using named 3D anchor points
- `onFace()` — Place this shape on a face of a parent shape. See Shape.onFace() for full documentation.
- `subtract()` — Boolean subtract — returns plain Shape (topology lost)
- `add()` — Boolean add — returns plain Shape (topology lost)
- `intersect()` — Boolean intersect — returns plain Shape (topology lost)
- `splitByPlane()` — Split by infinite plane. Returns [positive-side, negative-side] as plain Shapes.
- `trimByPlane()` — Keep the positive side of the plane and discard the opposite side. Returns plain Shape.
- `shell()` — Shelling returns a plain Shape because tracked topology is not preserved.
- `boundingBox()` — boundingBox(): ShapeRuntimeBounds
- `get volume()` — get volume(): number
- `pocket()` — Cut a pocket (cavity) into this solid through the named face. box(100, 100, 20).pocket('top', 8) box(100, 100, 20).pocket('top', 8, { inset: 5 }) box(100, 100, 20).pocket('top', 8, { scale: 0.8 })
- `boss()` — Add a boss (protrusion) from the named face. box(100, 100, 20).boss('top', 5) box(100, 100, 20).boss('top', 10, { scale: 0.6 })
- `hole()` — Drill a hole into this solid at a face. box(50, 50, 20).hole('top', { diameter: 8, depth: 10 }) box(50, 50, 20).hole('top', { diameter: 6, counterbore: { diameter: 12, depth: 3 } })
- `cutout()` — Cut a profile-shaped pocket through a face using a placed sketch. The sketch must be placed on a face with `Sketch.onFace(...)`. The cut follows the sketch's 2D profile. const profile = circle2d(10).onFace(body, 'top'); body.cutout(profile, { depth: 5 })

### `Transform`

**Methods:**

- `static identity()` — static identity(): Transform
- `static from()` — static from(input: TransformInput): Transform
- `static translation()` — static translation(x: number, y: number, z: number): Transform
- `static scale()` — static scale(v: number | Vec3): Transform
- `static rotationAxis()` — static rotationAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): Transform
- `static rotateAroundTo()` — static rotateAroundTo(axis: Vec3, pivot: Vec3, movingPoint: Vec3, targetPoint: V
- `mul()` — Compose transforms in chain order. `a.mul(b)` means apply `a`, then `b`.
- `translate()` — translate(x: number, y: number, z: number): Transform
- `rotateAxis()` — rotateAxis(axis: Vec3, angleDeg: number, pivot?: Vec3): Transform
- `inverse()` — inverse(): Transform
- `point()` — point(p: Vec3): Vec3
- `vector()` — vector(v: Vec3): Vec3
- `toArray()` — toArray(): Mat4

### `ShapeGroup`

**Properties:**

| Property | Type | Description |
|----------|------|-------------|
| `children` | `GroupChild[]` | — |
| `childNames` | `Array<string | undefined>` | — |

**Methods:**

- `childName()` — childName(index: number): string | undefined
- `child()` — Return the named child by name. Throws if not found. Useful when importing a multipart group and working on components individually.
- `clone()` — Return a deep-cloned ShapeGroup tree (refs copied).
- `duplicate()` — Alias for clone()
- `translate()` — translate(x: number, y: number, z: number): ShapeGroup
- `boundingBox()` — boundingBox(): { min: [ number, number, number ]; max: [ number, number, number 
- `moveTo()` — Move so combined bounding box min corner is at the given global coordinate
- `moveToLocal()` — Move so combined bounding box min corner is at target's bounding box min + (x, y, z) offset
- `attachTo()` — attachTo(target: Shape | TrackedShape | ShapeGroup, targetAnchor: Anchor3D | str
- `onFace()` — Place this group on a face of a parent shape. See Shape.onFace() for full documentation.
- `rotate()` — rotate(x: number, y: number, z: number): ShapeGroup
- `rotateAround()` — Rotate around an arbitrary axis through a pivot point. Sugar for: group.transform(Transform.rotationAxis(axis, angleDeg, pivot))
- `rotateAroundTo()` — Rotate around an axis until a moving point reaches the target line/plane defined by the axis and target point. ShapeGroup string points use built-in anchors only.
- `pointAlong()` — Reorient all 3D children so their primary axis (Z) points along direction. Sugar for a single group-wide axis rotation via Transform.rotationAxis(...).
- `transform()` — Apply a 4x4 transform matrix or Transform object to all 3D children.
- `scale()` — scale(v: number | [ number, number, number ]): ShapeGroup
- `mirror()` — mirror(normal: [ number, number, number ]): ShapeGroup
- `color()` — color(hex: string): ShapeGroup
- `withReferences()` — Attach named placement references to this group. References survive normal transforms (translate/rotate/scale/mirror/transform). ```javascript const bracket = group( { name: 'Left', shape: leftShape }, { name: 'Right', shape: rightShape }, ).withReferences({ points: { mountCenter: [0, 0, 0] }, }); ```
- `referenceNames()` — List named placement references carried by this group.
- `withPorts()` — Attach named assembly ports (origin + axis + up) that survive transforms.
- `portNames()` — List named port identifiers carried by this group.
- `referencePoint()` — Resolve a named placement reference or built-in Anchor3D to a 3D point. Named refs take priority over built-in anchors.
- `placeReference()` — Translate the group so the given reference lands on the target coordinate. ```javascript const placed = require('./bracket-assembly.forge.js').group .placeReference('mountCenter', [0, 0, 50]); ```

### `SdfShape`

**Methods:**

- `toShape()` — Mesh this SDF into a ForgeCAD Shape via Manifold.levelSet(). Once converted, the result is a regular Shape — booleans, transforms, export all work.
- `union()` — SDF union (sharp).
- `subtract()` — SDF difference (sharp) — subtracts others from this.
- `intersect()` — SDF intersection (sharp).
- `smoothUnion()` — Smooth union — blends shapes together with a smooth radius.
- `smoothSubtract()` — Smooth difference — smoothly carves other from this.
- `smoothIntersect()` — Smooth intersection — smoothly intersects.
- `morph()` — Morph between this shape and another. t=0 → this, t=1 → other.
- `translate()` — translate(x: number, y: number, z: number): SdfShape
- `rotate()` — rotate(xDeg: number, yDeg: number, zDeg: number): SdfShape
- `scale()` — scale(factor: number): SdfShape
- `twist()` — Twist around the Y axis.
- `bend()` — Bend around the Z axis with given radius.
- `repeat()` — Repeat in space. Spacing of 0 on an axis means no repetition. Count of 0 = infinite.
- `shell()` — Hollow out, keeping only a shell of given thickness.
- `displace()` — Displace the surface by a function of position.
- `onion()` — Create concentric onion layers.

---

## Constants

### `ANCHOR3D_NAMES`

### `verify`

**Members:**

- `that()` — Custom predicate check.
- `equal()` — Check that two numbers are approximately equal (within tolerance).
- `notEqual()` — Check that two numbers are NOT equal (differ by more than tolerance).
- `greaterThan()` — Check that actual > min.
- `lessThan()` — Check that actual < max.
- `inRange()` — Check that min <= actual <= max.
- `centersCoincide()` — Check that the bounding-box centers of two shapes coincide within tolerance (mm).
- `notColliding()` — Check that two shapes do not collide (minGap > 0).
- `minClearance()` — Check that a minimum clearance gap exists between two shapes.
- `parallel()` — Check that two face normals are parallel (within toleranceDeg degrees).
- `perpendicular()` — Check that two face normals are perpendicular (within toleranceDeg degrees).
- `coplanar()` — Check that a face is coplanar with (same plane as) another face, meaning they are parallel AND their centers lie on the same plane.
- `faceAt()` — Check that a face center lies at a specific position (within toleranceMm).
- `sameDirection()` — Check that two face normals point in the same direction (not antiparallel). Stricter than parallel — both |angle| AND sign must match.
- `isEmpty()` — Check that a shape is empty.
- `notEmpty()` — Check that a shape is NOT empty.
- `volumeApprox()` — Check that a shape's volume is approximately equal to expected (mm³).
- `areaApprox()` — Check that a shape's surface area is approximately equal to expected (mm²).
- `boundingBoxSize()` — Check that a shape's bounding box has approximately the given size.

### `Constraint`

**Members:**

- `makeParallel()` — makeParallel(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): Constra
- `enforceAngle()` — enforceAngle(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg, angleDeg
- `horizontal()` — horizontal(builder: ConstrainedSketchBuilder, line: LineArg): ConstrainedSketchB
- `vertical()` — vertical(builder: ConstrainedSketchBuilder, line: LineArg): ConstrainedSketchBui
- `equalLength()` — equalLength(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): Constrai
- `distance()` — distance(builder: ConstrainedSketchBuilder, a: PointArg, b: PointArg, value: num
- `fix()` — fix(builder: ConstrainedSketchBuilder, pt: PointArg, x: number, y: number): Cons
- `coincident()` — coincident(builder: ConstrainedSketchBuilder, a: PointArg, b: PointArg): Constra
- `perpendicular()` — perpendicular(builder: ConstrainedSketchBuilder, a: LineArg, b: LineArg): Constr
- `length()` — length(builder: ConstrainedSketchBuilder, line: LineArg, value: number): Constra

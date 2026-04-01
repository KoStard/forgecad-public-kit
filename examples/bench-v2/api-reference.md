# ForgeCAD API Reference (Benchmark Subset)

ForgeCAD scripts are JavaScript. The API is globally available — no imports needed.
Scripts must `return` geometry (Shape, Assembly, or SolvedAssembly).

## Primitives

```javascript
box(x, y, z, center?)           // Rectangular box. center=true → centered at origin
cylinder(height, radius, radiusTop?, segments?, center?)  // Cylinder/cone
sphere(radius, segments?)        // Sphere at origin
```

## Booleans

```javascript
union(a, b, ...)                 // Combine shapes
difference(a, b, ...)            // Subtract b,c,... from a
intersection(a, b, ...)          // Keep overlap only
shape.subtract(other)            // Shorthand for difference
```

## Transforms

```javascript
shape.translate(x, y, z)        // Move
shape.rotate(rx, ry, rz)        // Rotate (degrees, Euler XYZ)
shape.scale(s)                   // Uniform scale
shape.mirror([nx, ny, nz])      // Mirror across plane through origin
shape.color("#hex")              // Set color
```

## Measurements

```javascript
shape.boundingBox()              // { min: [x,y,z], max: [x,y,z] }
shape.volume()                   // mm³
shape.surfaceArea()              // mm²
shape.isEmpty()                  // boolean
```

## Assembly

```javascript
assembly(name)                              // Create assembly
  .addPart(name, shape, options?)           // Add a named part
  .addRevolute(name, parent, child, opts)   // Revolute (hinge) joint
  .addPrismatic(name, parent, child, opts)  // Prismatic (slide) joint
  .addFixed(name, parent, child, opts)      // Fixed connection
  .solve(state?)                            // Solve at joint values → SolvedAssembly
  .sweepJoint(name, from, to, steps, base?) // Sweep joint, check collisions
  .describe()                               // Get parts/joints metadata

// Joint options:
// { axis: [x,y,z], min: deg, max: deg, default: deg,
//   frame: Transform.identity().translate(x,y,z) }

// SolvedAssembly:
solved.getPart(name)             // Get positioned part
solved.collisionReport()         // Check for part overlaps
solved.minClearance(a, b, len?)  // Min gap between two parts
solved.toGroup()                 // Convert to ShapeGroup for display
```

## Gear Coupling

```javascript
const pair = lib.gearPair({
  pinion: { module: m, teeth: n, faceWidth: w },
  gear:   { module: m, teeth: n, faceWidth: w },
});

assembly.addGearCoupling(drivenJoint, driverJoint, { pair })
// Auto-computes ratio from tooth counts
```

## Transforms for Joint Frames

```javascript
Transform.identity()                    // Identity transform
Transform.identity().translate(x, y, z) // Translation
```

## Verification (optional, for self-checks)

```javascript
verify.that(label, () => condition, message?)
verify.equal(label, actual, expected, tolerance?)
verify.inRange(label, value, min, max)
verify.notColliding(label, shapeA, shapeB)
```

## Coordinate System

- **Z-up** right-handed: X = left/right, Y = forward/back, Z = up/down
- All dimensions in millimeters, angles in degrees

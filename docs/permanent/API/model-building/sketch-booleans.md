# Sketch Booleans

2D boolean operations for combining, subtracting, and intersecting sketches.

## Methods

### `.add(...others)`
Combines sketches (union). Accepts `sketch.add(a, b)` and `sketch.add([a, b])`.

```javascript
const combined = rect(50, 30).add(
  circle2d(20).translate(25, 15),
  ngon(6, 15).translate(40, 15)
);
```

### `.subtract(...others)`
Subtracts one or more sketches from this one. Accepts `sketch.subtract(a, b)` and `sketch.subtract([a, b])`.

```javascript
const plate = rect(100, 80);
const hole = circle2d(10);
const slotCut = rect(18, 8).translate(41, 36);
const result = plate.subtract(hole.translate(25, 40), slotCut);
```

### `.intersect(...others)`
Keeps only the area shared by every operand. Accepts `sketch.intersect(a, b)` and `sketch.intersect([a, b])`.

```javascript
const overlap = rect(50, 50).intersect(
  circle2d(30).translate(25, 25),
  rect(40, 20).translate(5, 15)
);
```

## Functions

### `union2d(...sketches)`
Combines multiple sketches into one.

```javascript
const combined = union2d(
  rect(50, 30),
  circle2d(20).translate(25, 15),
  ngon(6, 15).translate(75, 15)
);
```

`union2d([a, b, c])` is also supported when your sketches are already in an array.

### `difference2d(...sketches)`
Subtracts sketches[1..n] from sketches[0].

```javascript
const plate = rect(100, 80);
const hole1 = circle2d(10).translate(25, 40);
const hole2 = circle2d(10).translate(75, 40);
const result = difference2d(plate, hole1, hole2);
```

`difference2d([base, cutter1, cutter2])` works too.

### `intersection2d(...sketches)`
Keeps only the area where all sketches overlap.

```javascript
const overlap = intersection2d(
  rect(50, 50),
  circle2d(30).translate(25, 25)
);
```

`intersection2d([a, b, c])` is also supported.

### `hull2d(...sketches)`
Creates the convex hull of multiple sketches.

```javascript
const hull = hull2d(
  circle2d(10),
  circle2d(10).translate(50, 0),
  circle2d(10).translate(25, 40)
);
```

`hull2d([a, b, c])` is also supported when your sketches are already in an array.

`hull2d()` is best for intentionally blended convex silhouettes. If you need true corner fillets while keeping some neighboring corners sharp, use `filletCorners(...)` instead.

## Performance Note

The multi-argument functions (`union2d`, `difference2d`, `intersection2d`) use Manifold's batch operations internally, which are faster than chaining `.add()` / `.subtract()` calls one by one. Prefer them when combining many sketches.

```javascript
// Fast — single batch operation
const combined = union2d(s1, s2, s3, s4, s5);

// Slower — sequential pairwise operations
const combined = s1.add(s2).add(s3).add(s4).add(s5);
```

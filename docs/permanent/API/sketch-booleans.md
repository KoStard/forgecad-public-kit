# Sketch Booleans

2D boolean operations for combining, subtracting, and intersecting sketches.

## Methods

### `.add(other)`
Combines two sketches (union).

```javascript
const combined = rect(50, 30).add(circle2d(20).translate(25, 15));
```

### `.subtract(other)`
Subtracts another sketch from this one.

```javascript
const plate = rect(100, 80);
const hole = circle2d(10);
const result = plate.subtract(hole.translate(50, 40));
```

### `.intersect(other)`
Keeps only the overlapping area.

```javascript
const overlap = rect(50, 50).intersect(circle2d(30).translate(25, 25));
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

### `difference2d(...sketches)`
Subtracts sketches[1..n] from sketches[0].

```javascript
const plate = rect(100, 80);
const hole1 = circle2d(10).translate(25, 40);
const hole2 = circle2d(10).translate(75, 40);
const result = difference2d(plate, hole1, hole2);
```

### `intersection2d(...sketches)`
Keeps only the area where all sketches overlap.

```javascript
const overlap = intersection2d(
  rect(50, 50),
  circle2d(30).translate(25, 25)
);
```

### `hull2d(...sketches)`
Creates the convex hull of multiple sketches.

```javascript
const hull = hull2d(
  circle2d(10),
  circle2d(10).translate(50, 0),
  circle2d(10).translate(25, 40)
);
```

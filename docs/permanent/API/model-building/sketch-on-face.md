# Sketch On Face

Attach a 2D sketch to a 3D face so it renders in-place and extrudes along that face normal.

This supports:
- canonical body faces: `front`, `back`, `left`, `right`, `top`, `bottom`
- tracked planar faces on `TrackedShape`, like `side-left`
- direct `FaceRef` targets from `tracked.face('top')`
- supported compiler-owned created faces on `shell()` / `hole()` / `cutout()` results, such as `inner-side-right`, `floor`, `counterbore-floor`, and `wall-right`
- supported compiler-owned created faces on `shell()` / `hole()` / `cutout()` results, such as `inner-side-right`, `floor`, `counterbore-floor`, and `wall-right`
- defended preserved faces on compile-covered boolean results when one propagated descendant keeps a unique name
- direct `FaceRef` targets from preserved/repeated descendants that still validate against a later compile-covered boolean target

## `.onFace(parent, face, opts?)`

Places a sketch onto a parent face using face-local coordinates.

**Parameters:**
- `parent` (`Shape | TrackedShape`) - target body
- `face` (`'front' | 'back' | 'left' | 'right' | 'top' | 'bottom' | string | FaceRef`)
- `opts` (object, optional):
  - `u` (number) - face-local horizontal offset from the face center
  - `v` (number) - face-local vertical offset from the face center
  - `protrude` (number) - offset along the face normal. Positive = outward
  - `selfAnchor` (`Anchor`) - which 2D sketch anchor aligns to the face center. Default: `'center'`

**Returns:** `Sketch`

## `.onFace(faceRef, opts?)`

Places a sketch directly from a tracked or compiler-owned planar `FaceRef`.

This is useful when the script has already selected a face semantically:

```javascript
const panel = Rectangle2D.from3Points(
  point(-30, -18),
  point(28, -6),
  point(18, 24),
).extrude(16);

const cap = circle2d(5)
  .onFace(panel.face('top'), { u: 12, protrude: 0.05 })
  .extrude(1.2);
```

```javascript
const cup = roundedRect(70, 42, 5, true)
  .extrude(22)
  .shell(2, { openFaces: ['top'] });

const rib = rect(6, 4)
  .onFace(cup, 'inner-side-right', { u: 0, v: 0, protrude: 0.05 })
  .extrude(1.2);
```

```javascript
const body = box(120, 60, 40, true).color('#d8dce3');

const badge = roundedRect(28, 10, 2, true)
  .onFace(body, 'front', { v: 8 })
  .extrude(2)
  .color('#1d2733');

return [
  { name: 'Body', shape: body },
  { name: 'Badge', shape: badge },
];
```

## Face-local coordinates

- Canonical faces:
  - `front` / `back`: `u = X`, `v = Z`
  - `left` / `right`: `u` runs across the face, `v = Z`
  - `top` / `bottom`: `u = X`, `v` runs across the face
- Tracked planar faces use their own stored local frame:
  - side faces of extruded rectangles: `u` follows the source edge, `v = Z`
  - tracked `top` / `bottom` faces follow the source sketch axes
  - direct `FaceRef` placement uses that face's `uAxis` / `vAxis`
  - supported shell inner walls, blind-hole floors, counterbore shoulder floors, and defended cut walls reuse compiler-owned local frames for downstream workplanes
- supported shell inner walls, blind-hole floors, counterbore shoulder floors, and defended cut walls reuse compiler-owned local frames for downstream workplanes
  - compile-covered `Shape` targets now resolve defended named faces through the shared face-query table before falling back to bare canonical body heuristics

The sketch's local `+Z` becomes the face normal, so `extrude(positive)` goes outward from that face.

## Notes

- This is a planar face-placement feature, not arbitrary curved-surface projection.
- Tracked curved faces like `cylinder(...).face('side')` are rejected because they do not have a planar sketch frame.
- Supported created-face names on compiler-owned feature results are intentionally narrow, but defended split descendants now stay visible as semantic regions where Forge can keep one stable source surface.
- Hole/cut host faces, supported `upToFace` termination faces, and defended boolean-difference / boolean-intersection descendants can now stay queryable as face regions instead of collapsing straight to "missing face".
- Coplanar boolean face sets now stay placeable through `onFace(shape, name, ...)` when Forge can defend one shared planar frame; non-coplanar sets stay explicit and reject planar placement honestly.
- The placed sketch still supports normal 2D operations like `translate`, `rotate`, `scale`, and sketch booleans before extrusion.
- If multiple sketches share the same face placement, their 2D booleans preserve that shared placement.
- If booleans mix sketches with different 3D placements, the result drops back to an unplaced sketch.
- Extruding a placed sketch keeps the tracked `top` / `bottom` / `side` metadata from that extrusion, transformed into world space.
- Projection-driven follow-on sketches now keep compiler-visible provenance when you `projectToPlane()` a compatible projected source back onto a matching parallel plane. The defended exact subset now covers straight extrusions plus compatible shell/hole/cut/union descendants that reduce to one planar projection basis, but arbitrary projection targets still stay runtime-only.

# Sketch On Face

Attach a 2D sketch to a 3D face so it renders in-place and extrudes along that face normal.

This is the code-first equivalent of "start sketch on face" for the six standard body faces:
- `front`
- `back`
- `left`
- `right`
- `top`
- `bottom`

## `.onFace(parent, face, opts?)`

Places a sketch onto a parent face using face-local coordinates.

**Parameters:**
- `parent` (`Shape | TrackedShape`) - target body
- `face` (`'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'`)
- `opts` (object, optional):
  - `u` (number) - face-local horizontal offset from the face center
  - `v` (number) - face-local vertical offset from the face center
  - `protrude` (number) - offset along the face normal. Positive = outward
  - `selfAnchor` (`Anchor`) - which 2D sketch anchor aligns to the face center. Default: `'center'`

**Returns:** `Sketch`

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

- `front` / `back`: `u = X`, `v = Z`
- `left` / `right`: `u` runs across the face, `v = Z`
- `top` / `bottom`: `u = X`, `v` runs across the face

The sketch's local `+Z` becomes the face normal, so `extrude(positive)` goes outward from that face.

## Notes

- This is a planar face-placement feature, not arbitrary curved-surface projection.
- The placed sketch still supports normal 2D operations like `translate`, `rotate`, `scale`, and sketch booleans before extrusion.
- If multiple sketches share the same face placement, their 2D booleans preserve that shared placement.
- If booleans mix sketches with different 3D placements, the result drops back to an unplaced sketch.

# Sketch Anchor Positioning

Position sketches relative to each other using named anchor points.

## Methods

### `.attachTo(target, targetAnchor, selfAnchor?, offset?)`
Position a sketch relative to another using named anchor points.

**Parameters:**
- `target` (Sketch) — The sketch to attach to
- `targetAnchor` (Anchor) — Point on target: 'center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right'
- `selfAnchor` (Anchor, optional) — Point on this sketch to align. Default: 'center'
- `offset` ([number, number], optional) — Additional offset after alignment

**Returns:** `Sketch`

```javascript
const plate = rect(50, 4);
const arm = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left');
return union2d(plate, arm);

// With offset: attach then shift 5mm right
const shifted = rect(4, 70).attachTo(plate, 'bottom-left', 'top-left', [5, 0]);
```

## Anchor Points

Available anchor positions:
- `'center'` — geometric center
- `'top-left'`, `'top-right'`, `'bottom-left'`, `'bottom-right'` — corners
- `'top'`, `'bottom'`, `'left'`, `'right'` — edge midpoints

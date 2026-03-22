# 2D Text

Create filled text geometry from strings using the built-in **Forge Mono** font — a clean, geometric monoline typeface designed for technical CAD work. Text sketches can be extruded, engraved, or used anywhere a normal `Sketch` is accepted.

## `text2d(content, options?)`

Build a filled 2D `Sketch` from a text string.

**Parameters:**
- `content` (string) — The text to render
- `options` (TextOptions, optional):
  - `size` (number) — Cap height in model units. Default: `10`. All proportions scale with this.
  - `letterSpacing` (number) — Extra space between characters in model units. Negative tightens. Default: `0`
  - `align` (`'left' | 'center' | 'right'`) — Horizontal alignment relative to x = 0. Default: `'left'`
  - `baseline` (`'baseline' | 'center' | 'top'`) — Vertical alignment relative to y = 0. Default: `'baseline'`

**Returns:** `Sketch` — Filled 2D text geometry

```javascript
// Extruded nameplate
text2d('FORGE CAD', { size: 8 }).extrude(1.2);

// Centered label
text2d('V 2.0', { size: 6, align: 'center', baseline: 'center' });

// Engraved text on top face of a box
const label = text2d('REV A', { size: 5, align: 'center', baseline: 'center' });
const plate = box(60, 20, 5);
return plate.subtract(label.onFace(plate, 'top', { protrude: -0.5 }).extrude(1));
```

### Font: Forge Mono

- **Style:** Geometric monoline sans-serif, squared-off and futuristic
- **Inspired by:** Eurostile, Chakra Petch
- **Characteristics:** Uniform stroke weight, flat open ends, no serifs
- **Character set:** Uppercase A–Z, digits 0–9, punctuation. Lowercase is mapped to uppercase

> **Callout:** The font is built into the engine — no external font files needed. Every character is constructed from geometric primitives (line segments and arcs), so the resulting sketches extrude and boolean cleanly.

## `textWidth(content, options?)`

Measure the rendered width of a string without creating geometry. Useful for layout calculations.

**Parameters:**
- `content` (string) — The text to measure
- `options` (object, optional):
  - `size` (number) — Cap height in model units. Default: `10`
  - `letterSpacing` (number) — Extra spacing. Default: `0`

**Returns:** `number` — Width of the rendered text in model units

```javascript
const label = 'SERIAL: 001';
const w = textWidth(label, { size: 6 });

// Create a plate that fits the text with padding
const plate = box(w + 10, 12, 2);
const text = text2d(label, { size: 6, align: 'center', baseline: 'center' })
  .translate(w / 2 + 5, 6, 0);
```

## Alignment Quick Reference

| `align` | `baseline` | Origin position |
|---------|-----------|----------------|
| `'left'` | `'baseline'` | Bottom-left of first character (default) |
| `'center'` | `'center'` | Dead center of text block |
| `'right'` | `'top'` | Top-right corner |

The origin is at `(0, 0)` — alignment controls where the text sits relative to that point.

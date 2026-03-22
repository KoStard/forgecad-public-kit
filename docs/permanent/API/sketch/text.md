# 2D Text

Create filled text geometry from strings. Supports both the built-in **Forge Mono** geometric font and any **TTF/OTF font file** for professional typography. Text sketches can be extruded, engraved, or used anywhere a normal `Sketch` is accepted.

## `text2d(content, options?)`

Build a filled 2D `Sketch` from a text string.

**Parameters:**
- `content` (string) — The text to render
- `options` (TextOptions, optional):
  - `size` (number) — Cap height in model units. Default: `10`. All proportions scale with this.
  - `letterSpacing` (number) — Extra space between characters in model units. Negative tightens. Default: `0`
  - `align` (`'left' | 'center' | 'right'`) — Horizontal alignment relative to x = 0. Default: `'left'`
  - `baseline` (`'baseline' | 'center' | 'top'`) — Vertical alignment relative to y = 0. Default: `'baseline'`
  - `font` (string | Font) — Path to a TTF/OTF font file, or a pre-loaded Font object from `loadFont()`. When omitted, uses the built-in Forge Mono font.
  - `flattenTolerance` (number) — Bezier curve flattening tolerance in model units (font mode only). Smaller = smoother curves. Default: 0.5% of size.

**Returns:** `Sketch` — Filled 2D text geometry

```javascript
// Built-in geometric font (default)
text2d('FORGE CAD', { size: 8 }).extrude(1.2);

// Using a real font — professional typography with proper curves
text2d('Hello World', { size: 10, font: '/path/to/Arial.ttf' }).extrude(1);

// Pre-load font for reuse across multiple text calls
const font = loadFont('/path/to/Arial Bold.ttf');
text2d('Title', { size: 12, font }).extrude(1.5);
text2d('Subtitle', { size: 8, font, align: 'center' }).extrude(0.8);

// Centered label
text2d('V 2.0', { size: 6, align: 'center', baseline: 'center' });

// Engraved text on top face of a box
const label = text2d('REV A', { size: 5, align: 'center', baseline: 'center' });
const plate = box(60, 20, 5);
return plate.subtract(label.onFace(plate, 'top', { protrude: -0.5 }).extrude(1));
```

### Font Options

**Real fonts (TTF/OTF)** — Pass a file path or pre-loaded Font to the `font` option:
- Professional typography with proper bezier curves
- Full character set: uppercase, lowercase, accented characters, symbols
- Automatic kerning between character pairs
- Any TTF or OTF font file works

**Built-in: Forge Mono** (default when no `font` option) —
- **Style:** Geometric monoline sans-serif, squared-off and futuristic
- **Inspired by:** Eurostile, Chakra Petch
- **Characteristics:** Uniform stroke weight, flat open ends, no serifs
- **Character set:** Uppercase A–Z, digits 0–9, punctuation. Lowercase maps to uppercase
- No external font files needed — every character is constructed from geometric primitives

## `loadFont(source, cacheKey?)`

Pre-load and cache a font for reuse across multiple `text2d()` calls.

**Parameters:**
- `source` (string | ArrayBuffer) — File path to a TTF/OTF font, or raw font data as ArrayBuffer
- `cacheKey` (string, optional) — Cache key when passing ArrayBuffer

**Returns:** Font object (pass to `text2d`'s `font` option)

```javascript
const font = loadFont('/System/Library/Fonts/Supplemental/Arial.ttf');
text2d('Line 1', { size: 8, font }).extrude(1);
text2d('Line 2', { size: 8, font }).extrude(1);
```

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

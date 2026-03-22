# Text Quality Investigation

## Goal & Current State

**Goal**: Generate decent, professional-looking text in ForgeCAD models.

**Current state**: ForgeCAD has a built-in "Forge Mono" font — a hand-crafted geometric monoline font where every glyph is constructed from capsule bars, arc segments, and filled circles. While functional, it has significant limitations:

1. **Aesthetics** — monoline construction (uniform 12% stroke width) with flat-ended arcs looks rough and mechanical
2. **Uppercase only** — lowercase maps to uppercase, no distinct lowercase glyphs
3. **No font variety** — only one built-in font, no way to use standard TTF/OTF fonts
4. **Arc resolution** — arc segments use `ceil(range/4)` segments (min 8), producing visible faceting on curves
5. **No kerning** — fixed advance widths with no pair-based kerning

## Architecture Summary

- `text2d(content, options)` → returns a `Sketch` (2D geometry)
- Glyphs defined in normalized 0..1 grid, scaled by `size` parameter
- Built from: `hBar`, `vBar`, `dBar` (capsule slots), `arcBar` (polygon arcs), `ringFull`, `dot`
- Sketches integrate with full pipeline: extrude, revolve, boolean ops, face placement
- SVG import already has `sampleCubic()` and `sampleQuadratic()` bezier flattening

## Key Opportunity

The SVG import path already has all the bezier curve flattening infrastructure. Font outlines (TTF/OTF) are just bezier curves. Using `opentype.js` to load fonts and extract glyph paths, then flattening to polygons, gives us real typography with:
- Professional font aesthetics (variable stroke width, proper curves)
- Full character sets (lowercase, accented characters, symbols)
- Kerning support
- Multiple font choices

## Progress Tracker

| # | Change | Quality | Performance | Status |
|---|--------|---------|-------------|--------|
| — | Baseline (Forge Mono geometric) | Rough monoline, uppercase only | 146ms for 5 text objects | ✅ Baseline |
| P1 | opentype.js font loading + glyph→Sketch | Professional typography, full charset | 832ms for 6 text objects (4 fonts) | ✅ Working |
| P2 | Bundled Inter font + named resolution | Works in browser via `font: 'sans-serif'` | 296ms for 3 text objects | ✅ Working |

## Experiment Log

### Baseline
**What**: Current "Forge Mono" hand-crafted geometric font.
**Quality**: Functional but looks like a CNC-machine font. Uniform stroke width, no curves beyond arc approximations, uppercase only. Letters like B, S, 3, 8 rely on polygon arc approximations that produce visible flat segments.
**Performance**: 146ms for 5 text objects (all uppercase alphabet, digits, punctuation, "HELLO WORLD").

### P1: opentype.js Font Loading (SUCCESS)
**What**: Added `opentype.js` dependency to parse TTF/OTF font files. New `fontText.ts` module converts font glyph outlines (quadratic/cubic bezier curves) into polygon-based Sketches via adaptive flattening. Integrated into `text2d()` via new `font` option.

**API**:
```js
// Use any TTF/OTF font file
text2d('Hello World', { size: 10, font: '/path/to/font.ttf' })

// Pre-load for reuse
const font = loadFont('/path/to/font.ttf');
text2d('Text A', { size: 10, font })
text2d('Text B', { size: 8, font })
```

**Result**: Successfully renders text from Arial, Arial Bold, Georgia (serif), and Monaco (monospace). All produce valid 3D solids when extruded. Full lowercase, numbers, special characters, kerning.

**Technical approach**:
1. opentype.js `getPath()` → M/L/Q/C/Z commands (like SVG path data)
2. Bezier flattening: same `sampleQuadratic`/`sampleCubic` approach as SVG import
3. Y-axis flip (font Y-down → CAD Y-up)
4. Nonzero fill rule with signed area for outer/hole detection (same as SVG import)
5. Font cache to avoid reparsing
6. Cap height scaling via OS/2 `sCapHeight` or ascender fallback
7. Proper kerning via `font.getKerningValue()`

**Performance**: 832ms for 6 text objects using 4 different fonts (includes font loading). Subsequent calls with cached fonts are faster.

**Why it worked**: Font outlines are just bezier curves — the same math already proven in SVG import. The key insight was that opentype.js provides glyph paths in the same M/L/Q/C/Z command format as SVG, so the conversion pipeline was straightforward.

**What's preserved**: Built-in "Forge Mono" font still works as default when no `font` option is provided. All existing tests pass.

## Files Modified

| File | Purpose |
|------|---------|
| `src/forge/sketch/fontText.ts` | NEW — opentype.js font loading, bezier flattening, glyph→Sketch conversion |
| `src/forge/sketch/text.ts` | Added `font` and `flattenTolerance` options to `TextOptions`; dispatch to `fontText2d` when font provided |
| `src/forge/sketch/index.ts` | Export `loadFont` |
| `src/forge/forge-public-api.ts` | Export `loadFont` for Monaco intellisense |
| `src/forge/runner.ts` | Add `loadFont` to runtime bindings (sandbox globals) |
| `package.json` | Added `opentype.js`, `@fontsource/inter`, `@types/opentype.js` dependencies |
| `src/forge/fonts/inter-regular-data.ts` | NEW — Inter Regular font embedded as base64 (~40KB) |
| `src/forge/fonts/Inter-Regular.woff` | Source font file (not imported at runtime, base64 is used) |
| `examples/api/text2d-font.forge.js` | NEW — example using bundled and custom fonts |
| `docs/permanent/API/sketch/text.md` | Updated API docs with font options |

## Future Improvements

- Bundle Inter Bold variant for `font: 'sans-serif-bold'`
- Multi-line text support
- Text along a path/curve
- Bold/italic style options via font file variants

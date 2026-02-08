# Rendering Quality Investigation Guide

The current rendering looks "old game" rather than "Fusion360". Here's a systematic breakdown of what to try, ordered by impact.

---

## 1. Flat Shading on Planar Faces (Already Applied)

**Impact: HIGH | Difficulty: Done**

The biggest fix was switching from `computeVertexNormals()` (which averages normals at shared vertices, making boxes look blobby) to non-indexed geometry with per-face normals. This is already in the codebase.

The remaining issue: curved surfaces (cylinders, spheres) also get flat-shaded, showing visible facets. Two paths forward:

**Option A — Increase segment count** (easy):
```ts
// In kernel.ts, during initKernel():
_wasm.setMinCircularAngle(2);  // was 3, smaller = more segments
// Or force specific count:
_wasm.setCircularSegments(48); // 48 segments per circle
```

**Option B — Selective smooth shading** (harder, better):
Use Manifold's `calculateNormals()` to get smooth normals on curved surfaces while keeping flat faces flat:
```ts
// In kernel.ts Shape.getMesh():
getMesh() {
  // calculateNormals(normalIdx, minSharpAngle)
  // normalIdx=3 means store normals at property channels 3,4,5
  // minSharpAngle=30 means edges sharper than 30° stay sharp
  const withNormals = this.manifold.calculateNormals(3, 30);
  return withNormals.getMesh(3);
}
```
Then in Viewport, read normals from channels 3,4,5 instead of computing them. This gives you smooth cylinders with sharp box edges — exactly what CAD tools do.

---

## 2. Environment Mapping

**Impact: HIGH | Difficulty: LOW**

This is already added (`<Environment preset="studio" />`). The environment map provides subtle reflections that make the material feel "real" rather than flat-lit.

Other presets to try: `"city"`, `"sunset"`, `"warehouse"`, `"apartment"`.

For a custom HDRI:
```tsx
<Environment files="/path/to/studio.hdr" />
```

Free HDRIs: [polyhaven.com/hdris](https://polyhaven.com/hdris) — download a studio/neutral one.

---

## 3. Anti-Aliasing

**Impact: HIGH | Difficulty: LOW**

Add `antialias` to the Canvas:
```tsx
<Canvas
  gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
  ...
>
```

For even better AA, add SMAA post-processing:
```bash
npm install @react-three/postprocessing
```
```tsx
import { EffectComposer, SMAA } from '@react-three/postprocessing';

// Inside Canvas:
<EffectComposer>
  <SMAA />
</EffectComposer>
```

---

## 4. Material Tuning

**Impact: MEDIUM | Difficulty: LOW**

Current: `meshPhysicalMaterial` with clearcoat. Experiment with these ranges:

| Parameter | "Plastic" look | "Metal" look | "Clay/Matte" look |
|-----------|---------------|-------------|-------------------|
| color | #5b9bd5 | #aabbcc | #d4c5a9 |
| metalness | 0.0 | 0.6 | 0.0 |
| roughness | 0.3 | 0.2 | 0.8 |
| clearcoat | 0.3 | 0.0 | 0.0 |
| clearcoatRoughness | 0.2 | — | — |
| envMapIntensity | 0.8 | 1.5 | 0.3 |

The Fusion360 default look is close to "plastic" with a slight blue tint and moderate clearcoat.

---

## 5. Edge Rendering

**Impact: HIGH | Difficulty: MEDIUM**

Visible edges are what separate CAD from game rendering. Already using `EdgesGeometry` with 1° threshold.

**Problem**: WebGL ignores `linewidth` > 1 on most GPUs. Lines are always 1px thin.

**Solution — Line2 for thick lines**:
```bash
npm install three-fatline
# or use three/examples/jsm/lines/Line2
```
```tsx
import { Line } from '@react-three/drei';

// Instead of lineSegments + EdgesGeometry, extract edge pairs and use:
<Line points={edgePairs} color="#1a1a2e" lineWidth={1.5} />
```

**Alternative — Screen-space edge detection** (post-processing):
```tsx
import { EffectComposer, Outline } from '@react-three/postprocessing';
// Renders edges as a post-process effect — resolution independent
```

---

## 6. Tone Mapping & Color Space

**Impact: MEDIUM | Difficulty: LOW**

```tsx
<Canvas
  gl={{
    antialias: true,
    toneMapping: THREE.ACESFilmicToneMapping,
    toneMappingExposure: 1.2,
    outputColorSpace: THREE.SRGBColorSpace,
  }}
>
```

ACES tone mapping compresses highlights and lifts shadows — gives a more "cinematic" feel. The default (`NoToneMapping`) looks flat.

---

## 7. Ambient Occlusion (SSAO)

**Impact: MEDIUM | Difficulty: MEDIUM**

Adds subtle shadows in crevices and corners — huge for depth perception.

```bash
npm install @react-three/postprocessing postprocessing
```
```tsx
import { EffectComposer, N8AO } from '@react-three/postprocessing';

<EffectComposer>
  <N8AO aoRadius={0.5} intensity={2} distanceFalloff={0.5} />
</EffectComposer>
```

N8AO is faster than SSAO and looks better for CAD-style rendering.

---

## 8. Contact Shadows

**Impact: LOW | Difficulty: LOW**

```tsx
import { ContactShadows } from '@react-three/drei';

<ContactShadows
  position={[0, -0.01, 0]}
  opacity={0.4}
  scale={200}
  blur={2}
  far={100}
/>
```

Adds a soft shadow under the model on the ground plane. Subtle but adds grounding.

---

## 9. Pixel Ratio

**Impact: MEDIUM | Difficulty: LOW**

On retina displays, default pixel ratio might be 1. Force it higher:
```tsx
<Canvas dpr={[1, 2]} ... >
```

This renders at 2x on retina displays — sharper edges and text.

---

## Quick Wins Summary

Do these first for maximum improvement with minimum effort:

1. Add `antialias: true` and `dpr={[1, 2]}` to Canvas
2. Add `toneMapping: THREE.ACESFilmicToneMapping` to gl props
3. Use `calculateNormals(3, 30)` in Manifold for selective smooth shading
4. Increase circular segments: `setMinCircularAngle(2)` or `setCircularSegments(48)`
5. Try different Environment presets

Then if you want more:
6. Add N8AO post-processing
7. Switch to Line2/fatline for thick edges
8. Add ContactShadows

// Smooth Surfaces Showcase
// Demonstrates all new surface and curve capabilities:
// 1. variableSweep() — tapered organic tube
// 2. loftAlongSpine() — wing-like shape along a 3D curve
// 3. surfacePatch() — Coons patch filling 4 boundary curves
// 4. Smooth normals — automatic for all Manifold-backend shapes

// ─── 1. Variable Sweep: Organic Bone-Like Shape ─────────────────────────
const boneSpine = spline3d([
  [0, 0, 0],
  [15, 2, 8],
  [35, 0, 15],
  [50, -2, 10],
  [65, 0, 0],
], { tension: 0.4 });

const boneEnd = spline2d([
  [5, 3], [3, 5], [-3, 5], [-5, 3],
  [-5, -3], [-3, -5], [3, -5], [5, -3],
], { closed: true, tension: 0.5 });

const boneMid = circle2d(2.5, 20);

const bone = variableSweep(boneSpine, [
  { t: 0.0, profile: boneEnd },
  { t: 0.15, profile: boneMid },
  { t: 0.5, profile: boneMid },
  { t: 0.85, profile: boneMid },
  { t: 1.0, profile: boneEnd },
], { edgeLength: 0.6, samples: 64 });

// ─── 2. Loft Along Spine: Tapered Wing ─────────────────────────────────
const wingSpine = spline3d([
  [0, -40, 0],
  [20, -45, 5],
  [45, -55, 10],
  [60, -65, 8],
], { tension: 0.35 });

const wingRoot = spline2d([
  [8, 2], [5, 3.5], [0, 4], [-5, 3.5], [-8, 2],
  [-8, -2], [-5, -3.5], [0, -4], [5, -3.5], [8, -2],
], { closed: true, tension: 0.4 });

const wingMid = spline2d([
  [5, 1.5], [3, 2.5], [0, 3], [-3, 2.5], [-5, 1.5],
  [-5, -1.5], [-3, -2.5], [0, -3], [3, -2.5], [5, -1.5],
], { closed: true, tension: 0.4 });

const wingTip = circle2d(1.5, 16);

const wing = loftAlongSpine(
  [wingRoot, wingMid, wingTip],
  wingSpine,
  [0.0, 0.5, 1.0],
  { edgeLength: 0.6, samples: 64 },
);

// ─── 3. Surface Patch: Saddle-Shaped Panel ─────────────────────────────
const patchBottom = spline3d([
  [0, -80, 0],
  [10, -80, 4],
  [20, -80, 2],
  [30, -80, 0],
], { tension: 0.3 });

const patchTop = spline3d([
  [0, -100, 0],
  [10, -100, -2],
  [20, -100, 3],
  [30, -100, 0],
], { tension: 0.3 });

const patchLeft = spline3d([
  [0, -80, 0],
  [0, -87, 3],
  [0, -93, 2],
  [0, -100, 0],
], { tension: 0.3 });

const patchRight = spline3d([
  [30, -80, 0],
  [30, -87, -1],
  [30, -93, 1],
  [30, -100, 0],
], { tension: 0.3 });

const panel = surfacePatch({
  bottom: patchBottom,
  top: patchTop,
  left: patchLeft,
  right: patchRight,
}, { resolution: 24, thickness: 0.8 });

// ─── Return all shapes ─────────────────────────────────────────────────
return [
  { name: "Organic Bone (variableSweep)", shape: bone.color('#d4a574') },
  { name: "Tapered Wing (loftAlongSpine)", shape: wing.color('#7799bb') },
  { name: "Saddle Panel (surfacePatch)", shape: panel.color('#99bb77') },
];

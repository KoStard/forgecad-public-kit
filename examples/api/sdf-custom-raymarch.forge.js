// Custom SDF native preview — one user-authored expression drives CPU sampling
// and, when shader-safe, native raymarch preview.
//
// This returns a raw SdfShape. Do not call .toShape() here; keeping it implicit
// proves the custom function can preview through the raymarch shader.

const rippledSphere = sdf.fromFunction(
  (x, y, z, radius, frequency, amplitude) =>
    Math.hypot(x, y, z) -
    radius +
    Math.sin(x * frequency) * amplitude +
    Math.sin(y * frequency * 0.75) * amplitude * 0.55,
  {
    bounds: { min: [-18, -18, -18], max: [18, 18, 18] },
    constants: {
      radius: 12,
      frequency: 0.48,
      amplitude: 0.75,
    },
    maxStep: 0.15,
  },
)
  .color('#7cc7ff')
  .material({ roughness: 0.42, clearcoat: 0.5 });

return rippledSphere;

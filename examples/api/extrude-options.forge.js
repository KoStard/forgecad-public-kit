// Extrude options — twist, taper, center.
//
// .extrude(height) is the basic form.
// Options: { twist, divisions, scaleTop, center }

const r = param("Radius", 20, { min: 10, max: 40, unit: "mm" });
const h = param("Height", 60, { min: 20, max: 120, unit: "mm" });
const twist = param("Twist", 90, { min: 0, max: 360, unit: "°" });
const taper = param("Taper", 0.5, { min: 0.1, max: 1.0 });
const spacing = 60;

// 1. Plain extrude
const plain = ngon(6, r).extrude(h)
  .color('#4488cc');

// 2. Twisted extrude — needs divisions for smooth twist
const twisted = ngon(6, r).extrude(h, { twist: twist, divisions: 32 })
  .translate(spacing, 0, 0)
  .color('#cc8844');

// 3. Tapered extrude — scaleTop shrinks the top face
const tapered = circle2d(r).extrude(h, { scaleTop: taper })
  .translate(2 * spacing, 0, 0)
  .color('#44cc88');

// 4. Centered extrude — shape is centered along Z instead of starting at Z=0
const centered = rect(r * 1.5, r, true).extrude(h, { center: true })
  .translate(3 * spacing, 0, 0)
  .color('#cc44cc');

// 5. Combined: twist + taper
const combo = star(5, r, r * 0.5).extrude(h, {
  twist: twist,
  scaleTop: taper,
  divisions: 32,
}).translate(4 * spacing, 0, 0).color('#cccc44');

return [
  { name: "Plain", shape: plain },
  { name: "Twisted", shape: twisted },
  { name: "Tapered", shape: tapered },
  { name: "Centered (Z)", shape: centered },
  { name: "Twist + Taper", shape: combo },
];

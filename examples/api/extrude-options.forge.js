// Extrude options — twist, taper, scaleTop.
//
// .extrude(height) is the basic form.
// Options: { twist, divisions, scaleTop }

const r = Param.number("Radius", 20, { min: 10, max: 40, unit: "mm" });
const h = Param.number("Height", 60, { min: 20, max: 120, unit: "mm" });
const twist = Param.number("Twist", 90, { min: 0, max: 360, unit: "°" });
const taper = Param.number("Taper", 0.5, { min: 0.1, max: 1.0 });
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

// 4. Combined: twist + taper
const combo = star(5, r, r * 0.5).extrude(h, {
  twist: twist,
  scaleTop: taper,
  divisions: 32,
}).translate(3 * spacing, 0, 0).color('#cccc44');

return [
  { name: "Plain", shape: plain },
  { name: "Twisted", shape: twisted },
  { name: "Tapered", shape: tapered },
  { name: "Twist + Taper", shape: combo },
];

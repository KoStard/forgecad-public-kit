// attachTo() — the primary way to position parts relative to each other.
//
// Mental model: child.attachTo(parent, parentAnchor, selfAnchor, offset)
//   "Put my [selfAnchor] at the parent's [parentAnchor], then shift by [offset]"
//
// Anchor names:
//   1 word  = face center:  'top', 'bottom', 'front', 'back', 'left', 'right'
//   2 words = edge midpoint: 'top-front', 'back-left', etc.
//   3 words = corner:        'top-front-left', 'bottom-back-right', etc.

const baseW = param("Base Width", 100, { min: 50, max: 200, unit: "mm" });
const baseD = param("Base Depth", 80, { min: 40, max: 150, unit: "mm" });
const baseH = param("Base Height", 10, { min: 5, max: 30, unit: "mm" });

const base = box(baseW, baseD, baseH, true).color('#888888');

// Stack on top: column's bottom face meets base's top face
const column = cylinder(40, 8).color('#4488cc')
  .attachTo(base, 'top', 'bottom');

// Protrude from front: button's back face meets base's front face
const button = box(20, 6, 10, true).color('#cc4444')
  .attachTo(base, 'front', 'back');

// Hang below: bracket's top face meets base's bottom face
const bracket = box(30, 30, 5, true).color('#44cc44')
  .attachTo(base, 'bottom', 'top');

// Attach to side with offset: panel's left face meets base's right face,
// then shift 0mm on X, 0mm on Y, 10mm up on Z
const sidePanel = box(4, 40, 25, true).color('#cc8844')
  .attachTo(base, 'right', 'left', [0, 0, 10]);

// Corner alignment: small cube at top-front-right corner of base
const corner = box(8, 8, 8, true).color('#8844cc')
  .attachTo(base, 'top-front-right', 'bottom-back-left');

return [
  { name: "Base", shape: base },
  { name: "Column (top→bottom)", shape: column },
  { name: "Button (front→back)", shape: button },
  { name: "Bracket (bottom→top)", shape: bracket },
  { name: "Side Panel (right→left, +10Z)", shape: sidePanel },
  { name: "Corner Cube", shape: corner },
];

// clone() / duplicate() — explicit copy helpers for Shape, TrackedShape, Sketch, and ShapeGroup.

const spacing = Param.number("Spacing", 90, { min: 40, max: 180, unit: "mm" });

// --- Shape clone ---
const block = box(36, 20, 12).color("#4a90e2");
const blockL = block.clone().translate(-spacing / 2, 0, 0);
const blockR = block.duplicate().translate(spacing / 2, 0, 0);

// --- TrackedShape clone (topology preserved) ---
const post = cylinder(36, 6).color("#49b675");
const postCopy = post.clone().translate(0, 45, 0);

// --- Sketch clone ---
const slotProfile = slot(30, 10).color("#e98b39");
const slotL = slotProfile.clone().translate(-spacing / 2, -35);
const slotR = slotProfile.duplicate().translate(spacing / 2, -35);

// --- ShapeGroup clone (with named children) ---
const moduleGroup = group(
  { name: "Block", shape: block },
  { name: "Post", shape: post.attachTo(block, "top", "bottom") }
);
const moduleL = moduleGroup.clone().translate(-spacing / 2, 95, 0);
const moduleR = moduleGroup.duplicate().translate(spacing / 2, 95, 0).color("#c85a54");

return [
  { name: "Shape clone/duplicate", group: [
    { name: "Block L", shape: blockL },
    { name: "Block R", shape: blockR },
  ] },
  { name: "TrackedShape clone", shape: postCopy },
  { name: "Sketch clone/duplicate", group: [
    { name: "Slot L", sketch: slotL },
    { name: "Slot R", sketch: slotR },
  ] },
  { name: "ShapeGroup clone/duplicate", group: [
    { name: "Module L", shape: moduleL },
    { name: "Module R", shape: moduleR },
  ] },
];

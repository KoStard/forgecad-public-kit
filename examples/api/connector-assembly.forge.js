// Assembly.match() — auto-create joints from connector metadata.
//
// Demonstrates:
// - Revolute connectors on a door and frame
// - assembly.match() auto-creating a revolute joint
// - No manual addRevolute() or frame math needed

const doorW = 60, doorH = 100, doorT = 4;
const frameT = 8, frameD = 10;

// ── Door with hinge connectors ─────────────────────────────────────────────
// Hinge axes point "outward" from each part. When connectors mate,
// they meet face-to-face (anti-parallel), producing the shared rotation axis.

const door = box(doorW, doorT, doorH)
  .translate(doorW / 2, 0, 0)
  .withConnectors({
    hinge_top: connector.male("hinge_pin", {
      origin: [0, 0, doorH * 0.3],
      axis: [0, 0, -1],
      kind: "revolute",
      min: 0,
      max: 110,
    }),
    hinge_bottom: connector.male("hinge_pin", {
      origin: [0, 0, -doorH * 0.3],
      axis: [0, 0, -1],
      kind: "revolute",
      min: 0,
      max: 110,
    }),
  })
  .color("#a07040");

// ── Frame with matching hinge connectors ───────────────────────────────────

const leftPost = box(frameT, frameD, doorH + frameT)
  .translate(-(doorW / 2 + frameT / 2), 0, frameT / 4);
const rightPost = box(frameT, frameD, doorH + frameT)
  .translate(doorW / 2 + frameT / 2, 0, frameT / 4);
const lintel = box(doorW + frameT * 2, frameD, frameT)
  .translate(0, 0, doorH / 2 + frameT / 2);

const frame = union(leftPost, rightPost, lintel)
  .withConnectors({
    hinge_top: connector.female("hinge_pin", {
      origin: [-(doorW / 2), 0, doorH * 0.3],
      axis: [0, 0, 1],
      kind: "revolute",
      min: 0,
      max: 110,
    }),
    hinge_bottom: connector.female("hinge_pin", {
      origin: [-(doorW / 2), 0, -doorH * 0.3],
      axis: [0, 0, 1],
      kind: "revolute",
      min: 0,
      max: 110,
    }),
  })
  .color("#ddd8d0");

// ── Assembly with auto-created joint ───────────────────────────────────────

const mech = assembly("Door")
  .addPart("Frame", frame)
  .addPart("Door", door)
  .match("Door", "Frame", { hinge_top: "hinge_top" });

// Animate the door swing
mech.toJointsView({
  defaults: { Frame_Door_0: 0 },
  animations: [{
    name: "Open/Close",
    duration: 3,
    loop: true,
    keyframes: [
      { values: { Frame_Door_0: 0 } },
      { values: { Frame_Door_0: 90 } },
      { values: { Frame_Door_0: 0 } },
    ],
  }],
});

return mech.solve();

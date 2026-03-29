// Disassembly animation — door with hinges and bolts.
// Play "Disassemble": bolts unscrew + pull out, door slides out + swings, pins lift out.
// No manual carrier frames needed — toDisassemblyView() auto-synthesizes separation.

const doorW = 50, doorH = 100, doorT = 4;
const frameT = 6, frameD = 8;

// ── Door: left edge at local X=0 for hinge pivot alignment ──────────────────
const door = box(doorW, doorT, doorH, true)
  .translate(doorW / 2, 0, 0)
  .color('#a07040');

// ── Frame: two vertical posts + a lintel ─────────────────────────────────────
const postH = doorH + frameT;
const leftPost  = box(frameT, frameD, postH, true).translate(-(doorW / 2 + frameT / 2), 0, (postH - doorH) / 2);
const rightPost = box(frameT, frameD, postH, true).translate( (doorW / 2 + frameT / 2), 0, (postH - doorH) / 2);
const lintel    = box(doorW + frameT * 2, frameD, frameT, true).translate(0, 0, doorH / 2 + frameT / 2);
const frame = union(leftPost, rightPost, lintel).color('#ddd8d0');

// ── Hinge plates: flat plates on the door's front face near left edge ───────
const leafW = 8, leafH = 10, leafT = 1;
const hingePlate = box(leafW, leafT, leafH, true).color('#888');

// ── Frame brackets: small plates on frame post where pins mount ─────────────
const bracketW = 4;
const frameBracket = box(bracketW, leafT, leafH, true).color('#888');

// ── Pins: cylindrical, go through hinge plates vertically ───────────────────
const pinR = 1, pinH = leafH + 4;
const hingePin = cylinder(pinH, pinR, pinR, 12)
  .translate(0, 0, -pinH / 2)
  .color('#aaa');

// ── Bolts: small, shaft along -Y (into door through hinge plate) ────────────
const boltLen = leafT + 1.5;
const hingeBolt = lib.bolt(2, boltLen)
  .rotate(-90, 0, 0)
  .color('#999');

// ── Assembly ─────────────────────────────────────────────────────────────────
const mech = assembly("Door");

mech.addPart("Frame", frame);
mech.addPart("Door", door);
mech.addPart("Top Plate", hingePlate);
mech.addPart("Bot Plate", hingePlate);
mech.addPart("Top Bracket", frameBracket);
mech.addPart("Bot Bracket", frameBracket);
mech.addPart("Top Pin", hingePin);
mech.addPart("Bot Pin", hingePin);
mech.addPart("Bolt 1", hingeBolt);
mech.addPart("Bolt 2", hingeBolt);
mech.addPart("Bolt 3", hingeBolt);
mech.addPart("Bolt 4", hingeBolt);

// ── Joints (no carrier frames needed!) ───────────────────────────────────────

const topZ = doorH * 0.30;
const botZ = -doorH * 0.30;
const plateY = doorT / 2 + leafT / 2;

// Door swings on frame's left post inner edge
mech.addRevolute("doorSwing", "Frame", "Door", {
  axis: [0, 0, 1],
  origin: [-doorW / 2, 0, 0],
  min: 0, max: 120,
});

// Hinge plates fixed to door's front face
mech.addFixed("topPlateMount", "Door", "Top Plate", {
  origin: [leafW / 2, plateY, topZ],
});
mech.addFixed("botPlateMount", "Door", "Bot Plate", {
  origin: [leafW / 2, plateY, botZ],
});

// Frame brackets on frame post
mech.addFixed("topBracketMount", "Frame", "Top Bracket", {
  origin: [-(doorW / 2 + bracketW / 2), plateY, topZ],
});
mech.addFixed("botBracketMount", "Frame", "Bot Bracket", {
  origin: [-(doorW / 2 + bracketW / 2), plateY, botZ],
});

// Pins fixed to brackets
mech.addFixed("topPinMount", "Top Bracket", "Top Pin", {
  origin: [bracketW / 2, 0, 0],
});
mech.addFixed("botPinMount", "Bot Bracket", "Bot Pin", {
  origin: [bracketW / 2, 0, 0],
});

// Bolts through hinge plates into door (revolute for unscrewing)
const boltDz = 3;

mech.addRevolute("bolt1", "Top Plate", "Bolt 1", {
  axis: [0, -1, 0], origin: [0, 0, boltDz], min: 0, max: 720,
});
mech.addRevolute("bolt2", "Top Plate", "Bolt 2", {
  axis: [0, -1, 0], origin: [0, 0, -boltDz], min: 0, max: 720,
});
mech.addRevolute("bolt3", "Bot Plate", "Bolt 3", {
  axis: [0, -1, 0], origin: [0, 0, boltDz], min: 0, max: 720,
});
mech.addRevolute("bolt4", "Bot Plate", "Bolt 4", {
  axis: [0, -1, 0], origin: [0, 0, -boltDz], min: 0, max: 720,
});

// ── Disassembly — auto-generates separation + rotation animation ─────────────
const solved = mech.solve({});

mech.toDisassemblyView({
  swingAngle: 110,
  unscrewAngle: 720,
  separationDistance: 30,
  duration: 8,
});

return solved;

// Expert: M10 hex wrench — handle + U-shaped jaw
const handleLen = 120;
const handleW = 18;
const handleT = 7;
const jawAcross = 17.5; // M10 + clearance
const jawWall = 5;
const jawDepth = 20;

// Handle bar
const handle = box(handleLen, handleW, handleT, true);

// Jaw — outer block with U-shaped cutout
const jawOuter = box(jawDepth, jawAcross + jawWall * 2, handleT, true)
  .translate(handleLen / 2 + jawDepth / 2, 0, 0);
// Cutout — open on one side (U-shape)
const jawCut = box(jawDepth + 2, jawAcross, handleT + 2, true)
  .translate(handleLen / 2 + jawDepth / 2, jawWall / 2 + jawAcross / 4, 0);

return union(handle, jawOuter).subtract(jawCut);

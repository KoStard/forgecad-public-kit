const handleLength = 120;
const handleWidth = 20;
const handleThickness = 8;

const headRadius = 18;
const headThickness = 12;

const jawAF = 17.5;
const jawDepth = 14;
const jawWall = 6;
const jawAngle = 30;

const shank = box(handleLength, handleWidth, handleThickness, true)
  .translate(handleLength / 2 - 10, 0, 0);

const headBase = box(headThickness, headRadius * 2, handleThickness + 4, true)
  .translate(handleLength, 0, 0);

const jawBlank = box(jawDepth, jawAF + jawWall * 2, handleThickness + 6, true)
  .translate(handleLength + jawDepth / 2 - 2, 0, 0);

let wrench = union(shank, headBase, jawBlank);

const slot = box(jawDepth + 2, jawAF, handleThickness + 8, true)
  .translate(handleLength + jawDepth / 2 - 4, 0, 0);

const throatCut = box(jawDepth + 4, jawAF + 10, handleThickness + 10, true)
  .rotate(0, 0, jawAngle)
  .translate(handleLength + 1, 0, 0);

const mouthCut = box(jawDepth + 10, jawAF + 8, handleThickness + 10, true)
  .rotate(0, 0, -jawAngle)
  .translate(handleLength + 1, 0, 0);

const endRelief = box(10, jawAF + 14, handleThickness + 10, true)
  .translate(handleLength + 3, 0, 0);

wrench = difference(wrench, slot, throatCut, mouthCut, endRelief);

const chamferTop = box(handleLength + 20, handleWidth - 4, handleThickness + 2, true)
  .translate((handleLength - 15) / 2, 0, handleThickness / 2 + 1);

wrench = union(wrench, chamferTop);

return wrench;
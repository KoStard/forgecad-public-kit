// Full Bathroom — parametric room with fixtures
// Bathtub, sink, toilet, mirror, shower glass panel, towel rack

const roomW = param("Room Width", 2400, { min: 1800, max: 3500, unit: "mm" });
const roomD = param("Room Depth", 2000, { min: 1500, max: 3000, unit: "mm" });
const roomH = param("Room Height", 2500, { min: 2200, max: 3000, unit: "mm" });
const wallT = param("Wall Thickness", 80, { min: 50, max: 150, unit: "mm" });
const tileH = param("Tile Height", 1200, { min: 800, max: 1800, unit: "mm" });

// ─── Room shell (floor + 3 walls, front open) ───

const floor = box(roomW, roomD, wallT);
const wallBack = box(roomW, wallT, roomH).translate(0, roomD - wallT, wallT);
const wallLeft = box(wallT, roomD, roomH).translate(0, 0, wallT);
const wallRight = box(wallT, roomD, roomH).translate(roomW - wallT, 0, wallT);
const room = union(floor, wallBack, wallLeft, wallRight);

// Tile strip on back wall
const tileStrip = box(roomW - 2 * wallT, 2, tileH)
  .translate(wallT, roomD - wallT - 1, wallT);

// ─── Bathtub (left-back corner) ───

const tubL = param("Tub Length", 1500, { min: 1200, max: 1800, unit: "mm" });
const tubW = param("Tub Width", 700, { min: 550, max: 800, unit: "mm" });
const tubH = param("Tub Height", 500, { min: 400, max: 600, unit: "mm" });
const tubWall = param("Tub Wall", 40, { min: 25, max: 60, unit: "mm" });

const tubX = wallT + 20;
const tubY = roomD - wallT - tubW - 20;

const tubOuter = box(tubL, tubW, tubH);
const tubInner = box(tubL - 2 * tubWall, tubW - 2 * tubWall, tubH - tubWall)
  .translate(tubWall, tubWall, tubWall);
const tubDrain = cylinder(tubWall + 2, 25)
  .translate(tubL / 2, tubW / 2, 0);
const bathtub = tubOuter.subtract(tubInner).subtract(tubDrain)
  .translate(tubX, tubY, wallT);

// ─── Shower (above tub) ───

const glassH = param("Glass Height", 1800, { min: 1500, max: 2200, unit: "mm" });
const glassT = 8;

// Glass panel at tub edge
const showerGlass = box(glassT, tubW, glassH)
  .translate(tubX + tubL, tubY, wallT);

// Shower arm — horizontal pipe from back wall
const armLen = 250;
const showerArmX = tubX + tubL * 0.6;
const showerArmZ = wallT + glassH - 150;
const showerArm = cylinder(armLen, 12)
  .rotate(90, 0, 0)
  .translate(showerArmX, roomD - wallT, showerArmZ);

// Shower head — disc at end of arm
const showerHead = cylinder(15, 55, 55, 32)
  .translate(showerArmX, roomD - wallT - armLen, showerArmZ - 7);

const shower = union(showerArm, showerHead);

// ─── Toilet (right side, against back wall) ───

const toiletW = param("Toilet Width", 380, { min: 340, max: 420, unit: "mm" });
const toiletD = param("Toilet Depth", 650, { min: 550, max: 750, unit: "mm" });
const toiletH = 400;

const toiletX = roomW - wallT - toiletW - 150;
const toiletY = roomD - wallT - toiletD - 20;
const toiletCX = toiletX + toiletW / 2;
const toiletCY = toiletY + toiletD * 0.4; // bowl center forward of midpoint

// Bowl — tapered cylinder, hollowed
const bowlR = toiletW / 2;
const bowlOuter = cylinder(toiletH, bowlR, bowlR * 0.85, 32);
const bowlInner = cylinder(toiletH - 40, bowlR - 30, bowlR * 0.85 - 30, 32)
  .translate(0, 0, 40);
const bowl = bowlOuter.subtract(bowlInner)
  .translate(toiletCX, toiletCY, wallT);

// Tank — box behind the bowl
const tankW = toiletW * 0.85;
const tankD = 150;
const tankH = 320;
const tank = box(tankW, tankD, tankH, true)
  .translate(toiletCX, toiletY + toiletD - tankD / 2 - 10, wallT + toiletH / 2 + tankH / 2 - 80);

// Lid — flat slab on top of tank
const lid = box(tankW + 10, tankD + 10, 15, true)
  .translate(toiletCX, toiletY + toiletD - tankD / 2 - 10, wallT + toiletH / 2 + tankH - 80 + 7);

// Seat — flat ring on top of bowl
const seatOuter = cylinder(18, bowlR - 5, bowlR * 0.85 - 5, 32);
const seatInner = cylinder(20, bowlR - 30, bowlR * 0.85 - 30, 32).translate(0, 0, -1);
const seat = seatOuter.subtract(seatInner)
  .translate(toiletCX, toiletCY, wallT + toiletH - 18);

const toilet = union(bowl, tank, lid, seat);

// ─── Sink (right wall, facing into room) ───

const sinkW = param("Sink Width", 550, { min: 400, max: 700, unit: "mm" });
const sinkD = 420;
const sinkH = 160;
const sinkZ = 850;

// Sink centered on right wall, facing left (into room)
const sinkCX = roomW - wallT - sinkD / 2 - 30;
const sinkCY = roomD * 0.35;

const basinOuter = box(sinkD, sinkW, sinkH, true);
const basinInner = box(sinkD - 50, sinkW - 50, sinkH - 25, true).translate(0, 0, 12);
const drain = cylinder(27, 18).translate(0, 0, -sinkH / 2);
const basin = basinOuter.subtract(basinInner).subtract(drain)
  .translate(sinkCX, sinkCY, wallT + sinkZ + sinkH / 2);

// Pedestal
const pedestal = box(80, 80, sinkZ, true)
  .translate(sinkCX, sinkCY, wallT + sinkZ / 2);

// Faucet — vertical stem + curved spout
const faucetX = sinkCX + sinkD / 2 - 40;
const faucetZ = wallT + sinkZ + sinkH;
const faucetStem = cylinder(100, 10)
  .translate(faucetX, sinkCY, faucetZ);
const faucetSpout = box(80, 16, 16, true)
  .translate(faucetX - 40, sinkCY, faucetZ + 100);
// Handles
const handleL = box(30, 8, 8, true)
  .translate(faucetX, sinkCY - 30, faucetZ + 50);
const handleR = box(30, 8, 8, true)
  .translate(faucetX, sinkCY + 30, faucetZ + 50);

const sink = union(basin, pedestal, faucetStem, faucetSpout, handleL, handleR);

// ─── Mirror (on right wall, above sink) ───

const mirrorW = param("Mirror Width", 600, { min: 400, max: 900, unit: "mm" });
const mirrorH = param("Mirror Height", 800, { min: 500, max: 1200, unit: "mm" });
const mirrorT = 5;
const frameW = 15;

const mirrorZ = wallT + sinkZ + sinkH + 150;
const mirrorCY = sinkCY;

// Frame — flat rectangle with cutout
const frameOuter = box(frameW, mirrorW + 2 * frameW, mirrorH + 2 * frameW);
const frameInner = box(frameW + 2, mirrorW, mirrorH).translate(-1, frameW, frameW);
const frame = frameOuter.subtract(frameInner)
  .translate(roomW - wallT - frameW, mirrorCY - mirrorW / 2 - frameW, mirrorZ);

// Mirror surface
const mirrorSurface = box(mirrorT, mirrorW, mirrorH)
  .translate(roomW - wallT - mirrorT - 1, mirrorCY - mirrorW / 2, mirrorZ);

// ─── Towel rack (left wall) ───

const rackZ = 1100;
const rackLen = 600;
const barR = 8;
const bracketSize = 25;
const rackY = roomD * 0.4;

const bracketL = box(70, bracketSize, bracketSize)
  .translate(wallT, rackY - rackLen / 2, wallT + rackZ);
const bracketR = box(70, bracketSize, bracketSize)
  .translate(wallT, rackY + rackLen / 2 - bracketSize, wallT + rackZ);
const towelBar = cylinder(rackLen - bracketSize * 2, barR)
  .rotate(90, 0, 0)
  .translate(wallT + 50, rackY - rackLen / 2 + bracketSize, wallT + rackZ + bracketSize / 2);

const towelRack = union(bracketL, bracketR, towelBar);

// ─── Bath mat (in front of tub) ───

const matW = 700;
const matD = 450;
const matH = 8;
const bathMat = box(matW, matD, matH, true)
  .translate(tubX + tubL / 2, tubY - matD / 2 - 30, wallT + matH / 2);

// ─── Assemble ───

return [
  { name: "Room",         shape: room,          color: "#e8e0d4" },
  { name: "Tile Strip",   shape: tileStrip,     color: "#5a8a9a" },
  { name: "Bathtub",      shape: bathtub,       color: "#f0f0f0" },
  { name: "Shower Glass", shape: showerGlass,   color: "#aaddee" },
  { name: "Shower Head",  shape: shower,        color: "#b0b0b0" },
  { name: "Toilet",       shape: toilet,        color: "#f5f5f0" },
  { name: "Sink",         shape: sink,          color: "#f0f0f0" },
  { name: "Mirror Frame", shape: frame,         color: "#2a2a2a" },
  { name: "Mirror",       shape: mirrorSurface, color: "#b8ccd8" },
  { name: "Towel Rack",   shape: towelRack,     color: "#707070" },
  { name: "Bath Mat",     shape: bathMat,       color: "#6b9e7a" },
];

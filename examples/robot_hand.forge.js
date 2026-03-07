// Parametric Robot Hand
// Design goals:
// 1) Home-buildable with FDM printing + metal pins + cord tendon
// 2) Clear mechanics: clevis joints, hinge pins, tendon guides, soft pads
// 3) Mount included: base, mast, wrist clevis
// 4) Iterative construction: build primitives -> segments -> fingers -> full assembly

const grip = param("Grip", 55, { min: 0, max: 100, unit: "%" });
const fingerSpread = param("Finger Spread", 18, { min: 0, max: 35, unit: "°" });
const thumbOpposition = param("Thumb Opposition", 42, { min: 20, max: 70, unit: "°" });
const wristPitch = param("Wrist Pitch", 8, { min: -35, max: 45, unit: "°" });
const explode = param("Explode", 0, { min: 0, max: 26, unit: "mm" });

const scale = param("Scale", 1.0, { min: 0.75, max: 1.25, step: 0.01 });
const pinD = param("Pin Diameter", 3.2, { min: 2.0, max: 5.0, step: 0.1, unit: "mm" }) * scale;
const jointClearance = param("Joint Clearance", 0.32, { min: 0.2, max: 0.7, step: 0.02, unit: "mm" }) * scale;
const wall = param("Min Wall", 2.4, { min: 1.6, max: 4.0, step: 0.1, unit: "mm" }) * scale;

// Core hand dimensions
const palmW = 84 * scale;
const palmD = 76 * scale;
const palmT = 18 * scale;

const fingerCount = 4;
const fingerWidths = [15, 16, 15, 14].map(v => v * scale);
const fingerLengths = [
  [36, 25, 19],
  [39, 28, 21],
  [37, 27, 20],
  [31, 23, 18],
].map(row => row.map(v => v * scale));

const thumbWidth = 16 * scale;
const thumbLengths = [31, 25, 20].map(v => v * scale);

const lugGap = pinD + 2.3 * jointClearance;
const lugWidth = Math.max(wall * 1.4, (thumbWidth - lugGap) * 0.45);
const lugDepth = Math.max(9 * scale, pinD * 2.7);
const segmentThick = 14 * scale;
const pinR = pinD * 0.5;

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function rad(deg) {
  return deg * Math.PI / 180;
}

function rotateZ2D(x, y, deg) {
  const a = rad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

function localToWorld(localPt, basePt, yawDeg) {
  const [rx, ry] = rotateZ2D(localPt[0], localPt[1], yawDeg);
  return [basePt[0] + rx, basePt[1] + ry, basePt[2] + localPt[2]];
}

// Clevis mount with pin bore centered at origin
function makeClevis(width, height, depth, gap, lugW, boreR) {
  const left = box(lugW, depth, height, true).translate(-(gap * 0.5 + lugW * 0.5), -depth * 0.5, 0);
  const right = box(lugW, depth, height, true).translate(gap * 0.5 + lugW * 0.5, -depth * 0.5, 0);
  const bridge = box(width, depth * 0.55, height * 0.55, true).translate(0, -depth * 0.78, 0);
  const raw = union(left, right, bridge);
  const bore = cylinder(width + 2, boreR).pointAlong([1, 0, 0]);
  return raw.subtract(bore);
}

// Single-lug hinge ear centered at origin, extending +Y
function makeHingeEar(width, height, depth, boreR) {
  const ear = union(
    cylinder(width * 0.62, height * 0.45).pointAlong([1, 0, 0]).translate(0, 0, 0),
    box(width * 0.62, depth * 0.9, height * 0.85, true).translate(0, depth * 0.45, 0)
  );
  const bore = cylinder(width + 2, boreR).pointAlong([1, 0, 0]);
  return ear.subtract(bore);
}

// Printable phalanx: base ear + body + optional front clevis + tendon channel
function makePhalanxPart(length, width, thick, hasFrontClevis, frontScale = 1.0) {
  const body = roundedRect(width * 0.72, length, Math.max(2.0 * scale, width * 0.12), true)
    .extrude(thick * 0.82, { center: true })
    .translate(0, length * 0.5, 0);

  const baseEar = makeHingeEar(width, thick, lugDepth, pinR + jointClearance * 0.6)
    .translate(0, 0, 0);

  const topRib = box(width * 0.36, length * 0.72, thick * 0.22, true).translate(0, length * 0.52, thick * 0.28);
  const bottomRib = box(width * 0.36, length * 0.72, thick * 0.18, true).translate(0, length * 0.52, -thick * 0.28);

  let part = union(body, baseEar, topRib, bottomRib);

  if (hasFrontClevis) {
    const frontW = width * frontScale;
    const frontClevis = makeClevis(frontW, thick * 0.9, lugDepth * 0.95, lugGap, lugWidth, pinR + jointClearance * 0.7)
      .translate(0, length, 0);
    part = union(part, frontClevis);
  } else {
    const tipCap = sphere(width * 0.28).scale([1.0, 1.35, 0.75]).translate(0, length + width * 0.15, 0);
    part = union(part, tipCap);
  }

  const tendonChannel = cylinder(length + lugDepth * 0.8, Math.max(1.3 * scale, pinR * 0.55))
    .pointAlong([0, 1, 0])
    .translate(0, length * 0.55, thick * 0.1);

  return part.subtract(tendonChannel);
}

function jointAnglesFromGrip(gripPercent, isThumb) {
  const g = clamp(gripPercent / 100, 0, 1);
  if (isThumb) {
    return [
      8 + g * 40,
      10 + g * 55,
      8 + g * 62,
    ];
  }
  return [
    6 + g * 46,
    10 + g * 64,
    6 + g * 58,
  ];
}

function makeFingerAssembly(opts) {
  const {
    name,
    basePivot,
    yawDeg,
    widths,
    lengths,
    angles,
    color,
    isThumb,
    showCable,
  } = opts;

  const parts = [];
  const pivots = [];
  const localTipPts = [];

  let accum = 0;
  let py = 0;
  let pz = 0;

  for (let i = 0; i < lengths.length; i += 1) {
    const segLen = lengths[i];
    const segW = widths[i];
    const hasFront = i < lengths.length - 1;
    const a = angles[i] || 0;
    accum += a;
    const localPart = makePhalanxPart(segLen, segW, segmentThick * (isThumb ? 0.9 : 1.0), hasFront, 0.94);

    const worldBase = localToWorld([0, py, pz], basePivot, yawDeg);
    const part = localPart
      .rotate(accum, 0, 0)
      .rotate(0, 0, yawDeg)
      .translate(worldBase[0], worldBase[1], worldBase[2])
      .translate(0, 0, explode * i * 0.08);

    parts.push({
      name: `${name} Segment ${i + 1}`,
      shape: part.color(color),
    });

    const pinLen = segW + wall * 2.4;
    const pin = cylinder(pinLen, pinR * 0.92)
      .pointAlong([1, 0, 0])
      .rotate(0, 0, yawDeg)
      .translate(worldBase[0], worldBase[1], worldBase[2])
      .translate(0, 0, explode * i * 0.08)
      .color('#B0B7C3');

    parts.push({
      name: `${name} Pin ${i + 1}`,
      shape: pin,
    });

    pivots.push(worldBase);

    py += segLen * Math.cos(rad(accum));
    pz += segLen * Math.sin(rad(accum));
    localTipPts.push(localToWorld([0, py, pz], basePivot, yawDeg));
  }

  const pad = sphere(widths[widths.length - 1] * 0.34)
    .scale([1, 1.25, 0.7])
    .translate(localTipPts[localTipPts.length - 1][0], localTipPts[localTipPts.length - 1][1], localTipPts[localTipPts.length - 1][2])
    .translate(0, 0, -widths[widths.length - 1] * 0.08)
    .color('#2E2E2E');

  parts.push({ name: `${name} Soft Pad`, shape: pad });

  if (showCable) {
    let cable = null;
    const cableR = Math.max(0.6 * scale, pinR * 0.3);
    for (let i = 0; i < pivots.length - 1; i += 1) {
      const a = pivots[i];
      const b = pivots[i + 1];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const dz = b[2] - a[2];
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const seg = cylinder(len, cableR)
        .pointAlong([dx, dy, dz])
        .translate(a[0], a[1], a[2] + segmentThick * 0.28);
      cable = cable ? union(cable, seg) : seg;
    }
    if (cable) {
      parts.push({ name: `${name} Tendon`, shape: cable.color('#D77C2D') });
    }
  }

  return parts;
}

// Build palm with integrated finger clevises and wrist lug
function makePalm() {
  const palmCore = roundedRect(palmW, palmD, 10 * scale, true).extrude(palmT, { center: true })
    .translate(0, palmD * 0.5, 0);

  const palmHoles = union(
    slot(palmW * 0.32, palmD * 0.16).translate(0, palmD * 0.5).extrude(palmT + 2, { center: true }),
    circle2d(palmW * 0.11).translate(-palmW * 0.23, palmD * 0.56).extrude(palmT + 2, { center: true }),
    circle2d(palmW * 0.10).translate(palmW * 0.24, palmD * 0.42).extrude(palmT + 2, { center: true })
  );

  let palm = palmCore.subtract(palmHoles);

  const spacing = palmW / (fingerCount + 1);
  for (let i = 0; i < fingerCount; i += 1) {
    const x = -palmW * 0.5 + spacing * (i + 1);
    const clevis = makeClevis(
      fingerWidths[i] * 0.98,
      segmentThick * 0.88,
      lugDepth,
      lugGap,
      lugWidth,
      pinR + jointClearance
    ).translate(x, palmD, segmentThick * 0.08);
    palm = union(palm, clevis);
  }

  const thumbClevis = makeClevis(thumbWidth, segmentThick * 0.86, lugDepth, lugGap, lugWidth, pinR + jointClearance)
    .rotate(0, 0, -thumbOpposition)
    .translate(palmW * 0.45, palmD * 0.24, 0);

  const wristEar = makeHingeEar(palmW * 0.45, segmentThick, lugDepth * 1.05, pinR + jointClearance)
    .rotate(0, 180, 0)
    .translate(0, 0, 0);

  palm = union(palm, thumbClevis, wristEar);

  return palm.color('#D9D6CF');
}

// Build mount: printable base + mast + wrist clevis
function makeMount() {
  const baseW = 126 * scale;
  const baseD = 108 * scale;
  const baseT = 9 * scale;
  const mastW = 28 * scale;
  const mastD = 34 * scale;
  const mastH = 86 * scale;

  let base = roundedRect(baseW, baseD, 8 * scale, true).extrude(baseT, { center: true }).translate(0, -36 * scale, -mastH * 0.52);

  const slotSketchA = slot(20 * scale, 7 * scale).translate(-baseW * 0.28, -36 * scale);
  const slotSketchB = slot(20 * scale, 7 * scale).translate(baseW * 0.28, -36 * scale);
  const slotSketchC = slot(20 * scale, 7 * scale).translate(0, -36 * scale - baseD * 0.22);
  const slotSketchD = slot(20 * scale, 7 * scale).translate(0, -36 * scale + baseD * 0.22);
  const slots = union(
    slotSketchA.extrude(baseT + 2, { center: true }).translate(0, 0, -mastH * 0.52),
    slotSketchB.extrude(baseT + 2, { center: true }).translate(0, 0, -mastH * 0.52),
    slotSketchC.extrude(baseT + 2, { center: true }).translate(0, 0, -mastH * 0.52),
    slotSketchD.extrude(baseT + 2, { center: true }).translate(0, 0, -mastH * 0.52)
  );
  base = base.subtract(slots);

  const mast = box(mastW, mastD, mastH, true).translate(0, -8 * scale, -mastH * 0.02);
  const gussetL = polygon([[0, 0], [26 * scale, 0], [0, 28 * scale]])
    .extrude(6 * scale, { center: true })
    .rotate(90, 0, 90)
    .translate(-mastW * 0.5 - 3 * scale, -18 * scale, -mastH * 0.28);
  const gussetR = gussetL.mirror([1, 0, 0]);

  const wristClevis = makeClevis(palmW * 0.54, segmentThick * 0.98, lugDepth * 1.05, lugGap, lugWidth * 1.1, pinR + jointClearance)
    .translate(0, 0, 0);

  const wristPin = cylinder(palmW * 0.65, pinR * 0.96)
    .pointAlong([1, 0, 0])
    .translate(0, 0, 0)
    .color('#B0B7C3');

  return {
    base: base.color('#646B73'),
    mast: union(mast, gussetL, gussetR).color('#7A828A'),
    wristClevis: wristClevis.color('#838B92'),
    wristPin,
  };
}

// 1) Mount (fixed reference)
const mount = makeMount();

// 2) Palm (mechanical hub)
const palm = makePalm();

// 3) Fingers (iterative generation)
const handParts = [];

const spacing = palmW / (fingerCount + 1);
for (let i = 0; i < fingerCount; i += 1) {
  const x = -palmW * 0.5 + spacing * (i + 1);
  const side = (i - (fingerCount - 1) * 0.5) / ((fingerCount - 1) * 0.5);
  const yaw = -side * (fingerSpread * 0.5);
  const baseAngles = jointAnglesFromGrip(grip, false);

  const finger = makeFingerAssembly({
    name: `Finger ${i + 1}`,
    basePivot: [x, palmD, segmentThick * 0.08],
    yawDeg: yaw,
    widths: [fingerWidths[i], fingerWidths[i] * 0.92, fingerWidths[i] * 0.86],
    lengths: fingerLengths[i],
    angles: baseAngles,
    color: ['#AAB7C6', '#B8C5D3', '#C4D1DB', '#9FB0C0'][i],
    isThumb: false,
    showCable: i === 1 || i === 2,
  });

  for (const p of finger) {
    handParts.push(p);
  }
}

// 4) Thumb (separate kinematic chain)
const thumbAngles = jointAnglesFromGrip(grip * 0.95 + 5, true);
const thumb = makeFingerAssembly({
  name: "Thumb",
  basePivot: [palmW * 0.45, palmD * 0.24, 0],
  yawDeg: -thumbOpposition,
  widths: [thumbWidth, thumbWidth * 0.92, thumbWidth * 0.86],
  lengths: thumbLengths,
  angles: thumbAngles,
  color: '#B7B9C9',
  isThumb: true,
  showCable: true,
});

for (const p of thumb) {
  handParts.push(p);
}

// 5) Wrist articulation: rotate all hand components around wrist pin axis
const wristRotated = [];

wristRotated.push({ name: "Palm", shape: palm.rotateAround([1, 0, 0], wristPitch, [0, 0, 0]) });

for (const p of handParts) {
  wristRotated.push({
    name: p.name,
    shape: p.shape.rotateAround([1, 0, 0], wristPitch, [0, 0, 0]),
  });
}

// 6) Return full inspectable assembly (colors preserved by separate objects)
return [
  { name: "Mount Base", shape: mount.base },
  { name: "Mount Mast", shape: mount.mast },
  { name: "Wrist Clevis", shape: mount.wristClevis },
  { name: "Wrist Pin", shape: mount.wristPin },
  ...wristRotated,
];


/**
 * 
* Make a fully functional robot hand. Should be easy to build, maybe even at home with some good tools. Show all the mechanics. Should be able to hold arbitrary shape
objects. Don't be a perfectionist, but be an artist and an engineer.
Make sure each component can be manufactured.
It should be mounted somewhere.
Make it controllable through params.
As this is a complex task, break it down to simpler ones, solve them, combine, iterate.
Read docs/permanent/API/model-building/README.md and examples/api/* to learn about ForgeCAD.
Call it examples/robot_hand.forge.js
Don't read any other files in the project, no other examples. It's an isolated experiment.
Make it reliable, easy to 3D print, robust.
Use iterative logic in the code.
 */

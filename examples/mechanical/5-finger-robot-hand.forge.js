// Robot Hand — functional, buildable concept
// Z-up, Y depth (front = -Y)

const scale = Param.number("Scale", 1.0, { min: 0.7, max: 1.3, step: 0.05 });
const curl = Param.number("Finger Curl", 40, { min: 0, max: 70, unit: "°" });
const thumbCurl = Param.number("Thumb Curl", 35, { min: 0, max: 70, unit: "°" });
const spread = Param.number("Finger Spread", 8, { min: 0, max: 20, unit: "°" });

// --- Dimensions ---
const palmW = 90 * scale;
const palmD = 70 * scale;
const palmH = 18 * scale;
const fingerT = 12 * scale;
const gap = 2 * scale;

const baseY = -palmD / 2 - gap;
const baseZ = palmH / 2 + fingerT / 2 + 2 * scale;

// --- Colors ---
const colors = {
    palm: '#d8cbb2',
    palmPad: '#2a2a2a',
    knuckle: '#aaaaaa',
    wrist: '#666666',
    motor: '#444444',
    spool: '#cc9933',
    segment: '#e6e6e6',
    pad: '#222222',
    pin: '#9aa1a8',
    tendon: '#c9a227',
    cable: '#999999',
};

// --- Helper functions ---
function rotX(p, pivot, deg) {
    const rad = deg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const x = p[0] - pivot[0];
    const y = p[1] - pivot[1];
    const z = p[2] - pivot[2];
    const y2 = y * cos - z * sin;
    const z2 = y * sin + z * cos;
    return [pivot[0] + x, pivot[1] + y2, pivot[2] + z2];
}

function centerOf(shape) {
    const bb = shape.boundingBox();
    return [
        (bb.min[0] + bb.max[0]) / 2,
        (bb.min[1] + bb.max[1]) / 2,
        (bb.min[2] + bb.max[2]) / 2,
    ];
}

// --- Finger builder ---
function makeFinger(opts) {
    const {
        name,
        base,
        lengths,
        widths,
        thickness,
        angles,
        yaw = 0,
        colors,
    } = opts;

    const [L1, L2, L3] = lengths;
    const [W1, W2, W3] = widths;
    const t = thickness;
    const [a1, a2, a3] = angles;

    const basePivot = base;
    const midPivot0 = [basePivot[0], basePivot[1] - L1, basePivot[2]];
    const tipPivot0 = [basePivot[0], basePivot[1] - L1 - L2, basePivot[2]];

    // Straight segments in world space
    let s1 = box(W1, L1, t)
        .translate(basePivot[0], basePivot[1] - L1 / 2, basePivot[2])
        .color(colors.segment);
    let s2 = box(W2, L2, t)
        .translate(basePivot[0], basePivot[1] - L1 - L2 / 2, basePivot[2])
        .color(colors.segment);
    let s3 = box(W3, L3, t)
        .translate(basePivot[0], basePivot[1] - L1 - L2 - L3 / 2, basePivot[2])
        .color(colors.segment);

    // Pads (rubber contact)
    const padT = t * 0.18;
    let pad1 = box(W1 * 0.7, L1 * 0.45, padT)
        .color(colors.pad)
        .onFace(s1, 'bottom', { v: -L1 * 0.15, protrude: padT / 2 });
    let pad2 = box(W2 * 0.65, L2 * 0.45, padT)
        .color(colors.pad)
        .onFace(s2, 'bottom', { v: -L2 * 0.15, protrude: padT / 2 });
    let pad3 = box(W3 * 0.8, L3 * 0.6, padT)
        .color(colors.pad)
        .onFace(s3, 'bottom', { v: -L3 * 0.1, protrude: padT / 2 });

    // Tendon guides (raised top rails)
    const rodT = t * 0.12;
    let rod1 = box(W1 * 0.2, L1 * 0.9, rodT)
        .color(colors.tendon)
        .onFace(s1, 'top', { v: -L1 * 0.05, protrude: rodT / 2 });
    let rod2 = box(W2 * 0.2, L2 * 0.9, rodT)
        .color(colors.tendon)
        .onFace(s2, 'top', { v: -L2 * 0.05, protrude: rodT / 2 });
    let rod3 = box(W3 * 0.2, L3 * 0.85, rodT)
        .color(colors.tendon)
        .onFace(s3, 'top', { v: -L3 * 0.05, protrude: rodT / 2 });

    // Pivots after rotation
    const midPivot1 = rotX(midPivot0, basePivot, a1);
    const tipPivot1 = rotX(tipPivot0, basePivot, a1);
    const tipPivot2 = rotX(tipPivot1, midPivot1, a2);

    const seg1 = (shape) => shape.rotateAroundAxis([1, 0, 0], a1, basePivot);
    const seg2 = (shape) => shape
        .rotateAroundAxis([1, 0, 0], a1, basePivot)
        .rotateAroundAxis([1, 0, 0], a2, midPivot1);
    const seg3 = (shape) => shape
        .rotateAroundAxis([1, 0, 0], a1, basePivot)
        .rotateAroundAxis([1, 0, 0], a2, midPivot1)
        .rotateAroundAxis([1, 0, 0], a3, tipPivot2);

    s1 = seg1(s1); s2 = seg2(s2); s3 = seg3(s3);
    pad1 = seg1(pad1); pad2 = seg2(pad2); pad3 = seg3(pad3);
    rod1 = seg1(rod1); rod2 = seg2(rod2); rod3 = seg3(rod3);

    // Joint pins
    const pinLen = Math.max(W1, W2, W3) + 8 * scale;
    const pinR = t * 0.15;
    const pinBase = cylinder(pinLen, pinR).pointAlong([1, 0, 0]).color(colors.pin);
    let pin1 = pinBase.translate(basePivot[0] - pinLen / 2, basePivot[1], basePivot[2]);
    let pin2 = pinBase.translate(midPivot1[0] - pinLen / 2, midPivot1[1], midPivot1[2]);
    let pin3 = pinBase.translate(tipPivot2[0] - pinLen / 2, tipPivot2[1], tipPivot2[2]);

    // Yoke block at base
    let yoke = box(W1 * 1.1, 6 * scale, t * 0.8)
        .translate(basePivot[0], basePivot[1] + 3 * scale, basePivot[2])
        .color(colors.knuckle);
    yoke = seg1(yoke);

    // Apply yaw (splay)
    if (yaw !== 0) {
        const yawRot = (shape) => shape.rotateAroundAxis([0, 0, 1], yaw, basePivot);
        s1 = yawRot(s1); s2 = yawRot(s2); s3 = yawRot(s3);
        pad1 = yawRot(pad1); pad2 = yawRot(pad2); pad3 = yawRot(pad3);
        rod1 = yawRot(rod1); rod2 = yawRot(rod2); rod3 = yawRot(rod3);
        pin1 = yawRot(pin1); pin2 = yawRot(pin2); pin3 = yawRot(pin3);
        yoke = yawRot(yoke);
    }

    return {
        name,
        group: [
            { name: `${name} Prox`, shape: s1 },
            { name: `${name} Mid`, shape: s2 },
            { name: `${name} Tip`, shape: s3 },
            { name: `${name} Pad 1`, shape: pad1 },
            { name: `${name} Pad 2`, shape: pad2 },
            { name: `${name} Pad 3`, shape: pad3 },
            { name: `${name} Tendon 1`, shape: rod1 },
            { name: `${name} Tendon 2`, shape: rod2 },
            { name: `${name} Tendon 3`, shape: rod3 },
            { name: `${name} Pin Base`, shape: pin1 },
            { name: `${name} Pin Mid`, shape: pin2 },
            { name: `${name} Pin Tip`, shape: pin3 },
            { name: `${name} Yoke`, shape: yoke },
        ],
    };
}

// --- Palm assembly ---
const palm = box(palmW, palmD, palmH).color(colors.palm);
const palmPad = box(palmW * 0.6, 3 * scale, palmH * 0.5)
    .color(colors.palmPad)
    .onFace(palm, 'front', { v: -palmH * 0.05, protrude: 1 * scale });

const knuckleBar = box(palmW * 0.9, 10 * scale, 6 * scale)
    .color(colors.knuckle)
    .onFace(palm, 'top', { v: -palmD / 2 + 8 * scale, protrude: 3 * scale });

const wristLen = 60 * scale;
const wristR = 14 * scale;
const wrist = cylinder(wristLen, wristR)
    .pointAlong([0, 1, 0])
    .color(colors.wrist)
    .attachTo(palm, 'back', 'front', [0, 0, -palmH * 0.2]);

const motorW = 40 * scale;
const motorD = 28 * scale;
const motorH = 20 * scale;
const motor = box(motorW, motorD, motorH)
    .color(colors.motor)
    .attachTo(palm, 'bottom', 'top', [0, palmD / 2 - motorD / 2 - 4 * scale, -2 * scale]);

const spoolLen = palmW * 0.7;
const spoolR = 6 * scale;
const spool = cylinder(spoolLen, spoolR)
    .pointAlong([1, 0, 0])
    .color(colors.spool)
    .attachTo(motor, 'top', 'bottom', [0, -motorD * 0.25, spoolR * 0.2]);

// --- Fingers ---
const fingerDefs = [
    { name: 'Index', x: -palmW * 0.28, lengths: [32, 24, 18], widths: [16, 14, 13], yaw: -spread * 0.4 },
    { name: 'Middle', x: -palmW * 0.08, lengths: [35, 26, 20], widths: [17, 15, 14], yaw: -spread * 0.15 },
    { name: 'Ring', x: palmW * 0.12, lengths: [33, 24, 19], widths: [16, 14, 13], yaw: spread * 0.2 },
    { name: 'Pinky', x: palmW * 0.30, lengths: [28, 20, 16], widths: [14, 12, 11], yaw: spread * 0.45 },
];

const fingerGroups = fingerDefs.map(def => makeFinger({
    name: def.name,
    base: [def.x, baseY, baseZ],
    lengths: def.lengths.map(v => v * scale),
    widths: def.widths.map(v => v * scale),
    thickness: fingerT,
    angles: [curl * 0.6, curl * 0.9, curl * 1.1],
    yaw: def.yaw,
    colors,
}));

// Thumb (angled, shorter)
const thumb = makeFinger({
    name: 'Thumb',
    base: [-palmW * 0.45, -palmD * 0.1, baseZ - fingerT * 0.2],
    lengths: [26, 18, 14].map(v => v * scale),
    widths: [18, 16, 14].map(v => v * scale),
    thickness: fingerT * 0.9,
    angles: [thumbCurl * 0.6, thumbCurl * 0.8, thumbCurl * 0.9],
    yaw: -50,
    colors,
});

// --- Tendon cables from spool to finger bases ---
const spoolCenter = centerOf(spool);
const spoolBB = spool.boundingBox();
const cableR = 1.2 * scale;
const cableTopZ = palmH / 2 + fingerT + 20 * scale;

const fingerBases = [
    ...fingerDefs.map(def => [def.x, baseY, baseZ]),
    [-palmW * 0.45, -palmD * 0.1, baseZ - fingerT * 0.2],
];

const cableCount = fingerBases.length;
const cables = fingerBases.map((end, i) => {
    const t = (i + 1) / (cableCount + 1);
    const startX = spoolBB.min[0] + t * (spoolBB.max[0] - spoolBB.min[0]);
    const start = [startX, spoolCenter[1], spoolCenter[2] + spoolR * 0.8];
    const midBack = [startX, palmD / 2 + 6 * scale, cableTopZ];
    const midPalm = [end[0], 0, cableTopZ];
    const endPt = [end[0], end[1] + 6 * scale, end[2] + fingerT * 0.6];

    return lib.pipeRoute([start, midBack, midPalm, endPt], cableR, { bendRadius: 10 * scale })
        .color(colors.cable);
});

// --- Grasp target object ---
const graspObject = union(
    sphere(18 * scale).translate(0, baseY - 45 * scale, baseZ + 6 * scale),
    box(32 * scale, 20 * scale, 26 * scale).translate(12 * scale, baseY - 65 * scale, baseZ + 2 * scale)
).color('#88ccee');

// --- Return scene ---
return [
    {
        name: 'Palm Assembly', group: [
            { name: 'Palm', shape: palm },
            { name: 'Palm Grip', shape: palmPad },
            { name: 'Knuckle Bar', shape: knuckleBar },
            { name: 'Wrist', shape: wrist },
            { name: 'Motor', shape: motor },
            { name: 'Spool', shape: spool },
            ...cables.map((c, i) => ({ name: `Cable ${i + 1}`, shape: c })),
        ]
    },
    ...fingerGroups,
    thumb,
    //   { name: 'Grasp Object', shape: graspObject },
];

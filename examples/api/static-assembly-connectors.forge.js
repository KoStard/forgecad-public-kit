// Static assembly via connectors: a simple slatted bench frame.
//
// This example is intentionally not a mechanism. Its job is to show that
// connectors are the default way to assemble any fixed multi-part object whose
// parts are meant to stay touching in the final model.

const benchLength = param("Bench Length", 220, { min: 160, max: 320, unit: "mm" });
const benchWidth = param("Bench Width", 80, { min: 60, max: 140, unit: "mm" });
const railHeight = param("Rail Height", 18, { min: 12, max: 26, unit: "mm" });
const legHeight = param("Leg Height", 52, { min: 36, max: 90, unit: "mm" });
const slatCount = param("Slat Count", 4, { min: 3, max: 6, integer: true });

const railThickness = 12;
const legSize = 14;
const slatThickness = 10;
const slatWidth = 18;
const railY = benchWidth / 2 - railThickness / 2;
const legInset = 26;
const supportXs = Array.from({ length: slatCount }, (_, i) =>
  slatCount === 1
    ? 0
    : -benchLength / 2 + legInset + ((benchLength - legInset * 2) * i) / (slatCount - 1)
);

function makeRail(sign) {
  return box(benchLength, railThickness, railHeight)
    .translate(0, sign * railY, 0)
    .withConnectors(
      Object.fromEntries(
        supportXs.map((x, i) => [
          `leg_${i}`,
          connector.female("leg-seat", {
            origin: [x, sign * railY, 0],
            axis: [0, 0, -1],
            up: [1, 0, 0],
          }),
        ])
      )
    )
    .withConnectors({
      ...Object.fromEntries(
        supportXs.map((x, i) => [
          `slat_${i}`,
          connector.female("slat-seat", {
            origin: [x, sign * railY, railHeight],
            axis: [0, 0, 1],
            up: [1, 0, 0],
          }),
        ])
      ),
    });
}

function makeLeg() {
  return box(legSize, legSize, legHeight).withConnectors({
    head: connector.male("leg-seat", {
      origin: [0, 0, legHeight],
      axis: [0, 0, 1],
      up: [1, 0, 0],
    }),
  });
}

function makeSlat() {
  return box(slatWidth, benchWidth, slatThickness).withConnectors({
    left_seat: connector.male("slat-seat", {
      origin: [0, -railY, 0],
      axis: [0, 0, -1],
      up: [1, 0, 0],
    }),
    right_seat: connector.male("slat-seat", {
      origin: [0, railY, 0],
      axis: [0, 0, -1],
      up: [1, 0, 0],
    }),
  });
}

const leftRail = makeRail(-1).color("#8b5a2b");
const rightRail = makeRail(1).color("#8b5a2b");

const leftLegs = supportXs.map((_, i) =>
  makeLeg().matchTo(leftRail, "head", `leg_${i}`).color("#b57f45")
);
const rightLegs = supportXs.map((_, i) =>
  makeLeg().matchTo(rightRail, "head", `leg_${i}`).color("#b57f45")
);
const slats = supportXs.map((_, i) =>
  makeSlat().matchTo(leftRail, "left_seat", `slat_${i}`).color(i % 2 === 0 ? "#d9b07a" : "#c99b63")
);

const bench = group(
  { name: "LeftRail", shape: leftRail },
  { name: "RightRail", shape: rightRail },
  ...leftLegs.map((shape, i) => ({ name: `LeftLeg${i}`, shape })),
  ...rightLegs.map((shape, i) => ({ name: `RightLeg${i}`, shape })),
  ...slats.map((shape, i) => ({ name: `Slat${i}`, shape })),
);

verify.equal("First left leg is seated", bench.connectorDistance("LeftRail.leg_0", "LeftLeg0.head"), 0, 0.01);
verify.equal("First slat is seated on left rail", bench.connectorDistance("LeftRail.slat_0", "Slat0.left_seat"), 0, 0.01);
verify.equal("First slat also reaches the right rail", bench.connectorDistance("RightRail.slat_0", "Slat0.right_seat"), 0, 0.01);

scene({
  background: { top: "#dce7f5", bottom: "#f7fbff" },
  camera: { position: [160, -260, 150], target: [0, 0, 40], fov: 36 },
  environment: { preset: "studio", intensity: 0.45 },
  lights: [
    { type: "ambient", color: "#dde6ef", intensity: 0.18 },
    { type: "directional", position: [180, -160, 220], target: [0, 0, 24], color: "#fff2df", intensity: 1.7, castShadow: true },
    { type: "directional", position: [-140, 90, 160], target: [0, 0, 18], color: "#bfd7f5", intensity: 0.7 },
  ],
  ground: { visible: true, color: "#f2f5f8", height: 0, receiveShadow: true },
});

return [
  { name: "Bench", group: bench },
];

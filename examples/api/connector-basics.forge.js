// Connector-based assembly: shelves snap into side panels via named connectors.
//
// Demonstrates:
// - connector.male() / connector.female() factory
// - withConnectors() to attach connectors to shapes
// - matchTo() single-pair connector matching
// - Auto-bubbling: connectors on named group children are accessible via "ChildName.connectorName"

const panelH = Param.number("Panel Height", 200, { min: 100, max: 400, unit: "mm" });
const panelD = Param.number("Panel Depth", 120, { min: 60, max: 200, unit: "mm" });
const panelT = Param.number("Panel Thickness", 12, { unit: "mm" });
const shelfCount = Param.number("Shelves", 3, { min: 1, max: 6 });
const cabinetW = Param.number("Cabinet Width", 180, { min: 100, max: 400, unit: "mm" });

// ── Side Panel with shelf slots ────────────────────────────────────────────

function makeSidePanel(facingDir) {
  const panel = box(panelT, panelD, panelH);
  const connectors = {};

  for (let i = 0; i < shelfCount; i++) {
    const z = -panelH / 2 + (panelH / (shelfCount + 1)) * (i + 1);
    connectors[`shelf_${i}`] = connector.female("dovetail", {
      origin: [facingDir * panelT / 2, 0, z],
      axis: [facingDir, 0, 0],
    });
  }

  return panel.withConnectors(connectors);
}

const leftSide = makeSidePanel(1).translate(-cabinetW / 2, 0, 0).color("#b8976a");
const rightSide = makeSidePanel(-1).translate(cabinetW / 2, 0, 0).color("#b8976a");

// ── Group the panels — child connectors auto-bubble with dotted names ──────

const cabinet = group(
  { name: "Left", shape: leftSide },
  { name: "Right", shape: rightSide },
);

// Connectors from named children are accessible as "ChildName.connectorName":
//   cabinet.connectorNames() → ["Left.shelf_0", "Left.shelf_1", ..., "Right.shelf_0", ...]
console.log("Cabinet connectors:", cabinet.connectorNames());

// ── Shelf ──────────────────────────────────────────────────────────────────

const shelfW = cabinetW - panelT;
const shelfT = 10;
const shelf = box(shelfW, panelD - 10, shelfT)
  .withConnectors({
    left_tab: connector.male("dovetail", {
      origin: [-shelfW / 2, 0, 0],
      axis: [-1, 0, 0],
    }),
    right_tab: connector.male("dovetail", {
      origin: [shelfW / 2, 0, 0],
      axis: [1, 0, 0],
    }),
  })
  .color("#d4c4a0");

// ── Match shelves to the cabinet group using dotted connector paths ─────────

const result = [cabinet];

for (let i = 0; i < shelfCount; i++) {
  // "Left.shelf_0" reaches into the Left child's connector — no manual re-declaration needed
  const placed = shelf.matchTo(cabinet, "left_tab", `Left.shelf_${i}`);
  result.push({ name: `Shelf ${i + 1}`, shape: placed });
}

return result;

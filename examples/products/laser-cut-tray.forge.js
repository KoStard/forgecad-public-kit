// ── Parametric Laser-Cut Desk Tray ──────────────────────────────────────
//
// A clean open-top tray with finger joints on every corner. Designed to
// demonstrate ForgeCAD's laser-cut API: declare panels + joints, get
// flat cut sheets, 3D fold preview, and assembly instructions — all
// parametric from material thickness.
//
// Drag the Fold slider from 0 to 1 to watch the tray assemble from
// flat laser-cut panels.
//
// 20 lines of structural code → complete kit design:
//   • 5 flat panels with auto-sized finger joints
//   • Cut sheet with all panels nested for your laser bed
//   • 3D assembly preview with fold animation
//   • Step-by-step assembly instructions

// ── Parameters ─────────────────────────────────────────────────────────
const t    = Param.number('Thickness', 3,   { min: 2,  max: 6,   step: 0.5  });
const w    = Param.number('Width',     200, { min: 80, max: 400            });
const d    = Param.number('Depth',     120, { min: 60, max: 250            });
const h    = Param.number('Height',     50, { min: 20, max: 120            });
const fold = Param.number('Fold',        1, { min: 0,  max: 1,   step: 0.01 });
const kerf = Param.number('Kerf',      0.2, { min: 0,  max: 0.5, step: 0.05 });

// ── Flat panels ─────────────────────────────────────────────────────────
// Named edges: bottom, right, top, left — CCW winding, origin at corner.
const bottom = flatPanel('bottom', w, d, t);
const front  = flatPanel('front',  w, h, t);
const back   = flatPanel('back',   w, h, t);
const left   = flatPanel('left',   d, h, t);
const right  = flatPanel('right',  d, h, t);

// ── Joints ──────────────────────────────────────────────────────────────
// Bottom to walls — each call auto-generates matching fingers + slots
fingerJoint(bottom, 'top',    front, 'bottom');
fingerJoint(bottom, 'bottom', back,  'bottom');
fingerJoint(bottom, 'left',   left,  'bottom');
fingerJoint(bottom, 'right',  right, 'bottom');

// Wall-to-wall corners — front/back interlock with side panels
fingerJoint(front, 'left',  left,  'right');
fingerJoint(front, 'right', right, 'left');
fingerJoint(back,  'left',  left,  'left');
fingerJoint(back,  'right', right, 'right');

// ── Laser kit ───────────────────────────────────────────────────────────
const kit = laserKit({
  material: `${t}mm birch plywood`,
  kerf,
  sheetWidth:  600,
  sheetHeight: 400,
});

[bottom, front, back, left, right].forEach(p => kit.addPart(p));

// ── Output ──────────────────────────────────────────────────────────────
// fold=0  → flat cut-sheet layout (all panels coplanar, ready to laser)
// fold=1  → fully assembled tray
//
// Other outputs (uncomment to use):
//   kit.cutSheets()          → nested cut-layout for laser bed
//   kit.bom()                → bill of materials
//   kit.partSvgs()           → per-part SVG with joints (send to laser cutter)
//   kit.formatInstructions() → step-by-step assembly text

return kit.assemblyPreview({ fold, kerf }).shapes;

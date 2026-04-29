// ── Laser-Cut Box with Hinged Lid ──────────────────────────────────
//
// A parametric finger-jointed box that demonstrates ForgeCAD's laser
// kit design features: parametric flat panels, automatic finger joints,
// kerf compensation, cut sheet nesting, 3D fold-up preview, and
// assembly instructions.
//
// How it works:
//   1. Define flat panels with named edges (bottom, right, top, left)
//   2. Declare joints between edges — fingerJoint() mutates both panels,
//      adding interlocking fingers/slots to each edge
//   3. Pack everything into a laserKit for nesting, BOM, and SVG export
//   4. assemblyPreview() folds the flat panels into 3D using the joint
//      graph and the Fold parameter (0 = flat layout, 1 = fully assembled)
//
// Parameter cascade:
//   Changing Thickness updates every panel and every joint automatically —
//   finger sizes, slot depths, and kerf offsets all derive from it.
//   Changing Width/Depth/Height rescales the relevant panels and the
//   joints re-adapt because they reference the panel edge lengths.

// ── Parameters ─────────────────────────────────────────────────────
const t    = Param.number('Thickness', 3,   { min: 2, max: 6, step: 0.5 });
const w    = Param.number('Width',     100, { min: 40, max: 300 });
const d    = Param.number('Depth',     80,  { min: 40, max: 200 });
const h    = Param.number('Height',    50,  { min: 20, max: 150 });
const fold = Param.number('Fold',      1,   { min: 0, max: 1, step: 0.01 });
const kerf = Param.number('Kerf',      0.2, { min: 0, max: 0.5, step: 0.05 });

// ── Create flat panels ─────────────────────────────────────────────
// Each panel is a named rectangle with four edges: bottom, right, top, left.
// The third argument is material thickness — used for joint depth calculations.

const bottom = flatPanel('bottom', w, d, t);
const front  = flatPanel('front',  w, h, t);
const back   = flatPanel('back',   w, h, t);
const left   = flatPanel('left',   d, h, t);
const right  = flatPanel('right',  d, h, t);
const lid    = flatPanel('lid',    w, d, t);

// ── Declare joints ─────────────────────────────────────────────────
// fingerJoint(partA, edgeA, partB, edgeB, options?)
//
// Each call mutates both panels: partA's edge gets fingers (tabs),
// partB's edge gets matching slots. The default foldAngle is 90 degrees
// — panels fold perpendicular to each other when assembled.
//
// Joint topology (viewed from above, unfolded):
//
//              back
//               |
//   left ── bottom ── right
//               |
//             front
//
//   lid attaches to back's top edge (hinged)

// Bottom to walls — all four edges fold up at 90 degrees
fingerJoint(bottom, 'top',    front, 'bottom');
fingerJoint(bottom, 'bottom', back,  'bottom');
fingerJoint(bottom, 'left',   left,  'bottom');
fingerJoint(bottom, 'right',  right, 'bottom');

// Wall-to-wall corners — side walls connect to front/back walls
// These form the vertical edges of the box
fingerJoint(front, 'left',  left,  'right');
fingerJoint(front, 'right', right, 'left');
fingerJoint(back,  'left',  left,  'left');
fingerJoint(back,  'right', right, 'right');

// Lid hinges to the back wall's top edge.
// foldAngle: 90 means the lid opens to 90 degrees from the back wall.
// When fold=1, the lid sits flat on top (closed); the hinge angle is
// interpolated during the fold animation.
fingerJoint(back, 'top', lid, 'bottom', { foldAngle: 90 });

// ── Build the laser kit ────────────────────────────────────────────
// The kit manages material info, kerf compensation, sheet nesting,
// BOM generation, assembly preview, and SVG export.
const kit = laserKit({
  material: `${t}mm birch plywood`,
  kerf,
  sheetWidth: 600,
  sheetHeight: 400,
});

const parts = [bottom, front, back, left, right, lid];
for (const p of parts) kit.addPart(p);

// kit.cutSheets()         — nested cutting layouts for the laser cutter
// kit.bom()               — bill of materials with quantities and dimensions
// kit.partSvgs()          — individual SVG outlines per part (with joints)
// kit.inventorySvg()      — combined SVG showing all parts on sheets
// kit.formatInstructions() — human-readable assembly instructions

// ── 3D Assembly Preview ────────────────────────────────────────────
// assemblyPreview() folds the flat panels into 3D using the joint graph.
//
// The `fold` parameter controls animation:
//   fold = 0  — all panels laid flat (laser-cut layout orientation)
//   fold = 1  — fully assembled box with lid closed
//
// Drag the Fold slider in the editor to see the assembly animate.

const preview = kit.assemblyPreview({ fold });

// ── Return the 3D preview ──────────────────────────────────────────
return preview.shapes;

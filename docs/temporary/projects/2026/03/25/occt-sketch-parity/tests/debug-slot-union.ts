/**
 * Debug script: inspect what OCCT produces for slot union (rect + 2 circles).
 * This script proved that pairwise BRepAlgoAPI_Fuse + shapeToFace
 * double-counts overlap areas when chained.
 *
 * Key finding: After fuse(rect, leftCircle), area is correct (121.13).
 * After fuse(result, rightCircle), area is 171.40 instead of expected 146.27.
 * The surplus (25.13) is exactly pi*r^2/2 — the overlap between right circle and rect.
 *
 * Run: npx tsx docs/temporary/projects/2026/03/25/occt-sketch-parity/tests/debug-slot-union.ts
 */
import { init } from '../../../../../../../../src/forge/headless';
import { getOCCT } from '../../../../../../../../src/forge/backends/occt/init';

async function main() {
  await init();
  const oc = getOCCT();

  // Build rect face: 12 x 8, centered
  const rectPts: [number, number][] = [[-6, -4], [6, -4], [6, 4], [-6, 4]];
  const rectEdges: any[] = [];
  for (let i = 0; i < rectPts.length; i++) {
    const [x1, y1] = rectPts[i];
    const [x2, y2] = rectPts[(i + 1) % rectPts.length];
    rectEdges.push(new oc.BRepBuilderAPI_MakeEdge_3(
      new oc.gp_Pnt_3(x1, y1, 0), new oc.gp_Pnt_3(x2, y2, 0)
    ).Edge());
  }
  const rectWire = new oc.BRepBuilderAPI_MakeWire_2(rectEdges[0]);
  for (let i = 1; i < rectEdges.length; i++) rectWire.Add_1(rectEdges[i]);
  const rectFace = new oc.BRepBuilderAPI_MakeFace_15(rectWire.Wire(), true).Face();

  // Build circle face at (-6, 0), radius 4
  const leftAxis = new oc.gp_Ax2_3(new oc.gp_Pnt_3(-6, 0, 0), new oc.gp_Dir_4(0, 0, 1));
  const leftCirc = new oc.gp_Circ_2(leftAxis, 4);
  const leftEdge = new oc.BRepBuilderAPI_MakeEdge_8(leftCirc).Edge();
  const leftWire = new oc.BRepBuilderAPI_MakeWire_2(leftEdge).Wire();
  const leftFace = new oc.BRepBuilderAPI_MakeFace_15(leftWire, true).Face();

  // Build circle face at (6, 0), radius 4
  const rightAxis = new oc.gp_Ax2_3(new oc.gp_Pnt_3(6, 0, 0), new oc.gp_Dir_4(0, 0, 1));
  const rightCirc = new oc.gp_Circ_2(rightAxis, 4);
  const rightEdge = new oc.BRepBuilderAPI_MakeEdge_8(rightCirc).Edge();
  const rightWire = new oc.BRepBuilderAPI_MakeWire_2(rightEdge).Wire();
  const rightFace = new oc.BRepBuilderAPI_MakeFace_15(rightWire, true).Face();

  // Area of individual shapes
  const gpRect = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(rectFace, gpRect, 1e-6, false);
  console.log('Rect area:', gpRect.Mass().toFixed(4));

  const gpLeft = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(leftFace, gpLeft, 1e-6, false);
  console.log('Left circle area:', gpLeft.Mass().toFixed(4));

  const gpRight = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(rightFace, gpRight, 1e-6, false);
  console.log('Right circle area:', gpRight.Mass().toFixed(4));

  // Fuse rect + left circle
  const fuse1 = new oc.BRepAlgoAPI_Fuse_3(rectFace, leftFace, new oc.Message_ProgressRange_1());
  fuse1.Build(new oc.Message_ProgressRange_1());
  const shape1 = fuse1.Shape();

  // Inspect shape1
  const gpFuse1 = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(shape1, gpFuse1, 1e-6, false);
  console.log('\nAfter fuse(rect, leftCircle):');
  console.log('  Area:', gpFuse1.Mass().toFixed(4));
  console.log('  ShapeType:', shape1.ShapeType());

  // Count faces and wires
  let nFaces = 0;
  const faceExpl1 = new oc.TopExp_Explorer_2(shape1, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (faceExpl1.More()) { nFaces++; faceExpl1.Next(); }
  console.log('  Num faces:', nFaces);

  let nWires = 0;
  const wireExpl1 = new oc.TopExp_Explorer_2(shape1, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (wireExpl1.More()) { nWires++; wireExpl1.Next(); }
  console.log('  Num wires:', nWires);

  // Convert to face via shapeToFace approach
  const face1 = shapeToFace(oc, shape1);
  const gpFace1 = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(face1, gpFace1, 1e-6, false);
  console.log('  After shapeToFace, area:', gpFace1.Mass().toFixed(4));

  // Expected area: rect (12*8=96) + left half-circle (pi*16/2 ≈ 25.13) = ~121.13
  const expectedStep1 = 96 + Math.PI * 16 / 2;
  console.log('  Expected area:', expectedStep1.toFixed(4));

  // Now fuse with right circle — THIS IS WHERE THE BUG MANIFESTS
  const fuse2 = new oc.BRepAlgoAPI_Fuse_3(face1, rightFace, new oc.Message_ProgressRange_1());
  fuse2.Build(new oc.Message_ProgressRange_1());
  const shape2 = fuse2.Shape();

  const gpFuse2 = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(shape2, gpFuse2, 1e-6, false);
  console.log('\nAfter fuse(result, rightCircle):');
  console.log('  Area:', gpFuse2.Mass().toFixed(4));

  const face2 = shapeToFace(oc, shape2);
  const gpFace2 = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(face2, gpFace2, 1e-6, false);
  console.log('  After shapeToFace, area:', gpFace2.Mass().toFixed(4));

  // Expected: slot = rect + 2 half-circles = 96 + pi*16 ≈ 146.27
  const expectedFinal = 96 + Math.PI * 16;
  console.log('  Expected area:', expectedFinal.toFixed(4));
  console.log('  SURPLUS:', (gpFace2.Mass() - expectedFinal).toFixed(4), '(should be ~0)');
}

function shapeToFace(oc: any, shape: any): any {
  const shapeType = shape.ShapeType();
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_FACE) return shape;
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
    return new oc.BRepBuilderAPI_MakeFace_15(oc.TopoDS.Wire_1(shape), true).Face();
  }
  const wires: any[] = [];
  const wireExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (wireExpl.More()) {
    wires.push(oc.TopoDS.Wire_1(wireExpl.Current()));
    wireExpl.Next();
  }
  if (wires.length === 0) {
    const faceExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    if (faceExpl.More()) return oc.TopoDS.Face_1(faceExpl.Current());
    throw new Error('Cannot convert shape to face');
  }
  if (wires.length === 1) return new oc.BRepBuilderAPI_MakeFace_15(wires[0], true).Face();
  const mkFace = new oc.BRepBuilderAPI_MakeFace_15(wires[0], true);
  for (let i = 1; i < wires.length; i++) mkFace.Add(wires[i]);
  return mkFace.Face();
}

main().catch(console.error);

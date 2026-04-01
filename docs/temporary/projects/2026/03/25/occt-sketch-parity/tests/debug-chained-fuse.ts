/**
 * Debug: compare chained pairwise fuse vs list-based fuse vs compound fuse.
 * This script proved that:
 *  - Fusing the compound directly (not via shapeToFace) produces correct results
 *  - List-based fuse (SetArguments/SetTools) produces correct results
 *  - _cleanProfileFace does NOT fix the issue
 *
 * Run: npx tsx docs/temporary/projects/2026/03/25/occt-sketch-parity/tests/debug-chained-fuse.ts
 */
import { init } from '../../../../../../../../src/forge/headless';
import { getOCCT } from '../../../../../../../../src/forge/backends/occt/init';

async function main() {
  await init();
  const oc = getOCCT();

  const rectFace = makeRect(oc, -6, -4, 12, 8);
  const leftCircle = makeCircle(oc, -6, 0, 4);
  const rightCircle = makeCircle(oc, 6, 0, 4);

  console.log('=== Step 1: Fuse rect + left circle ===');
  const fuse1 = new oc.BRepAlgoAPI_Fuse_3(rectFace, leftCircle, new oc.Message_ProgressRange_1());
  fuse1.Build(new oc.Message_ProgressRange_1());
  const compound1 = fuse1.Shape();
  console.log('Compound1 area:', areaOf(oc, compound1).toFixed(4), '(expected: 121.1327)');
  printFaces(oc, compound1, 'compound1');

  // Convert compound to single face via shapeToFace
  const face1 = shapeToFace(oc, compound1);
  console.log('face1 area:', areaOf(oc, face1).toFixed(4));
  printWires(oc, face1, 'face1');

  console.log('\n=== Step 2: Fuse face1 + right circle (BROKEN — pairwise) ===');
  const fuse2 = new oc.BRepAlgoAPI_Fuse_3(face1, rightCircle, new oc.Message_ProgressRange_1());
  fuse2.Build(new oc.Message_ProgressRange_1());
  const compound2 = fuse2.Shape();
  console.log('Compound2 area:', areaOf(oc, compound2).toFixed(4), '(expected: 146.2655)');
  printFaces(oc, compound2, 'compound2');

  console.log('\n=== Alternative: Fuse compound directly (CORRECT) ===');
  const fuse3 = new oc.BRepAlgoAPI_Fuse_3(compound1, rightCircle, new oc.Message_ProgressRange_1());
  fuse3.Build(new oc.Message_ProgressRange_1());
  const compound3 = fuse3.Shape();
  console.log('Compound3 area:', areaOf(oc, compound3).toFixed(4), '(expected: 146.2655)');
  printFaces(oc, compound3, 'compound3');

  console.log('\n=== Alternative: List-based fuse (CORRECT) ===');
  try {
    const ls1 = new oc.TopTools_ListOfShape_1();
    ls1.Append_1(rectFace);
    const ls2 = new oc.TopTools_ListOfShape_1();
    ls2.Append_1(leftCircle);
    ls2.Append_1(rightCircle);
    const fuse5 = new oc.BRepAlgoAPI_Fuse_1();
    fuse5.SetArguments(ls1);
    fuse5.SetTools(ls2);
    fuse5.Build(new oc.Message_ProgressRange_1());
    const shape5 = fuse5.Shape();
    console.log('List-fuse area:', areaOf(oc, shape5).toFixed(4), '(expected: 146.2655)');
    printFaces(oc, shape5, 'list-fuse');
  } catch (e: any) {
    console.log('Error:', e.message);
  }
}

function makeRect(oc: any, x: number, y: number, w: number, h: number): any {
  const pts: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const edges: any[] = [];
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    edges.push(new oc.BRepBuilderAPI_MakeEdge_3(
      new oc.gp_Pnt_3(x1, y1, 0), new oc.gp_Pnt_3(x2, y2, 0)
    ).Edge());
  }
  const mkWire = new oc.BRepBuilderAPI_MakeWire_2(edges[0]);
  for (let i = 1; i < edges.length; i++) mkWire.Add_1(edges[i]);
  return new oc.BRepBuilderAPI_MakeFace_15(mkWire.Wire(), true).Face();
}

function makeCircle(oc: any, cx: number, cy: number, r: number): any {
  const axis = new oc.gp_Ax2_3(new oc.gp_Pnt_3(cx, cy, 0), new oc.gp_Dir_4(0, 0, 1));
  const circ = new oc.gp_Circ_2(axis, r);
  const edge = new oc.BRepBuilderAPI_MakeEdge_8(circ).Edge();
  const wire = new oc.BRepBuilderAPI_MakeWire_2(edge).Wire();
  return new oc.BRepBuilderAPI_MakeFace_15(wire, true).Face();
}

function areaOf(oc: any, shape: any): number {
  const gp = new oc.GProp_GProps_1();
  oc.BRepGProp.SurfaceProperties_1(shape, gp, 1e-6, false);
  return gp.Mass();
}

function printFaces(oc: any, shape: any, label: string) {
  let i = 0;
  const expl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (expl.More()) {
    console.log(`  ${label} face[${i}]: area=${areaOf(oc, oc.TopoDS.Face_1(expl.Current())).toFixed(4)}`);
    i++;
    expl.Next();
  }
}

function printWires(oc: any, shape: any, label: string) {
  let i = 0;
  const expl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (expl.More()) {
    const w = oc.TopoDS.Wire_1(expl.Current());
    let edgeCount = 0;
    const edgeExpl = new oc.TopExp_Explorer_2(w, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (edgeExpl.More()) { edgeCount++; edgeExpl.Next(); }
    console.log(`  ${label} wire[${i}]: ${edgeCount} edges`);
    i++;
    expl.Next();
  }
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

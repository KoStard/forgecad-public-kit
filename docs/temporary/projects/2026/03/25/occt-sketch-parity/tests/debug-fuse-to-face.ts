/**
 * Debug: verify that list-based fuse + ShapeUpgrade_UnifySameDomain
 * produces a correct single face that can be extruded.
 *
 * This script proved that ShapeUpgrade_UnifySameDomain is the correct
 * way to merge coplanar face fragments from BRepAlgoAPI_Fuse.
 *
 * Key result: 5 face fragments → UnifySameDomain → 1 face with correct area →
 * extrude → correct volume.
 *
 * Run: npx tsx docs/temporary/projects/2026/03/25/occt-sketch-parity/tests/debug-fuse-to-face.ts
 */
import { init } from '../../../../../../../../src/forge/headless';
import { getOCCT } from '../../../../../../../../src/forge/backends/occt/init';

async function main() {
  await init();
  const oc = getOCCT();

  const rectFace = makeRect(oc, -6, -4, 12, 8);
  const leftCircle = makeCircle(oc, -6, 0, 4);
  const rightCircle = makeCircle(oc, 6, 0, 4);
  const expected = 96 + Math.PI * 16;

  // List-based fuse
  const ls1 = new oc.TopTools_ListOfShape_1();
  ls1.Append_1(rectFace);
  const ls2 = new oc.TopTools_ListOfShape_1();
  ls2.Append_1(leftCircle);
  ls2.Append_1(rightCircle);
  const fuse = new oc.BRepAlgoAPI_Fuse_1();
  fuse.SetArguments(ls1);
  fuse.SetTools(ls2);
  fuse.Build(new oc.Message_ProgressRange_1());
  const fusedCompound = fuse.Shape();
  console.log('List-fuse area:', areaOf(oc, fusedCompound).toFixed(4), `(expected: ${expected.toFixed(4)})`);
  printFaces(oc, fusedCompound, 'compound');

  // ShapeUpgrade_UnifySameDomain
  console.log('\n=== ShapeUpgrade_UnifySameDomain ===');
  const unify = new oc.ShapeUpgrade_UnifySameDomain_2(fusedCompound, true, true, false);
  unify.Build();
  const unified = unify.Shape();
  console.log('Unified area:', areaOf(oc, unified).toFixed(4));
  printFaces(oc, unified, 'unified');

  // Extract face and extrude
  const face = shapeToFace(oc, unified);
  console.log('Face area:', areaOf(oc, face).toFixed(4));

  const vec = new oc.gp_Vec_4(0, 0, 5);
  const prism = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true);
  prism.Build(new oc.Message_ProgressRange_1());
  const solid = prism.Shape();
  const gp = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(solid, gp, 1e-6, false, false);
  console.log('Extruded volume:', gp.Mass().toFixed(4), `(expected: ${(expected * 5).toFixed(4)})`);

  // Also verify: extruding compound directly works too
  console.log('\n=== Extrude compound directly ===');
  const prism2 = new oc.BRepPrimAPI_MakePrism_1(fusedCompound, vec, false, true);
  prism2.Build(new oc.Message_ProgressRange_1());
  const solid2 = prism2.Shape();
  const gp2 = new oc.GProp_GProps_1();
  oc.BRepGProp.VolumeProperties_1(solid2, gp2, 1e-6, false, false);
  console.log('Volume:', gp2.Mass().toFixed(4), `(expected: ${(expected * 5).toFixed(4)})`);
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

function shapeToFace(oc: any, shape: any): any {
  const shapeType = shape.ShapeType();
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_FACE) return shape;
  const faceExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  if (faceExpl.More()) return oc.TopoDS.Face_1(faceExpl.Current());
  throw new Error('No face found');
}

main().catch(console.error);

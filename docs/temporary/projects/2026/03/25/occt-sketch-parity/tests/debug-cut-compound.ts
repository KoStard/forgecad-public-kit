/**
 * Debug: test cutting various representations of a union result.
 * This script proved the critical insight that shapeToFace was the culprit:
 *
 *  - Cutting a raw compound from fuse → correct area (931.32)
 *  - Cutting a UnifySameDomain result → correct area (931.32)
 *  - Extruding the cut compound → correct volume (3725.29)
 *
 * The earlier failures were caused by shapeToFace merging wires from
 * disconnected faces into a broken single-face topology, not by
 * BRepAlgoAPI_Cut failing on unified faces.
 *
 * Run: npx tsx docs/temporary/projects/2026/03/25/occt-sketch-parity/tests/debug-cut-compound.ts
 */
import { init } from '../../../../../../../../src/forge/headless';
import { getOCCT } from '../../../../../../../../src/forge/backends/occt/init';

async function main() {
  await init();
  const oc = getOCCT();

  const rectFace = makeRect(oc, -10, -15, 20, 30);
  const topCircle = makeCircle(oc, 0, 0, 12);
  const bottomCircle = makeCircle(oc, 0, -30, 12);
  const holeTop = makeCircle(oc, 0, 0, 5);
  const holeBottom = makeCircle(oc, 0, -30, 5);

  // Raw fuse compound (6 faces)
  const fuse = listFuse(oc, [rectFace], [topCircle, bottomCircle]);
  console.log('Raw compound area:', areaOf(oc, fuse).toFixed(4));
  console.log('Faces:', countFaces(oc, fuse));

  // Approach 1: Cut from raw compound
  console.log('\n=== 1: Cut raw compound ===');
  {
    const result = listCut(oc, fuse, [holeTop, holeBottom]);
    console.log('Area:', areaOf(oc, result).toFixed(4));
    console.log('Faces:', countFaces(oc, result));
  }

  // Approach 2: Unify then cut
  console.log('\n=== 2: Unify → Cut ===');
  {
    const unified = unifyShape(oc, fuse);
    console.log('Unified area:', areaOf(oc, unified).toFixed(4), 'faces:', countFaces(oc, unified));
    const result = listCut(oc, unified, [holeTop, holeBottom]);
    console.log('After cut area:', areaOf(oc, result).toFixed(4));
    console.log('Faces:', countFaces(oc, result));
  }

  // Approach 3: Cut each unified face separately
  console.log('\n=== 3: Cut each unified face separately ===');
  {
    const unified = unifyShape(oc, fuse);
    const faces: any[] = [];
    const expl = new oc.TopExp_Explorer_2(unified, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    while (expl.More()) {
      faces.push(oc.TopoDS.Face_1(expl.Current()));
      expl.Next();
    }
    console.log(`${faces.length} unified faces`);

    for (let i = 0; i < faces.length; i++) {
      const f = faces[i];
      console.log(`  Face ${i}: area=${areaOf(oc, f).toFixed(4)}`);
      const result = listCut(oc, f, [holeTop, holeBottom]);
      console.log(`  After cut: area=${areaOf(oc, result).toFixed(4)}`);
    }
  }

  // Approach 4: Raw compound → Cut → Extrude
  console.log('\n=== 4: Raw compound → Cut → Extrude ===');
  {
    const cutResult = listCut(oc, fuse, [holeTop, holeBottom]);
    console.log('Cut result area:', areaOf(oc, cutResult).toFixed(4));
    console.log('Faces:', countFaces(oc, cutResult));

    const vec = new oc.gp_Vec_4(0, 0, 4);
    const prism = new oc.BRepPrimAPI_MakePrism_1(cutResult, vec, false, true);
    prism.Build(new oc.Message_ProgressRange_1());
    const solid = prism.Shape();
    const gp = new oc.GProp_GProps_1();
    oc.BRepGProp.VolumeProperties_1(solid, gp, 1e-6, false, false);
    console.log('Volume:', gp.Mass().toFixed(4));

    // Expected: (union area - 2*pi*25) * 4 = (1088.40 - 157.08) * 4 = 3725.28
    console.log('Expected:', ((1088.40 - 2 * Math.PI * 25) * 4).toFixed(4));
  }
}

function listFuse(oc: any, argShapes: any[], toolShapes: any[]): any {
  const args = new oc.TopTools_ListOfShape_1();
  for (const s of argShapes) args.Append_1(s);
  const tools = new oc.TopTools_ListOfShape_1();
  for (const s of toolShapes) tools.Append_1(s);
  const fuse = new oc.BRepAlgoAPI_Fuse_1();
  fuse.SetArguments(args);
  fuse.SetTools(tools);
  fuse.Build(new oc.Message_ProgressRange_1());
  return fuse.Shape();
}

function listCut(oc: any, base: any, cutters: any[]): any {
  const args = new oc.TopTools_ListOfShape_1();
  args.Append_1(base);
  const tools = new oc.TopTools_ListOfShape_1();
  for (const c of cutters) tools.Append_1(c);
  const cut = new oc.BRepAlgoAPI_Cut_1();
  cut.SetArguments(args);
  cut.SetTools(tools);
  cut.Build(new oc.Message_ProgressRange_1());
  return cut.Shape();
}

function unifyShape(oc: any, shape: any): any {
  const unify = new oc.ShapeUpgrade_UnifySameDomain_2(shape, true, true, false);
  unify.Build();
  return unify.Shape();
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

function countFaces(oc: any, shape: any): number {
  let n = 0;
  const expl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (expl.More()) { n++; expl.Next(); }
  return n;
}

main().catch(console.error);

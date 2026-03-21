/**
 * ForgeCAD — Compile Plan → OCCT Lowering
 *
 * Lowers the backend-agnostic CompilePlan IR into OCCT TopoDS_Shape operations.
 * Handles: primitives, booleans, extrude, revolve, fillet, chamfer, transforms.
 * Falls back to Manifold for: loft, sweep (levelSet-based), hull.
 */

import type {
  ProfileCompilePlan,
  ProfileCompileTransformStep,
  ShapeCompilePlan,
  ShapeCompileTransformStep,
} from '../../compilePlan';
import { lowerShellShapeCompilePlanToConcretePlan } from '../../shellCompilePlan';
import {
  lowerCutShapeCompilePlanToConcretePlan,
  lowerHoleShapeCompilePlanToConcretePlan,
} from '../../holeCutCompilePlan';
import { lowerSheetMetalBasePlan } from '../../sheetMetalModel';
import { resolveSupportedEdgeFeatureSelection } from '../../edgeFeatureResolution';
import { getOCCT, type OCCTModule } from './init';
import { wrapOCCTShapeBackend } from './shapeBackend';
import type { ShapeBackend } from '../../shapeBackend';
import { wrapManifoldShapeBackend } from '../manifold/shapeBackend';
import { Transform } from '../../transform';
import { planeFrameToWorldToPlaneMatrix } from '../../planeFrame';
import { getWasm } from '../../kernel';

// ─── Hybrid Boolean Sentinel ────────────────────────────────────────
// When a 3D boolean is performed via Manifold (because OCCT's boolean
// engine is unreliable for coincident geometry), the Manifold result
// is wrapped in this sentinel. The OCCT pipeline passes it through
// unchanged, and lowerShapeCompilePlanToOCCTBackend detects it and
// returns a ManifoldShapeBackend instead of an OCCTShapeBackend.
const MANIFOLD_SENTINEL = Symbol('manifoldBooleanResult');

interface ManifoldSentinel {
  [MANIFOLD_SENTINEL]: true;
  manifold: any;
}

function isManifoldSentinel(x: any): x is ManifoldSentinel {
  return x != null && x[MANIFOLD_SENTINEL] === true;
}

function wrapManifoldSentinel(manifold: any): ManifoldSentinel {
  return { [MANIFOLD_SENTINEL]: true, manifold };
}

// ─── Profile → OCCT Wire/Face ──────────────────────────────────────

/**
 * Build an OCCT TopoDS_Wire from a list of 2D points (closed polygon).
 */
function buildWireFromPoints(oc: OCCTModule, points: [number, number][]): any {
  if (points.length < 3) throw new Error('Need at least 3 points for a wire');

  const edges: any[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    // Skip degenerate (zero-length) edges from duplicate consecutive vertices
    if (Math.abs(x1 - x2) < 1e-10 && Math.abs(y1 - y2) < 1e-10) continue;
    const edge = new oc.BRepBuilderAPI_MakeEdge_3(
      new oc.gp_Pnt_3(x1, y1, 0),
      new oc.gp_Pnt_3(x2, y2, 0),
    ).Edge();
    edges.push(edge);
  }

  const mkWire = new oc.BRepBuilderAPI_MakeWire_2(edges[0]);
  for (let i = 1; i < edges.length; i++) {
    mkWire.Add_1(edges[i]);
  }
  return mkWire.Wire();
}

/**
 * Build an OCCT TopoDS_Face from a wire on the XY plane.
 */
function buildFaceFromWire(oc: OCCTModule, wire: any): any {
  const face = new oc.BRepBuilderAPI_MakeFace_15(wire, true);
  return face.Face();
}

/**
 * Convert an arbitrary TopoDS_Shape to a TopoDS_Face.
 * Handles compounds (from offset/boolean ops) by extracting the first wire
 * and building a face from it. If the shape is already a face, returns it as-is.
 */
function shapeToFace(oc: OCCTModule, shape: any): any {
  const shapeType = shape.ShapeType();
  // Already a face
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_FACE) {
    return shape;
  }
  // It's a wire — make a face from it
  if (shapeType === oc.TopAbs_ShapeEnum.TopAbs_WIRE) {
    return buildFaceFromWire(oc, oc.TopoDS.Wire_1(shape));
  }
  // Compound or other — extract wires and build a face.
  // If there are multiple wires, the first is the outer boundary and the rest are holes.
  const wires: any[] = [];
  const wireExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (wireExpl.More()) {
    wires.push(oc.TopoDS.Wire_1(wireExpl.Current()));
    wireExpl.Next();
  }
  if (wires.length === 0) {
    // Try to find faces directly
    const faceExpl = new oc.TopExp_Explorer_2(shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    if (faceExpl.More()) {
      return oc.TopoDS.Face_1(faceExpl.Current());
    }
    throw new Error('Cannot convert shape to face — no wires or faces found');
  }
  // Build face from the outer wire (largest area)
  if (wires.length === 1) {
    return buildFaceFromWire(oc, wires[0]);
  }
  // Multiple wires: outer boundary + holes
  const mkFace = new oc.BRepBuilderAPI_MakeFace_15(wires[0], true);
  for (let i = 1; i < wires.length; i++) {
    mkFace.Add(wires[i]);
  }
  return mkFace.Face();
}

/**
 * Rebuild a face from its outer wire and inner wires only.
 *
 * OCCT coplanar face booleans (fuse, cut) can leave internal edges
 * where the operand boundaries overlapped. When extruded, these
 * internal edges become parasitic surfaces that make the solid
 * non-manifold and break downstream 3D booleans.
 *
 * This function strips all internal edges by reconstructing the face
 * from only its outer wire and inner wires (holes).
 */
function cleanProfileFace(oc: OCCTModule, shape: any): any {
  const face = shapeToFace(oc, shape);
  const faceCast = oc.TopoDS.Face_1(face);
  const outerWire = oc.BRepTools.OuterWire(faceCast);
  const mkFace = new oc.BRepBuilderAPI_MakeFace_15(outerWire, true);

  // Re-add inner wires (holes), skip the outer wire
  const wireExpl = new oc.TopExp_Explorer_2(face, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (wireExpl.More()) {
    const wire = oc.TopoDS.Wire_1(wireExpl.Current());
    if (!wire.IsSame(outerWire)) {
      mkFace.Add(wire);
    }
    wireExpl.Next();
  }
  return mkFace.Face();
}

/**
 * Subtract a cutting face from a base face on the same plane.
 *
 * All 2D profile booleans operate on coplanar faces (both on Z=0).
 * OCCT's BRepAlgoAPI_Cut can fail silently or produce incorrect geometry
 * for coplanar face subtraction. Instead, use wire insertion — the
 * idiomatic OCCT way to create holes in planar faces: extract the
 * cutting face's outer wire, reverse it, and add it as an inner wire.
 */
function profileDifference(oc: OCCTModule, base: any, cutter: any): any {
  const baseFace = shapeToFace(oc, base);
  const cutterFace = shapeToFace(oc, cutter);

  // Cast to TopoDS_Face for BRepTools.OuterWire (requires exact type, not TopoDS_Shape)
  const baseFaceCast = oc.TopoDS.Face_1(baseFace);
  const outerWire = oc.BRepTools.OuterWire(baseFaceCast);
  const mkFace = new oc.BRepBuilderAPI_MakeFace_15(outerWire, true);

  // Re-add existing inner wires (holes from previous operations)
  const wireExpl = new oc.TopExp_Explorer_2(baseFace, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (wireExpl.More()) {
    const wire = oc.TopoDS.Wire_1(wireExpl.Current());
    if (!wire.IsSame(outerWire)) {
      mkFace.Add(wire);
    }
    wireExpl.Next();
  }

  // Add the cutter's outer wire as a hole (reversed orientation)
  const cutterFaceCast = oc.TopoDS.Face_1(cutterFace);
  const cutterOuterWire = oc.BRepTools.OuterWire(cutterFaceCast);
  mkFace.Add(oc.TopoDS.Wire_1(cutterOuterWire.Reversed()));
  return mkFace.Face();
}

/**
 * Build an OCCT TopoDS_Face from a ProfileCompilePlan.
 * Returns the face in the XY plane (z=0).
 */
function lowerProfileToFace(oc: OCCTModule, plan: ProfileCompilePlan): any {
  let face: any;

  switch (plan.kind) {
    case 'rect': {
      const x0 = plan.center ? -plan.width / 2 : 0;
      const y0 = plan.center ? -plan.height / 2 : 0;
      const points: [number, number][] = [
        [x0, y0],
        [x0 + plan.width, y0],
        [x0 + plan.width, y0 + plan.height],
        [x0, y0 + plan.height],
      ];
      const wire = buildWireFromPoints(oc, points);
      face = buildFaceFromWire(oc, wire);
      break;
    }

    case 'roundedRect': {
      // Build rounded rect directly with line segments and arc corners.
      const r = Math.min(plan.radius, plan.width / 2, plan.height / 2);
      const w = plan.width;
      const h = plan.height;
      const cx = plan.center ? 0 : w / 2;
      const cy = plan.center ? 0 : h / 2;
      const hw = w / 2;
      const hh = h / 2;

      if (r < 1e-10) {
        // No rounding — plain rect
        const pts: [number, number][] = [
          [cx - hw, cy - hh], [cx + hw, cy - hh],
          [cx + hw, cy + hh], [cx - hw, cy + hh],
        ];
        face = buildFaceFromWire(oc, buildWireFromPoints(oc, pts));
      } else {
        // Rounded rect: 4 line edges + 4 arc edges (90° each).
        // Walk counter-clockwise starting from bottom-right corner.
        const mkWire = new oc.BRepBuilderAPI_MakeWire_1();

        // Corner arc centers and their start angle (radians, CCW from +X)
        const arcs: { acx: number; acy: number; startRad: number }[] = [
          { acx: cx + hw - r, acy: cy - hh + r, startRad: -Math.PI / 2 },  // bottom-right
          { acx: cx + hw - r, acy: cy + hh - r, startRad: 0 },              // top-right
          { acx: cx - hw + r, acy: cy + hh - r, startRad: Math.PI / 2 },    // top-left
          { acx: cx - hw + r, acy: cy - hh + r, startRad: Math.PI },         // bottom-left
        ];

        // Each segment: line from prev arc end → this arc start, then 90° arc.
        for (let i = 0; i < 4; i++) {
          const arc = arcs[i];
          const prevArc = arcs[(i + 3) % 4];
          // Previous arc end point
          const prevEndAngle = prevArc.startRad + Math.PI / 2;
          const lx1 = prevArc.acx + r * Math.cos(prevEndAngle);
          const ly1 = prevArc.acy + r * Math.sin(prevEndAngle);
          // This arc start point
          const lx2 = arc.acx + r * Math.cos(arc.startRad);
          const ly2 = arc.acy + r * Math.sin(arc.startRad);

          // Line segment (skip if degenerate)
          if (Math.abs(lx1 - lx2) > 1e-10 || Math.abs(ly1 - ly2) > 1e-10) {
            mkWire.Add_1(new oc.BRepBuilderAPI_MakeEdge_3(
              new oc.gp_Pnt_3(lx1, ly1, 0),
              new oc.gp_Pnt_3(lx2, ly2, 0),
            ).Edge());
          }

          // 90° arc
          const axis = new oc.gp_Ax2_3(
            new oc.gp_Pnt_3(arc.acx, arc.acy, 0),
            new oc.gp_Dir_4(0, 0, 1),
          );
          const circ = new oc.gp_Circ_2(axis, r);
          const arcEdge = new oc.BRepBuilderAPI_MakeEdge_9(
            circ,
            arc.startRad,
            arc.startRad + Math.PI / 2,
          ).Edge();
          mkWire.Add_1(arcEdge);
        }

        face = buildFaceFromWire(oc, mkWire.Wire());
      }
      break;
    }

    case 'circle': {
      const axis = new oc.gp_Ax2_3(
        new oc.gp_Pnt_3(0, 0, 0),
        new oc.gp_Dir_4(0, 0, 1),
      );
      const circle = new oc.gp_Circ_2(axis, plan.radius);
      const edge = new oc.BRepBuilderAPI_MakeEdge_8(circle).Edge();
      const wire = new oc.BRepBuilderAPI_MakeWire_2(edge).Wire();
      face = buildFaceFromWire(oc, wire);
      break;
    }

    case 'polygon': {
      const wire = buildWireFromPoints(oc, plan.points);
      face = buildFaceFromWire(oc, wire);
      break;
    }

    case 'boolean': {
      const faces = plan.profiles.map((p) => lowerProfileToFace(oc, p));
      if (faces.length === 0) throw new Error('Cannot lower empty profile boolean');
      if (faces.length === 1) {
        face = faces[0];
        break;
      }
      let result = faces[0];
      for (let i = 1; i < faces.length; i++) {
        if (plan.op === 'difference') {
          // Coplanar face subtraction via BRepAlgoAPI_Cut can fail silently
          // in OCCT when both faces lie on the same plane. Use wire insertion
          // as the primary strategy: extract the cutting face's outer wire
          // and add it as an inner wire (hole) to the base face.
          // Falls back to boolean cut for partial-overlap cases.
          result = profileDifference(oc, result, faces[i]);
        } else {
          let op: any;
          switch (plan.op) {
            case 'union':
              op = new oc.BRepAlgoAPI_Fuse_3(result, faces[i], new oc.Message_ProgressRange_1());
              break;
            case 'intersection':
              op = new oc.BRepAlgoAPI_Common_3(result, faces[i], new oc.Message_ProgressRange_1());
              break;
          }
          op.Build(new oc.Message_ProgressRange_1());
          result = shapeToFace(oc, op.Shape());
        }
      }
      // Boolean on 2D profiles can return a compound; ensure it's a face.
      face = shapeToFace(oc, result);
      break;
    }

    case 'offset': {
      const baseFace = lowerProfileToFace(oc, plan.base);
      const offsetMaker = new oc.BRepOffsetAPI_MakeOffset_2(baseFace, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
      offsetMaker.Perform(plan.delta, 0);
      if (offsetMaker.IsDone()) {
        // MakeOffset returns a compound of wires, not a face.
        // Extract the outermost wire and rebuild a face.
        face = shapeToFace(oc, offsetMaker.Shape());
      } else {
        face = baseFace; // Fallback
      }
      break;
    }

    case 'hull':
      throw new OCCTUnsupportedError('profile hull');

    case 'project':
      throw new OCCTUnsupportedError('profile project');
  }

  // Apply 2D transforms
  face = applyProfileTransforms(oc, face, plan.transforms);
  return face;
}

function applyProfileTransforms(oc: OCCTModule, shape: any, transforms: ProfileCompileTransformStep[]): any {
  let result = shape;
  for (const step of transforms) {
    const trsf = new oc.gp_Trsf_1();
    switch (step.kind) {
      case 'translate':
        trsf.SetTranslation_1(new oc.gp_Vec_4(step.x, step.y, 0));
        break;
      case 'rotate':
        trsf.SetRotation_1(
          new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(0, 0, 1)),
          step.degrees * Math.PI / 180,
        );
        break;
      case 'scale': {
        // Non-uniform 2D scale via GTrsf
        const gtrsf = new oc.gp_GTrsf_1();
        gtrsf.SetValue(1, 1, step.x);
        gtrsf.SetValue(2, 2, step.y);
        gtrsf.SetValue(3, 3, 1);
        const transformed = new oc.BRepBuilderAPI_GTransform_2(result, gtrsf, true);
        result = transformed.Shape();
        continue;
      }
      case 'mirror':
        trsf.SetMirror_3(new oc.gp_Ax2_3(
          new oc.gp_Pnt_3(0, 0, 0),
          new oc.gp_Dir_4(step.normalX, step.normalY, 0),
        ));
        break;
    }
    const transformed = new oc.BRepBuilderAPI_Transform_2(result, trsf, true);
    result = transformed.Shape();
  }
  return result;
}

// ─── Shape → OCCT TopoDS_Shape ─────────────────────────────────────

function applyShapeTransform(oc: OCCTModule, shape: any, step: ShapeCompileTransformStep): any {
  const trsf = new oc.gp_Trsf_1();
  switch (step.kind) {
    case 'translate':
      trsf.SetTranslation_1(new oc.gp_Vec_4(step.x, step.y, step.z));
      break;
    case 'rotate': {
      // Euler angles — apply Z, Y, X in sequence
      const mat = Transform.rotationAxis([1, 0, 0], step.xDeg)
        .rotateAxis([0, 1, 0], step.yDeg)
        .rotateAxis([0, 0, 1], step.zDeg)
        .toArray();
      trsf.SetValues(
        mat[0], mat[4], mat[8], mat[12],
        mat[1], mat[5], mat[9], mat[13],
        mat[2], mat[6], mat[10], mat[14],
      );
      break;
    }
    case 'scale': {
      if (step.x === step.y && step.y === step.z) {
        trsf.SetScaleFactor(step.x);
        break;
      }
      // Non-uniform scale
      const gtrsf = new oc.gp_GTrsf_1();
      gtrsf.SetValue(1, 1, step.x);
      gtrsf.SetValue(2, 2, step.y);
      gtrsf.SetValue(3, 3, step.z);
      const transformed = new oc.BRepBuilderAPI_GTransform_2(shape, gtrsf, true);
      return transformed.Shape();
    }
    case 'rotateAround': {
      const mat = Transform.rotationAxis(
        [step.axisX, step.axisY, step.axisZ],
        step.degrees,
        [step.pivotX, step.pivotY, step.pivotZ],
      ).toArray();
      trsf.SetValues(
        mat[0], mat[4], mat[8], mat[12],
        mat[1], mat[5], mat[9], mat[13],
        mat[2], mat[6], mat[10], mat[14],
      );
      break;
    }
    case 'mirror':
      trsf.SetMirror_3(new oc.gp_Ax2_3(
        new oc.gp_Pnt_3(0, 0, 0),
        new oc.gp_Dir_4(step.normalX, step.normalY, step.normalZ),
      ));
      break;
    case 'workplanePlacement': {
      const m = step.matrix;
      trsf.SetValues(
        m[0], m[4], m[8], m[12],
        m[1], m[5], m[9], m[13],
        m[2], m[6], m[10], m[14],
      );
      break;
    }
  }
  const transformed = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  return transformed.Shape();
}

function applyShapeTransforms(oc: OCCTModule, shape: any, steps: ShapeCompileTransformStep[]): any {
  let result = shape;
  for (const step of steps) {
    result = applyShapeTransform(oc, result, step);
  }
  return result;
}

function lowerBooleanPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'boolean' }>): any {
  const shapes = plan.shapes.map((s) => lowerShapeCompilePlanToOCCT(s, oc));
  if (shapes.length === 0) throw new Error('Cannot lower empty boolean');
  if (shapes.length === 1) return shapes[0];

  // OCCT's boolean engine is unreliable for coincident/coplanar faces and
  // edges — a common situation when models share faces at junctions.
  // Use a hybrid approach: each operand is built in OCCT (preserving B-rep
  // quality for extrudes, fillets, etc.), then tessellated and booleaned
  // in Manifold, which handles these cases robustly. The Manifold result
  // is converted back to an OCCT shape (triangulated face in a compound).
  return hybridBooleanViaManifold(oc, plan.op, shapes);
}

/**
 * Tessellate an OCCT shape and return raw mesh arrays.
 * Mirrors the logic in occtShapeBackend.ts extractMeshFromShape.
 */
function tessellateOCCTShape(
  oc: OCCTModule,
  shape: any,
  linearDeflection = 0.1,
  angularDeflection = 0.5,
): { vertProperties: Float32Array; triVerts: Uint32Array; numVerts: number; numTris: number } {
  new oc.BRepMesh_IncrementalMesh_2(shape, linearDeflection, false, angularDeflection, false);

  let totalVerts = 0;
  let totalTris = 0;
  const allPositions: number[] = [];
  const allIndices: number[] = [];

  const expl = new oc.TopExp_Explorer_2(
    shape, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  while (expl.More()) {
    const face = oc.TopoDS.Face_1(expl.Current());
    const loc = new oc.TopLoc_Location_1();
    const triangulation = oc.BRep_Tool.Triangulation(face, loc, 0);
    if (!triangulation.IsNull()) {
      const tri = triangulation.get();
      const nVerts = tri.NbNodes();
      const nTris = tri.NbTriangles();
      const baseIndex = totalVerts;
      const orientation = face.Orientation_1();
      const reversed = orientation === oc.TopAbs_Orientation.TopAbs_REVERSED;
      const trsf = loc.Transformation();
      for (let i = 1; i <= nVerts; i++) {
        const pt = tri.Node(i).Transformed(trsf);
        allPositions.push(pt.X(), pt.Y(), pt.Z());
      }
      for (let i = 1; i <= nTris; i++) {
        const triangle = tri.Triangle(i);
        const i1 = triangle.Value(1) - 1 + baseIndex;
        const i2 = triangle.Value(2) - 1 + baseIndex;
        const i3 = triangle.Value(3) - 1 + baseIndex;
        if (reversed) {
          allIndices.push(i1, i3, i2);
        } else {
          allIndices.push(i1, i2, i3);
        }
      }
      totalVerts += nVerts;
      totalTris += nTris;
    }
    expl.Next();
  }
  return {
    vertProperties: new Float32Array(allPositions),
    triVerts: new Uint32Array(allIndices),
    numVerts: totalVerts,
    numTris: totalTris,
  };
}

/**
 * Build merge maps for welding duplicate vertices at the given tolerance.
 */
function buildMergeMaps(mesh: { vertProperties: Float32Array; numVerts: number }, eps: number) {
  const mergeFrom: number[] = [];
  const mergeTo: number[] = [];
  const vertMap = new Map<string, number>();
  for (let i = 0; i < mesh.numVerts; i++) {
    const x = mesh.vertProperties[i * 3];
    const y = mesh.vertProperties[i * 3 + 1];
    const z = mesh.vertProperties[i * 3 + 2];
    const key = `${Math.round(x / eps)}:${Math.round(y / eps)}:${Math.round(z / eps)}`;
    const existing = vertMap.get(key);
    if (existing !== undefined && existing !== i) {
      mergeFrom.push(i);
      mergeTo.push(existing);
    } else {
      vertMap.set(key, i);
    }
  }
  return { mergeFrom, mergeTo };
}

/**
 * Tessellate an OCCT shape and create a Manifold object from it.
 * Tries progressively looser welding tolerances and finer tessellation
 * to handle OCCT tessellation gaps that produce non-manifold meshes.
 */
function occtShapeToManifold(oc: OCCTModule, shape: any, wasm: any): any {
  // Strategy: try multiple (tessellation, welding) combinations.
  // Finer tessellation reduces gaps; looser welding tolerance merges them.
  const attempts: Array<{ linearDeflection: number; angularDeflection: number; eps: number }> = [
    { linearDeflection: 0.1,  angularDeflection: 0.5, eps: 1e-5 },
    { linearDeflection: 0.05, angularDeflection: 0.3, eps: 1e-5 },
    { linearDeflection: 0.1,  angularDeflection: 0.5, eps: 1e-4 },
    { linearDeflection: 0.02, angularDeflection: 0.2, eps: 1e-4 },
    { linearDeflection: 0.1,  angularDeflection: 0.5, eps: 1e-3 },
  ];

  let lastError: unknown;
  for (const { linearDeflection, angularDeflection, eps } of attempts) {
    try {
      const mesh = tessellateOCCTShape(oc, shape, linearDeflection, angularDeflection);
      if (mesh.numTris === 0) continue; // empty tessellation, try finer
      const { mergeFrom, mergeTo } = buildMergeMaps(mesh, eps);
      return new wasm.Manifold(
        new wasm.Mesh({
          numProp: 3,
          vertProperties: mesh.vertProperties,
          triVerts: mesh.triVerts,
          mergeFromVert: new Uint32Array(mergeFrom),
          mergeToVert: new Uint32Array(mergeTo),
        }),
      );
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

/**
 * Perform a 3D boolean by tessellating OCCT operands, running the
 * boolean in Manifold (robust mesh-based CSG), and converting the
 * result back to an OCCT shape.
 *
 * Falls back to OCCT's native boolean if Manifold rejects the mesh
 * (e.g. non-manifold tessellation that can't be welded).
 */
function hybridBooleanViaManifold(oc: OCCTModule, boolOp: string, shapes: any[]): any {
  const wasm = getWasm();

  // Convert each operand to Manifold.
  // Sentinels (from nested booleans) already contain a Manifold.
  // OCCT shapes are tessellated and imported.
  const manifolds: any[] = [];
  let conversionFailed = false;
  for (const shape of shapes) {
    if (isManifoldSentinel(shape)) {
      manifolds.push(shape.manifold);
    } else {
      try {
        manifolds.push(occtShapeToManifold(oc, shape, wasm));
      } catch {
        conversionFailed = true;
        break;
      }
    }
  }

  if (conversionFailed) {
    // Some OCCT shapes couldn't be converted to Manifold even after
    // multiple tolerance attempts. Fall back:
    // - If no sentinels, try OCCT native boolean
    // - If sentinels present, bail to full Manifold pipeline via kernel
    const hasSentinel = shapes.some(isManifoldSentinel);
    if (hasSentinel) {
      throw new OCCTUnsupportedError('hybrid boolean: non-manifold OCCT mesh');
    }
    return occtNativeBoolean(oc, boolOp, shapes);
  }

  // Boolean in Manifold
  let result: any;
  switch (boolOp) {
    case 'union':
      result = wasm.Manifold.union(manifolds);
      break;
    case 'difference': {
      result = manifolds[0];
      for (let i = 1; i < manifolds.length; i++) {
        result = result.subtract(manifolds[i]);
      }
      break;
    }
    case 'intersection':
      result = wasm.Manifold.intersection(manifolds);
      break;
    default:
      throw new Error(`Unknown boolean op: ${boolOp}`);
  }

  return wrapManifoldSentinel(result);
}

/**
 * OCCT native boolean — used as fallback when Manifold rejects the mesh.
 */
function occtNativeBoolean(oc: OCCTModule, boolOp: string, shapes: any[]): any {
  if (shapes.length === 2) {
    const op =
      boolOp === 'union' ? new oc.BRepAlgoAPI_Fuse_3(shapes[0], shapes[1], new oc.Message_ProgressRange_1()) :
      boolOp === 'difference' ? new oc.BRepAlgoAPI_Cut_3(shapes[0], shapes[1], new oc.Message_ProgressRange_1()) :
      new oc.BRepAlgoAPI_Common_3(shapes[0], shapes[1], new oc.Message_ProgressRange_1());
    op.Build(new oc.Message_ProgressRange_1());
    return op.Shape();
  }

  const args = new oc.TopTools_ListOfShape_1();
  args.Append_1(shapes[0]);
  const tools = new oc.TopTools_ListOfShape_1();
  for (let i = 1; i < shapes.length; i++) tools.Append_1(shapes[i]);

  const op =
    boolOp === 'union' ? new oc.BRepAlgoAPI_Fuse_1() :
    boolOp === 'difference' ? new oc.BRepAlgoAPI_Cut_1() :
    new oc.BRepAlgoAPI_Common_1();
  op.SetArguments(args);
  op.SetTools(tools);
  op.Build(new oc.Message_ProgressRange_1());
  return op.Shape();
}

function lowerFilletPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'fillet' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
  if (isManifoldSentinel(base)) throw new OCCTUnsupportedError('fillet after hybrid boolean');

  const selection = resolveSupportedEdgeFeatureSelection(plan.base, plan.edge);
  if (!selection.ok) throw new Error(selection.issue.reason);
  if (
    selection.selection.quadrant[0] !== plan.quadrant[0]
    || selection.selection.quadrant[1] !== plan.quadrant[1]
  ) {
    throw new Error(
      `filletEdge() currently supports ${selection.selection.edgeName} only with quadrant [${selection.selection.quadrant[0]}, ${selection.selection.quadrant[1]}].`,
    );
  }

  // Find the matching edge in the OCCT shape
  // Use the edge selection data to identify which edge to fillet
  const mkFillet = new oc.BRepFilletAPI_MakeFillet(
    base,
    oc.ChFi3d_FilletShape.ChFi3d_Rational,
  );

  // Find the edge closest to the selection's start/end points
  const sel = selection.selection;
  const midX = (sel.start[0] + sel.end[0]) / 2;
  const midY = (sel.start[1] + sel.end[1]) / 2;
  const midZ = (sel.start[2] + sel.end[2]) / 2;

  let bestEdge: any = null;
  let bestDist = Infinity;

  const edgeExpl = new oc.TopExp_Explorer_2(
    base,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  while (edgeExpl.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExpl.Current());
    // Get edge midpoint via BRep_Tool
    const first = { current: 0 };
    const last = { current: 0 };
    const curve = oc.BRep_Tool.Curve_2(edge, first, last);
    if (!curve.IsNull()) {
      const midParam = (first.current + last.current) / 2;
      const pt = curve.get().Value(midParam);
      const dx = pt.X() - midX;
      const dy = pt.Y() - midY;
      const dz = pt.Z() - midZ;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = edge;
      }
    }
    edgeExpl.Next();
  }

  if (!bestEdge) throw new Error('Could not find matching edge for fillet');

  mkFillet.Add_2(plan.radius, bestEdge);
  mkFillet.Build(new oc.Message_ProgressRange_1());

  if (!mkFillet.IsDone()) {
    throw new Error('OCCT fillet operation failed');
  }

  return mkFillet.Shape();
}

function lowerChamferPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'chamfer' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
  if (isManifoldSentinel(base)) throw new OCCTUnsupportedError('chamfer after hybrid boolean');

  const selection = resolveSupportedEdgeFeatureSelection(plan.base, plan.edge);
  if (!selection.ok) throw new Error(selection.issue.reason);

  const mkChamfer = new oc.BRepFilletAPI_MakeChamfer(base);

  const sel = selection.selection;
  const midX = (sel.start[0] + sel.end[0]) / 2;
  const midY = (sel.start[1] + sel.end[1]) / 2;
  const midZ = (sel.start[2] + sel.end[2]) / 2;

  let bestEdge: any = null;
  let bestDist = Infinity;

  const edgeExpl = new oc.TopExp_Explorer_2(
    base,
    oc.TopAbs_ShapeEnum.TopAbs_EDGE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE,
  );
  while (edgeExpl.More()) {
    const edge = oc.TopoDS.Edge_1(edgeExpl.Current());
    const first = { current: 0 };
    const last = { current: 0 };
    const curve = oc.BRep_Tool.Curve_2(edge, first, last);
    if (!curve.IsNull()) {
      const midParam = (first.current + last.current) / 2;
      const pt = curve.get().Value(midParam);
      const dx = pt.X() - midX;
      const dy = pt.Y() - midY;
      const dz = pt.Z() - midZ;
      const dist = dx * dx + dy * dy + dz * dz;
      if (dist < bestDist) {
        bestDist = dist;
        bestEdge = edge;
      }
    }
    edgeExpl.Next();
  }

  if (!bestEdge) throw new Error('Could not find matching edge for chamfer');

  mkChamfer.Add_2(plan.size, bestEdge);
  mkChamfer.Build(new oc.Message_ProgressRange_1());

  if (!mkChamfer.IsDone()) {
    throw new Error('OCCT chamfer operation failed');
  }

  return mkChamfer.Shape();
}

/**
 * Lower a ShapeCompilePlan into an OCCT TopoDS_Shape.
 *
 * Throws for operations that require Manifold (levelSet, hull, etc.)
 * — the caller should catch and fall back to the Manifold lowerer.
 */
export function lowerShapeCompilePlanToOCCT(
  plan: ShapeCompilePlan,
  oc?: OCCTModule,
): any {
  // Return cached OCCT shape if this plan node was already lowered.
  // The cache is set on plan objects by this function and preserved
  // across clones by cloneShapeCompilePlan(). This avoids re-lowering
  // the entire plan tree on every chained Shape operation.
  const cached = (plan as any)._occtCache;
  if (cached) return cached;

  const shape = _lowerShapeCompilePlanToOCCTInner(plan, oc);
  (plan as any)._occtCache = shape;
  return shape;
}

function _lowerShapeCompilePlanToOCCTInner(
  plan: ShapeCompilePlan,
  oc?: OCCTModule,
): any {
  if (!oc) oc = getOCCT();

  let result: any;
  switch (plan.kind) {
    case 'box':
      if (plan.center) {
        const box = new oc.BRepPrimAPI_MakeBox_2(plan.x, plan.y, plan.z);
        const trsf = new oc.gp_Trsf_1();
        trsf.SetTranslation_1(new oc.gp_Vec_4(-plan.x / 2, -plan.y / 2, -plan.z / 2));
        const transformed = new oc.BRepBuilderAPI_Transform_2(box.Shape(), trsf, true);
        return transformed.Shape();
      }
      return new oc.BRepPrimAPI_MakeBox_2(plan.x, plan.y, plan.z).Shape();

    case 'cylinder': {
      const radiusTop = plan.radiusTop != null && plan.radiusTop >= 0 ? plan.radiusTop : plan.radius;
      let shape: any;
      if (Math.abs(radiusTop - plan.radius) < 1e-10) {
        shape = new oc.BRepPrimAPI_MakeCylinder_1(plan.radius, plan.height).Shape();
      } else {
        // Cone/frustum
        shape = new oc.BRepPrimAPI_MakeCone_1(plan.radius, radiusTop, plan.height).Shape();
      }
      if (plan.center) {
        const trsf = new oc.gp_Trsf_1();
        trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, -plan.height / 2));
        const transformed = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
        return transformed.Shape();
      }
      return shape;
    }

    case 'sphere':
      return new oc.BRepPrimAPI_MakeSphere_1(plan.radius).Shape();

    case 'extrude': {
      const face = lowerProfileToFace(oc, plan.profile);
      const height = plan.height;
      const vec = new oc.gp_Vec_4(0, 0, height);

      if (plan.scaleTop && (plan.scaleTop[0] !== 1 || plan.scaleTop[1] !== 1)) {
        throw new OCCTUnsupportedError('extrude with scaleTop');
      }

      const prism = new oc.BRepPrimAPI_MakePrism_1(face, vec, false, true);
      prism.Build(new oc.Message_ProgressRange_1());
      let result = prism.Shape();

      if (plan.center) {
        const trsf = new oc.gp_Trsf_1();
        trsf.SetTranslation_1(new oc.gp_Vec_4(0, 0, -height / 2));
        const transformed = new oc.BRepBuilderAPI_Transform_2(result, trsf, true);
        result = transformed.Shape();
      }

      return result;
    }

    case 'revolve': {
      const face = lowerProfileToFace(oc, plan.profile);
      // Manifold revolve maps 2D-X → radial distance, 2D-Y → 3D-Z height,
      // revolving around Z. The OCCT face lives in XY (z=0), so rotate it
      // 90° around X to move it into the XZ plane before revolving around Z.
      const rot = new oc.gp_Trsf_1();
      rot.SetRotation_1(
        new oc.gp_Ax1_2(new oc.gp_Pnt_3(0, 0, 0), new oc.gp_Dir_4(1, 0, 0)),
        Math.PI / 2,
      );
      const rotated = new oc.BRepBuilderAPI_Transform_2(face, rot, true);
      const rotatedFace = rotated.Shape();

      const axis = new oc.gp_Ax1_2(
        new oc.gp_Pnt_3(0, 0, 0),
        new oc.gp_Dir_4(0, 0, 1),
      );
      const degrees = plan.degrees ?? 360;
      const radians = degrees * Math.PI / 180;
      const revol = new oc.BRepPrimAPI_MakeRevol_1(rotatedFace, axis, radians, true);
      revol.Build(new oc.Message_ProgressRange_1());
      if (!revol.IsDone()) {
        throw new Error('OCCT revolve failed — profile may be too complex or self-intersecting');
      }
      return revol.Shape();
    }

    case 'boolean':
      return lowerBooleanPlan(oc, plan);

    case 'transform': {
      const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
      // If the base is a Manifold sentinel (from a hybrid boolean),
      // apply transforms to the Manifold object and keep the sentinel.
      if (isManifoldSentinel(base)) {
        let m = base.manifold;
        for (const step of plan.steps) {
          switch (step.kind) {
            case 'translate':
              m = m.translate(step.x, step.y, step.z);
              break;
            case 'rotate':
              m = m.rotate([step.xDeg, step.yDeg, step.zDeg]);
              break;
            case 'scale':
              m = m.scale([step.x, step.y, step.z]);
              break;
          }
        }
        return wrapManifoldSentinel(m);
      }
      return applyShapeTransforms(oc, base, plan.steps);
    }

    case 'queryOwner':
      return lowerShapeCompilePlanToOCCT(plan.base, oc);

    case 'fillet':
      return lowerFilletPlan(oc, plan);

    case 'chamfer':
      return lowerChamferPlan(oc, plan);

    case 'trimByPlane': {
      const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
      if (isManifoldSentinel(base)) throw new OCCTUnsupportedError('trimByPlane after hybrid boolean');
      const normal = [plan.normalX, plan.normalY, plan.normalZ] as [number, number, number];
      const pnt = new oc.gp_Pnt_3(
        normal[0] * plan.originOffset,
        normal[1] * plan.originOffset,
        normal[2] * plan.originOffset,
      );
      const pln = new oc.gp_Pln_3(pnt, new oc.gp_Dir_4(normal[0], normal[1], normal[2]));
      const halfSpaceFace = new oc.BRepBuilderAPI_MakeFace_9(pln, -1e6, 1e6, -1e6, 1e6).Face();
      const halfSpace = new oc.BRepPrimAPI_MakeHalfSpace_1(
        halfSpaceFace,
        new oc.gp_Pnt_3(
          normal[0] * (plan.originOffset - 1),
          normal[1] * (plan.originOffset - 1),
          normal[2] * (plan.originOffset - 1),
        ),
      );
      const cut = new oc.BRepAlgoAPI_Cut_3(
        base, halfSpace.Solid(), new oc.Message_ProgressRange_1(),
      );
      cut.Build(new oc.Message_ProgressRange_1());
      return cut.Shape();
    }

    case 'shell': {
      const lowered = lowerShellShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToOCCT(lowered.plan, oc);
    }

    case 'hole': {
      const lowered = lowerHoleShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToOCCT(lowered.plan, oc);
    }

    case 'cut': {
      const lowered = lowerCutShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToOCCT(lowered.plan, oc);
    }

    case 'sheetMetal':
      return lowerShapeCompilePlanToOCCT(lowerSheetMetalBasePlan(plan.model, plan.output), oc);

    // These require Manifold's levelSet or specialized mesh ops.
    // The caller should catch and fall back.
    case 'loft':
      throw new OCCTUnsupportedError('loft');
    case 'sweep':
      throw new OCCTUnsupportedError('sweep');
    case 'hull':
      throw new OCCTUnsupportedError('hull');
    case 'opaque':
      throw new Error('Cannot lower opaque compile plan to OCCT — opaque plans must be intercepted before lowering');
  }
}

/**
 * Sentinel error for operations OCCT doesn't support.
 * The caller catches this to fall back to Manifold.
 */
export class OCCTUnsupportedError extends Error {
  constructor(public readonly operation: string) {
    super(`OCCT does not support ${operation} — falling back to Manifold`);
    this.name = 'OCCTUnsupportedError';
  }
}

/**
 * Lower a ShapeCompilePlan to a ShapeBackend (OCCT primary, Manifold fallback).
 */
export function lowerShapeCompilePlanToOCCTBackend(
  plan: ShapeCompilePlan,
): ShapeBackend {
  const oc = getOCCT();
  const shape = lowerShapeCompilePlanToOCCT(plan, oc);
  // If the plan contained a 3D boolean, the result is a Manifold sentinel
  // (because OCCT's boolean engine is unreliable for coincident geometry).
  if (isManifoldSentinel(shape)) {
    return wrapManifoldShapeBackend(shape.manifold);
  }
  return wrapOCCTShapeBackend(shape);
}

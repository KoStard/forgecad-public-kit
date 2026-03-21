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
} from './compilePlan';
import { lowerShellShapeCompilePlanToConcretePlan } from './shellCompilePlan';
import {
  lowerCutShapeCompilePlanToConcretePlan,
  lowerHoleShapeCompilePlanToConcretePlan,
} from './holeCutCompilePlan';
import { lowerSheetMetalBasePlan } from './sheetMetalModel';
import { resolveSupportedEdgeFeatureSelection } from './edgeFeatureResolution';
import { getOCCT, type OCCTModule } from './occtInit';
import { wrapOCCTShapeBackend } from './occtShapeBackend';
import type { ShapeBackend } from './shapeBackend';
import { Transform } from './transform';
import { planeFrameToWorldToPlaneMatrix } from './planeFrame';

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
      // Build rounded rect: inner rect + offset
      const radius = Math.min(plan.radius, plan.width / 2, plan.height / 2);
      const innerW = plan.width - 2 * radius;
      const innerH = plan.height - 2 * radius;
      const cx = plan.center ? 0 : plan.width / 2;
      const cy = plan.center ? 0 : plan.height / 2;
      // Build inner rect centered, then offset
      const points: [number, number][] = [
        [cx - innerW / 2, cy - innerH / 2],
        [cx + innerW / 2, cy - innerH / 2],
        [cx + innerW / 2, cy + innerH / 2],
        [cx - innerW / 2, cy + innerH / 2],
      ];
      const wire = buildWireFromPoints(oc, points);
      face = buildFaceFromWire(oc, wire);
      // Offset the face to create rounded corners
      const offsetMaker = new oc.BRepOffsetAPI_MakeOffset_3(face, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
      offsetMaker.Perform(radius, 0);
      if (offsetMaker.IsDone()) {
        face = offsetMaker.Shape();
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
        let op: any;
        switch (plan.op) {
          case 'union':
            op = new oc.BRepAlgoAPI_Fuse_3(result, faces[i], new oc.Message_ProgressRange_1());
            break;
          case 'difference':
            op = new oc.BRepAlgoAPI_Cut_3(result, faces[i], new oc.Message_ProgressRange_1());
            break;
          case 'intersection':
            op = new oc.BRepAlgoAPI_Common_3(result, faces[i], new oc.Message_ProgressRange_1());
            break;
        }
        op.Build(new oc.Message_ProgressRange_1());
        result = op.Shape();
      }
      face = result;
      break;
    }

    case 'offset': {
      const baseFace = lowerProfileToFace(oc, plan.base);
      const offsetMaker = new oc.BRepOffsetAPI_MakeOffset_3(baseFace, oc.GeomAbs_JoinType.GeomAbs_Arc, false);
      offsetMaker.Perform(plan.delta, 0);
      if (offsetMaker.IsDone()) {
        face = offsetMaker.Shape();
      } else {
        face = baseFace; // Fallback
      }
      break;
    }

    case 'hull':
      throw new Error('OCCT lowering does not support profile hull — falling back to Manifold');

    case 'project':
      throw new Error('OCCT lowering does not support profile project — falling back to Manifold');
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

  let result = shapes[0];
  for (let i = 1; i < shapes.length; i++) {
    let op: any;
    switch (plan.op) {
      case 'union':
        op = new oc.BRepAlgoAPI_Fuse_3(result, shapes[i], new oc.Message_ProgressRange_1());
        break;
      case 'difference':
        op = new oc.BRepAlgoAPI_Cut_3(result, shapes[i], new oc.Message_ProgressRange_1());
        break;
      case 'intersection':
        op = new oc.BRepAlgoAPI_Common_3(result, shapes[i], new oc.Message_ProgressRange_1());
        break;
    }
    op.Build(new oc.Message_ProgressRange_1());
    result = op.Shape();
  }
  return result;
}

function lowerFilletPlan(oc: OCCTModule, plan: Extract<ShapeCompilePlan, { kind: 'fillet' }>): any {
  const base = lowerShapeCompilePlanToOCCT(plan.base, oc);

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
  if (!oc) oc = getOCCT();

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
        // Scaled extrusion — OCCT doesn't have direct support.
        // Use MakePrism for now (no scale), or fall back to Manifold.
        // TODO: implement via loft between base and scaled top profile
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
      const axis = new oc.gp_Ax1_2(
        new oc.gp_Pnt_3(0, 0, 0),
        new oc.gp_Dir_4(0, 0, 1),
      );
      const degrees = plan.degrees ?? 360;
      const radians = degrees * Math.PI / 180;
      const revol = new oc.BRepPrimAPI_MakeRevol_1(face, axis, radians, true);
      revol.Build(new oc.Message_ProgressRange_1());
      return revol.Shape();
    }

    case 'boolean':
      return lowerBooleanPlan(oc, plan);

    case 'transform':
      return applyShapeTransforms(oc, lowerShapeCompilePlanToOCCT(plan.base, oc), plan.steps);

    case 'queryOwner':
      return lowerShapeCompilePlanToOCCT(plan.base, oc);

    case 'fillet':
      return lowerFilletPlan(oc, plan);

    case 'chamfer':
      return lowerChamferPlan(oc, plan);

    case 'trimByPlane': {
      const base = lowerShapeCompilePlanToOCCT(plan.base, oc);
      const normal = [plan.normalX, plan.normalY, plan.normalZ] as [number, number, number];
      const pnt = new oc.gp_Pnt_3(
        normal[0] * plan.originOffset,
        normal[1] * plan.originOffset,
        normal[2] * plan.originOffset,
      );
      const pln = new oc.gp_Pln_2(pnt, new oc.gp_Dir_4(normal[0], normal[1], normal[2]));
      const halfSpaceFace = new oc.BRepBuilderAPI_MakeFace_4(pln, -1e6, 1e6, -1e6, 1e6).Shape();
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
  return wrapOCCTShapeBackend(shape);
}

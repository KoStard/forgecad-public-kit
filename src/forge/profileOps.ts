/**
 * Backend-dispatched profile factory and batch operations.
 *
 * These functions create or combine ProfileBackend instances without
 * exposing any backend-specific types.  Sketch-layer code should use
 * these instead of reaching into `backends/manifold/` or `backends/occt/` directly.
 *
 * Dispatch follows the same _activeBackend selector used by
 * buildShapeFromCompilePlan() in kernel.ts.
 */

import type { ProfileBackend } from './profileBackend';
import type { ProfileCompilePlan } from './compilePlan';
import { getActiveBackend } from './kernel';

// ── Manifold imports (lazy) ───────────────────────────────────────

import { getWasm } from './backends/manifold/wasm';
import { wrapManifoldProfileBackend, requireManifoldCrossSection } from './backends/manifold/profileBackend';
import { lowerProfileCompilePlanToCrossSection } from './backends/manifold/lower';

// ── OCCT imports (lazy) ───────────────────────────────────────────

import { getOCCT } from './backends/occt/init';
import { wrapOCCTProfileBackend, requireOCCTFace } from './backends/occt/profileBackend';
import { lowerProfileCompilePlanToOCCTProfileBackend } from './backends/occt/lower';

// ── Factories ─────────────────────────────────────────────────────

export function createCircleProfile(radius: number, segments = 0): ProfileBackend {
  if (getActiveBackend() === 'occt') {
    const oc = getOCCT();
    const axis = new oc.gp_Ax2_3(
      new oc.gp_Pnt_3(0, 0, 0),
      new oc.gp_Dir_4(0, 0, 1),
    );
    const circle = new oc.gp_Circ_2(axis, radius);
    const edge = new oc.BRepBuilderAPI_MakeEdge_8(circle).Edge();
    const wire = new oc.BRepBuilderAPI_MakeWire_2(edge).Wire();
    const face = new oc.BRepBuilderAPI_MakeFace_15(wire, true).Face();
    return wrapOCCTProfileBackend(face);
  }
  return wrapManifoldProfileBackend(getWasm().CrossSection.circle(radius, segments));
}

export function createSquareProfile(size: [number, number], center: boolean): ProfileBackend {
  if (getActiveBackend() === 'occt') {
    const oc = getOCCT();
    const x0 = center ? -size[0] / 2 : 0;
    const y0 = center ? -size[1] / 2 : 0;
    const points: [number, number][] = [
      [x0, y0], [x0 + size[0], y0],
      [x0 + size[0], y0 + size[1]], [x0, y0 + size[1]],
    ];
    const wire = buildOCCTWireFromPoints(oc, points);
    const face = new oc.BRepBuilderAPI_MakeFace_15(wire, true).Face();
    return wrapOCCTProfileBackend(face);
  }
  return wrapManifoldProfileBackend(getWasm().CrossSection.square(size, center));
}

export function createPolygonProfile(loops: number[][][]): ProfileBackend {
  if (getActiveBackend() === 'occt') {
    const oc = getOCCT();
    if (loops.length === 0) return createEmptyProfile();
    // First loop is outer boundary
    const outerWire = buildOCCTWireFromPoints(oc, loops[0] as [number, number][]);
    const mkFace = new oc.BRepBuilderAPI_MakeFace_15(outerWire, true);
    // Additional loops are holes
    for (let i = 1; i < loops.length; i++) {
      const holeWire = buildOCCTWireFromPoints(oc, loops[i] as [number, number][]);
      mkFace.Add(holeWire);
    }
    return wrapOCCTProfileBackend(mkFace.Face());
  }
  return wrapManifoldProfileBackend(new (getWasm().CrossSection)(loops as any));
}

export function createEmptyProfile(): ProfileBackend {
  if (getActiveBackend() === 'occt') {
    const oc = getOCCT();
    // Create a null/empty face via subtracting a square from itself
    const pts: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const wire = buildOCCTWireFromPoints(oc, pts);
    const face = new oc.BRepBuilderAPI_MakeFace_15(wire, true).Face();
    const outerWire = oc.BRepTools.OuterWire(oc.TopoDS.Face_1(face));
    const mkFace = new oc.BRepBuilderAPI_MakeFace_15(outerWire, true);
    mkFace.Add(oc.TopoDS.Wire_1(outerWire.Reversed()));
    return wrapOCCTProfileBackend(mkFace.Face());
  }
  const wasm = getWasm();
  const unit = wasm.CrossSection.square([1, 1], false);
  return wrapManifoldProfileBackend(wasm.CrossSection.difference([unit, unit]));
}

// ── Batch booleans ───────────────────────────────────────────────

export function profileUnion(profiles: ProfileBackend[]): ProfileBackend {
  if (getActiveBackend() === 'occt') {
    const oc = getOCCT();
    if (profiles.length === 0) return createEmptyProfile();
    let result = requireOCCTFace(profiles[0]);
    for (let i = 1; i < profiles.length; i++) {
      const op = new oc.BRepAlgoAPI_Fuse_3(result, requireOCCTFace(profiles[i]), new oc.Message_ProgressRange_1());
      op.Build(new oc.Message_ProgressRange_1());
      result = shapeToFaceOCCT(oc, op.Shape());
    }
    return wrapOCCTProfileBackend(result);
  }
  return wrapManifoldProfileBackend(
    getWasm().CrossSection.union(profiles.map(requireManifoldCrossSection)),
  );
}

export function profileDifference(profiles: ProfileBackend[]): ProfileBackend {
  if (getActiveBackend() === 'occt') {
    const oc = getOCCT();
    if (profiles.length === 0) return createEmptyProfile();
    let result = requireOCCTFace(profiles[0]);
    for (let i = 1; i < profiles.length; i++) {
      result = occtProfileDifference(oc, result, requireOCCTFace(profiles[i]));
    }
    return wrapOCCTProfileBackend(result);
  }
  return wrapManifoldProfileBackend(
    getWasm().CrossSection.difference(profiles.map(requireManifoldCrossSection)),
  );
}

export function profileIntersection(profiles: ProfileBackend[]): ProfileBackend {
  if (getActiveBackend() === 'occt') {
    const oc = getOCCT();
    if (profiles.length === 0) return createEmptyProfile();
    let result = requireOCCTFace(profiles[0]);
    for (let i = 1; i < profiles.length; i++) {
      const op = new oc.BRepAlgoAPI_Common_3(result, requireOCCTFace(profiles[i]), new oc.Message_ProgressRange_1());
      op.Build(new oc.Message_ProgressRange_1());
      result = shapeToFaceOCCT(oc, op.Shape());
    }
    return wrapOCCTProfileBackend(result);
  }
  return wrapManifoldProfileBackend(
    getWasm().CrossSection.intersection(profiles.map(requireManifoldCrossSection)),
  );
}

// ── Compile plan lowering ─────────────────────────────────────────

export function lowerProfileCompilePlan(plan: ProfileCompilePlan): ProfileBackend {
  if (getActiveBackend() === 'occt') {
    return lowerProfileCompilePlanToOCCTProfileBackend(plan);
  }
  return wrapManifoldProfileBackend(
    lowerProfileCompilePlanToCrossSection(plan, getWasm()),
  );
}

// ── OCCT helpers (internal) ───────────────────────────────────────

function buildOCCTWireFromPoints(oc: any, points: [number, number][]): any {
  if (points.length < 3) throw new Error('Need at least 3 points for a wire');
  const edges: any[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    if (Math.abs(x1 - x2) < 1e-10 && Math.abs(y1 - y2) < 1e-10) continue;
    edges.push(new oc.BRepBuilderAPI_MakeEdge_3(
      new oc.gp_Pnt_3(x1, y1, 0),
      new oc.gp_Pnt_3(x2, y2, 0),
    ).Edge());
  }
  const mkWire = new oc.BRepBuilderAPI_MakeWire_2(edges[0]);
  for (let i = 1; i < edges.length; i++) mkWire.Add_1(edges[i]);
  return mkWire.Wire();
}

function shapeToFaceOCCT(oc: any, shape: any): any {
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
  const mkFace = new oc.BRepBuilderAPI_MakeFace_15(wires[0], true);
  for (let i = 1; i < wires.length; i++) mkFace.Add(wires[i]);
  return mkFace.Face();
}

function occtProfileDifference(oc: any, base: any, cutter: any): any {
  const baseFaceCast = oc.TopoDS.Face_1(base);
  const outerWire = oc.BRepTools.OuterWire(baseFaceCast);
  const mkFace = new oc.BRepBuilderAPI_MakeFace_15(outerWire, true);

  const wireExpl = new oc.TopExp_Explorer_2(base, oc.TopAbs_ShapeEnum.TopAbs_WIRE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
  while (wireExpl.More()) {
    const wire = oc.TopoDS.Wire_1(wireExpl.Current());
    if (!wire.IsSame(outerWire)) mkFace.Add(wire);
    wireExpl.Next();
  }

  const cutterFaceCast = oc.TopoDS.Face_1(cutter);
  const cutterOuterWire = oc.BRepTools.OuterWire(cutterFaceCast);
  mkFace.Add(oc.TopoDS.Wire_1(cutterOuterWire.Reversed()));
  return mkFace.Face();
}

import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type {
  ProfileCompilePlan,
  ProfileCompileTransformStep,
  ShapeCompilePlan,
  ShapeCompileTransformStep,
} from '../../compilePlan';
import {
  lowerCutShapeCompilePlanToConcretePlan,
  lowerHoleShapeCompilePlanToConcretePlan,
} from '../../holeCutCompilePlan';
import { lowerShellShapeCompilePlanToConcretePlan } from '../../shellCompilePlan';
import { lowerSheetMetalBasePlan } from '../../sheetMetalModel';
import type { ShapeBackend } from '../../shapeBackend';
import { wrapManifoldShapeBackend } from './shapeBackend';
import { buildLoftLevelSetInput, buildSweepLevelSetInput } from '../../sketch/loftSweepLowering';
import { loftStitched } from './loftStitched';
import { Transform } from '../../transform';
import { planeFrameToWorldToPlaneMatrix } from '../../planeFrame';
import { resolveSupportedEdgeFeatureSelection } from '../../edgeFeatureResolution';
import {
  applyChamferSelectionToManifold,
  applyConcaveChamferSelectionToManifold,
  applyFilletSelectionToManifold,
  applyConcaveFilletSelectionToManifold,
} from './edgeFeatureRuntime';
import { parseMeshFile } from '../../meshParsers';
import type { MeshFormat } from '../../meshParsers';
import { extractEdgeSegments, type EdgeSegment } from '../../meshEdgeExtraction';
import type { EdgeFeatureTarget } from '../../shapeBackend';
import type { Vec3 } from '../../transform';

function applyProfileCompileTransform(
  crossSection: CrossSection,
  step: ProfileCompileTransformStep,
): CrossSection {
  switch (step.kind) {
    case 'translate':
      return crossSection.translate(step.x, step.y);
    case 'rotate':
      return crossSection.rotate(step.degrees);
    case 'scale':
      return crossSection.scale([step.x, step.y] as [number, number]);
    case 'mirror':
      return crossSection.mirror([step.normalX, step.normalY]);
  }
}

function applyProfileCompileTransforms(
  crossSection: CrossSection,
  transforms: ProfileCompileTransformStep[],
): CrossSection {
  let out = crossSection;
  for (const step of transforms) {
    out = applyProfileCompileTransform(out, step);
  }
  return out;
}

function lowerProfileBooleanCompilePlan(plan: Extract<ProfileCompilePlan, { kind: 'boolean' }>, wasm: ManifoldToplevel): CrossSection {
  const profiles = plan.profiles.map((profile) => lowerProfileCompilePlanToCrossSection(profile, wasm));
  if (profiles.length === 0) {
    throw new Error(`Cannot lower empty profile boolean (${plan.op})`);
  }
  if (profiles.length === 1) {
    return applyProfileCompileTransforms(profiles[0], plan.transforms);
  }

  const combined = (() => {
    switch (plan.op) {
      case 'union':
        return wasm.CrossSection.union(profiles);
      case 'difference':
        return wasm.CrossSection.difference(profiles);
      case 'intersection':
        return wasm.CrossSection.intersection(profiles);
    }
  })();

  return applyProfileCompileTransforms(combined, plan.transforms);
}

function lowerProfileHullCompilePlan(plan: Extract<ProfileCompilePlan, { kind: 'hull' }>, wasm: ManifoldToplevel): CrossSection {
  const profiles = plan.profiles.map((profile) => lowerProfileCompilePlanToCrossSection(profile, wasm));
  if (profiles.length === 0) {
    throw new Error('Cannot lower empty profile hull');
  }
  if (profiles.length === 1) {
    return applyProfileCompileTransforms(profiles[0], plan.transforms);
  }
  return applyProfileCompileTransforms(wasm.CrossSection.hull(profiles), plan.transforms);
}

export function lowerProfileCompilePlanToCrossSection(
  plan: ProfileCompilePlan,
  wasm: ManifoldToplevel,
): CrossSection {
  switch (plan.kind) {
    case 'rect':
      return applyProfileCompileTransforms(
        wasm.CrossSection.square([plan.width, plan.height], plan.center),
        plan.transforms,
      );
    case 'roundedRect': {
      const radius = Math.min(plan.radius, plan.width / 2, plan.height / 2);
      const crossSection = wasm.CrossSection.square([plan.width - 2 * radius, plan.height - 2 * radius], true)
        .translate(plan.center ? 0 : plan.width / 2, plan.center ? 0 : plan.height / 2)
        .offset(radius, 'Round');
      return applyProfileCompileTransforms(crossSection, plan.transforms);
    }
    case 'circle':
      return applyProfileCompileTransforms(wasm.CrossSection.circle(plan.radius, plan.segments ?? 0), plan.transforms);
    case 'polygon':
      return applyProfileCompileTransforms(new wasm.CrossSection([plan.points]), plan.transforms);
    case 'boolean':
      return lowerProfileBooleanCompilePlan(plan, wasm);
    case 'offset':
      return applyProfileCompileTransforms(
        lowerProfileCompilePlanToCrossSection(plan.base, wasm).offset(plan.delta, plan.join),
        plan.transforms,
      );
    case 'hull':
      return lowerProfileHullCompilePlan(plan, wasm);
    case 'project': {
      const projected = lowerShapeCompilePlanToManifold(plan.sourceShape, wasm)
        .transform(planeFrameToWorldToPlaneMatrix(plan.plane))
        .project();
      return applyProfileCompileTransforms(projected, plan.transforms);
    }
  }
}

function applyShapeCompileTransform(manifold: Manifold, step: ShapeCompileTransformStep): Manifold {
  switch (step.kind) {
    case 'translate':
      return manifold.translate(step.x, step.y, step.z);
    case 'rotate':
      return manifold.rotate(step.xDeg, step.yDeg, step.zDeg);
    case 'scale':
      return manifold.scale([step.x, step.y, step.z] as [number, number, number]);
    case 'rotateAround':
      return manifold.transform(
        Transform.rotationAxis(
          [step.axisX, step.axisY, step.axisZ],
          step.degrees,
          [step.pivotX, step.pivotY, step.pivotZ],
        ).toArray(),
      );
    case 'mirror':
      return manifold.mirror([step.normalX, step.normalY, step.normalZ]);
    case 'workplanePlacement':
      return manifold.transform(step.matrix);
  }
}

function applyShapeCompileTransforms(manifold: Manifold, steps: ShapeCompileTransformStep[]): Manifold {
  let out = manifold;
  for (const step of steps) {
    out = applyShapeCompileTransform(out, step);
  }
  return out;
}

function lowerShapeBooleanCompilePlan(plan: Extract<ShapeCompilePlan, { kind: 'boolean' }>, wasm: ManifoldToplevel): Manifold {
  const shapes = plan.shapes.map((shape) => lowerShapeCompilePlanToManifold(shape, wasm));
  if (shapes.length === 0) {
    throw new Error(`Cannot lower empty shape boolean (${plan.op})`);
  }
  if (shapes.length === 1) {
    return shapes[0];
  }

  switch (plan.op) {
    case 'union':
      return wasm.Manifold.union(shapes);
    case 'difference':
      return wasm.Manifold.difference(shapes);
    case 'intersection':
      return wasm.Manifold.intersection(shapes);
  }
}

function lowerShapeHullCompilePlan(plan: Extract<ShapeCompilePlan, { kind: 'hull' }>, wasm: ManifoldToplevel): Manifold {
  const shapeItems = plan.shapes.map((shape) => lowerShapeCompilePlanToManifold(shape, wasm));
  const items = [...shapeItems, ...plan.points.map(([x, y, z]) => [x, y, z] as [number, number, number])];
  if (items.length === 0) {
    throw new Error('Cannot lower empty shape hull');
  }
  return wasm.Manifold.hull(items);
}

function lowerShapeTrimByPlaneCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'trimByPlane' }>,
  wasm: ManifoldToplevel,
): Manifold {
  return lowerShapeCompilePlanToManifold(plan.base, wasm).trimByPlane(
    [plan.normalX, plan.normalY, plan.normalZ],
    plan.originOffset,
  );
}

function lowerShapeLoftCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'loft' }>,
  wasm: ManifoldToplevel,
): Manifold {
  const inputPolygons = plan.profiles.map((profile) => lowerProfileCompilePlanToCrossSection(profile, wasm).toPolygons() as [number, number][][]);

  // Try stitched path first if compatible (one loop per profile, same loop type)
  const canStitch = inputPolygons.length >= 2 && inputPolygons.every((p) => p.length === 1);
  if (canStitch) {
    const stitched = loftStitched(inputPolygons, plan.heights, wasm);
    if (stitched) return stitched;
  }

  const input = buildLoftLevelSetInput(
    inputPolygons,
    plan.heights,
    { edgeLength: plan.edgeLength, boundsPadding: plan.boundsPadding },
  );
  return wasm.Manifold.levelSet(input.sdf as any, input.bounds, input.edgeLength, 0);
}

function lowerShapeSweepCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'sweep' }>,
  wasm: ManifoldToplevel,
): Manifold {
  const input = buildSweepLevelSetInput(
    lowerProfileCompilePlanToCrossSection(plan.profile, wasm).toPolygons() as [number, number][][],
    plan.path.points.map(([x, y, z]) => [x, y, z]),
    {
      edgeLength: plan.edgeLength,
      boundsPadding: plan.boundsPadding,
      up: [plan.up[0], plan.up[1], plan.up[2]],
    },
  );
  return wasm.Manifold.levelSet(input.sdf as any, input.bounds, input.edgeLength, 0);
}

function lowerShapeFilletCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'fillet' }>,
  wasm: ManifoldToplevel,
): Manifold {
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
  return applyFilletSelectionToManifold(
    lowerShapeCompilePlanToManifold(plan.base, wasm),
    selection.selection,
    plan.radius,
    plan.segments,
    wasm,
  );
}

function lowerShapeChamferCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'chamfer' }>,
  wasm: ManifoldToplevel,
): Manifold {
  const selection = resolveSupportedEdgeFeatureSelection(plan.base, plan.edge);
  if (!selection.ok) throw new Error(selection.issue.reason);
  if (
    selection.selection.quadrant[0] !== plan.quadrant[0]
    || selection.selection.quadrant[1] !== plan.quadrant[1]
  ) {
    throw new Error(
      `chamferEdge() currently supports ${selection.selection.edgeName} only with quadrant [${selection.selection.quadrant[0]}, ${selection.selection.quadrant[1]}].`,
    );
  }
  return applyChamferSelectionToManifold(
    lowerShapeCompilePlanToManifold(plan.base, wasm),
    selection.selection,
    plan.size,
    wasm,
  );
}

function edgeSegmentToSelection(segment: EdgeSegment): import('../../edgeFeatureModel').ResolvedEdgeFeatureSelection {
  const { start, end, direction: axis, normalA, normalB, convex } = segment;

  const dotA = normalA[0] * axis[0] + normalA[1] * axis[1] + normalA[2] * axis[2];
  let bx = normalA[0] - dotA * axis[0];
  let by = normalA[1] - dotA * axis[1];
  let bz = normalA[2] - dotA * axis[2];
  let bLen = Math.sqrt(bx * bx + by * by + bz * bz);
  if (bLen < 1e-10) {
    const dotB = normalB[0] * axis[0] + normalB[1] * axis[1] + normalB[2] * axis[2];
    bx = normalB[0] - dotB * axis[0];
    by = normalB[1] - dotB * axis[1];
    bz = normalB[2] - dotB * axis[2];
    bLen = Math.sqrt(bx * bx + by * by + bz * bz);
  }
  if (bLen < 1e-10) throw new Error('Cannot compute fillet basis: edge normals are degenerate.');
  bx /= bLen; by /= bLen; bz /= bLen;
  const basisX: Vec3 = [bx, by, bz];
  const basisY: Vec3 = [
    axis[1] * bz - axis[2] * by,
    axis[2] * bx - axis[0] * bz,
    axis[0] * by - axis[1] * bx,
  ];

  const nAx = normalA[0] * basisX[0] + normalA[1] * basisX[1] + normalA[2] * basisX[2];
  const nAy = normalA[0] * basisY[0] + normalA[1] * basisY[1] + normalA[2] * basisY[2];
  const nBx = normalB[0] * basisX[0] + normalB[1] * basisX[1] + normalB[2] * basisX[2];
  const nBy = normalB[0] * basisY[0] + normalB[1] * basisY[1] + normalB[2] * basisY[2];

  const avgX = nAx + nBx;
  const avgY = nAy + nBy;

  function pickSurfaceDir(nx: number, ny: number): [number, number] {
    const perpAx = -ny, perpAy = nx;
    const perpBx = ny, perpBy = -nx;
    const dotA2 = perpAx * avgX + perpAy * avgY;
    const dotB2 = perpBx * avgX + perpBy * avgY;
    if (convex) {
      return dotA2 < dotB2 ? [perpAx, perpAy] : [perpBx, perpBy];
    } else {
      return dotA2 > dotB2 ? [perpAx, perpAy] : [perpBx, perpBy];
    }
  }

  const surfaceDirA = pickSurfaceDir(nAx, nAy);
  const surfaceDirB = pickSurfaceDir(nBx, nBy);

  const projX = avgX;
  const projY = avgY;
  const sign = convex ? -1 : 1;
  const quadrant: [number, number] = [
    projX >= 0 ? sign : -sign,
    projY >= 0 ? sign : -sign,
  ];

  return {
    kind: 'line-segment',
    edgeName: `mesh-edge-${segment.index}`,
    start: [start[0], start[1], start[2]],
    end: [end[0], end[1], end[2]],
    midpoint: [
      (start[0] + end[0]) * 0.5,
      (start[1] + end[1]) * 0.5,
      (start[2] + end[2]) * 0.5,
    ],
    axis: [axis[0], axis[1], axis[2]],
    basisX,
    basisY,
    quadrant,
    dihedralAngleDeg: segment.dihedralAngle,
    surfaceDirA,
    surfaceDirB,
    isConvex: convex,
  };
}

function matchEdgeSegmentByMidpoint(
  segments: EdgeSegment[],
  target: EdgeFeatureTarget,
): EdgeSegment | null {
  let best: EdgeSegment | null = null;
  let bestDist = Infinity;
  for (const seg of segments) {
    const dx = seg.midpoint[0] - target.midpoint[0];
    const dy = seg.midpoint[1] - target.midpoint[1];
    const dz = seg.midpoint[2] - target.midpoint[2];
    const dist = dx * dx + dy * dy + dz * dz;
    if (dist < bestDist) {
      bestDist = dist;
      best = seg;
    }
  }
  return best;
}

function lowerFilletEdgesCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'filletEdges' }>,
  wasm: ManifoldToplevel,
): Manifold {
  let manifold = lowerShapeCompilePlanToManifold(plan.base, wasm);
  const mesh = manifold.getMesh();
  const segments = extractEdgeSegments({
    numProp: mesh.numProp,
    numTri: mesh.numTri,
    triVerts: mesh.triVerts,
    vertProperties: mesh.vertProperties,
  });

  // Sort by edge length descending for stability
  const matched: EdgeSegment[] = [];
  for (const target of plan.edgeTargets) {
    const seg = matchEdgeSegmentByMidpoint(segments, target);
    if (seg && seg.length >= 1e-6) matched.push(seg);
  }
  matched.sort((a, b) => b.length - a.length);

  for (const seg of matched) {
    try {
      const selection = edgeSegmentToSelection(seg);
      const apply = seg.convex
        ? applyFilletSelectionToManifold
        : applyConcaveFilletSelectionToManifold;
      manifold = apply(manifold, selection, plan.radius, plan.segments, wasm);
    } catch {
      // Edge may have been consumed by a previous fillet — skip silently
    }
  }
  return manifold;
}

function lowerChamferEdgesCompilePlan(
  plan: Extract<ShapeCompilePlan, { kind: 'chamferEdges' }>,
  wasm: ManifoldToplevel,
): Manifold {
  let manifold = lowerShapeCompilePlanToManifold(plan.base, wasm);
  const mesh = manifold.getMesh();
  const segments = extractEdgeSegments({
    numProp: mesh.numProp,
    numTri: mesh.numTri,
    triVerts: mesh.triVerts,
    vertProperties: mesh.vertProperties,
  });

  const matched: EdgeSegment[] = [];
  for (const target of plan.edgeTargets) {
    const seg = matchEdgeSegmentByMidpoint(segments, target);
    if (seg && seg.length >= 1e-6) matched.push(seg);
  }
  matched.sort((a, b) => b.length - a.length);

  for (const seg of matched) {
    try {
      const selection = edgeSegmentToSelection(seg);
      const apply = seg.convex
        ? applyChamferSelectionToManifold
        : applyConcaveChamferSelectionToManifold;
      manifold = apply(manifold, selection, plan.size, wasm);
    } catch {
      // Edge may have been consumed by a previous chamfer — skip silently
    }
  }
  return manifold;
}

export function lowerShapeCompilePlanToManifold(
  plan: ShapeCompilePlan,
  wasm: ManifoldToplevel,
): Manifold {
  switch (plan.kind) {
    case 'box':
      return wasm.Manifold.cube([plan.x, plan.y, plan.z], plan.center);
    case 'cylinder':
      return wasm.Manifold.cylinder(plan.height, plan.radius, plan.radiusTop ?? -1, plan.segments ?? 0, plan.center);
    case 'sphere':
      return wasm.Manifold.sphere(plan.radius, plan.segments ?? 0);
    case 'extrude':
      return lowerProfileCompilePlanToCrossSection(plan.profile, wasm).extrude(
        plan.height,
        plan.twistSegments ?? 0,
        plan.twist ?? 0,
        plan.scaleTop as [number, number] | undefined,
        plan.center,
      );
    case 'sheetMetal':
      return lowerShapeCompilePlanToManifold(lowerSheetMetalBasePlan(plan.model, plan.output), wasm);
    case 'shell': {
      const lowered = lowerShellShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToManifold(lowered.plan, wasm);
    }
    case 'hole': {
      const lowered = lowerHoleShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToManifold(lowered.plan, wasm);
    }
    case 'cut': {
      const lowered = lowerCutShapeCompilePlanToConcretePlan(plan);
      if (!lowered.ok) throw new Error(lowered.reason);
      return lowerShapeCompilePlanToManifold(lowered.plan, wasm);
    }
    case 'revolve':
      return lowerProfileCompilePlanToCrossSection(plan.profile, wasm).revolve(plan.segments ?? 0, plan.degrees);
    case 'loft':
      return lowerShapeLoftCompilePlan(plan, wasm);
    case 'sweep':
      return lowerShapeSweepCompilePlan(plan, wasm);
    case 'boolean':
      return lowerShapeBooleanCompilePlan(plan, wasm);
    case 'transform':
      return applyShapeCompileTransforms(lowerShapeCompilePlanToManifold(plan.base, wasm), plan.steps);
    case 'queryOwner':
      return lowerShapeCompilePlanToManifold(plan.base, wasm);
    case 'fillet':
      return lowerShapeFilletCompilePlan(plan, wasm);
    case 'chamfer':
      return lowerShapeChamferCompilePlan(plan, wasm);
    case 'filletEdges':
      return lowerFilletEdgesCompilePlan(plan, wasm);
    case 'chamferEdges':
      return lowerChamferEdgesCompilePlan(plan, wasm);
    case 'hull':
      return lowerShapeHullCompilePlan(plan, wasm);
    case 'trimByPlane':
      return lowerShapeTrimByPlaneCompilePlan(plan, wasm);
    case 'importedMesh':
      return lowerImportedMeshToManifold(plan.fileData, plan.format, plan.filePath, wasm);
    case 'opaque':
      throw new Error('Cannot lower opaque compile plan to Manifold — opaque plans require runtime evaluation');
  }
}

function lowerImportedMeshToManifold(
  fileData: ArrayBuffer,
  format: MeshFormat,
  filePath: string,
  wasm: ManifoldToplevel,
): Manifold {
  const parsed = parseMeshFile(fileData, format);
  if (parsed.triVerts.length === 0) {
    throw new Error(`importMesh("${filePath}"): file contains no triangles`);
  }
  const wasmMesh = new wasm.Mesh({
    numProp: parsed.numProp,
    triVerts: parsed.triVerts,
    vertProperties: parsed.vertProperties,
    mergeFromVert: parsed.mergeFromVert.length > 0 ? parsed.mergeFromVert : undefined,
    mergeToVert: parsed.mergeToVert.length > 0 ? parsed.mergeToVert : undefined,
  });
  try {
    return new wasm.Manifold(wasmMesh);
  } catch (e) {
    throw new Error(
      `importMesh("${filePath}"): Manifold rejected the mesh — it may be non-manifold (non-watertight, self-intersecting, or degenerate). ` +
      `Original error: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export function lowerShapeCompilePlanToShapeBackend(
  plan: ShapeCompilePlan,
  wasm: ManifoldToplevel,
): ShapeBackend {
  return wrapManifoldShapeBackend(lowerShapeCompilePlanToManifold(plan, wasm));
}

import { Sketch, getSketchBrepProfilePlan, getSketchPlacement3D } from './core';
import { Shape, setShapeBrepPlan } from '../kernel';
import { TrackedShape, transformTopology, type Topology, type FaceName, type FaceRef, type EdgeName, type EdgeRef } from './topology';

function buildGenericExtrusionTopology(sketch: Sketch, height: number, center: boolean): Topology {
  const faces = new Map<FaceName, FaceRef>();
  const edges = new Map<EdgeName, EdgeRef>();
  const b = sketch.bounds();
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const zBot = center ? -height / 2 : 0;
  const zTop = center ? height / 2 : height;

  faces.set('top', {
    name: 'top',
    normal: [0, 0, 1],
    center: [cx, cy, zTop],
    planar: true,
    uAxis: [1, 0, 0],
    vAxis: [0, 1, 0],
  });
  faces.set('bottom', {
    name: 'bottom',
    normal: [0, 0, -1],
    center: [cx, cy, zBot],
    planar: true,
    uAxis: [1, 0, 0],
    vAxis: [0, -1, 0],
  });
  faces.set('side', {
    name: 'side',
    normal: [1, 0, 0],
    center: [b.max[0], cy, (zTop + zBot) / 2],
    planar: false,
  });

  return { faces, edges };
}

export function sketchExtrude(sketch: Sketch, height: number, opts?: {
  twist?: number;
  divisions?: number;
  scaleTop?: number | [number, number];
  center?: boolean;
}): TrackedShape {
  const scaleTop = typeof opts?.scaleTop === 'number'
    ? [opts.scaleTop, opts.scaleTop] as [number, number]
    : opts?.scaleTop;

  const m = sketch.cross.extrude(
    height,
    opts?.divisions ?? 0,
    opts?.twist ?? 0,
    scaleTop as any,
    opts?.center ?? false,
  );
  const shape = setShapeBrepPlan(new Shape(m, sketch.colorHex, {
    fidelity: 'kernel-native',
    sources: ['extrude'],
  }), (
    opts?.twist == null || opts.twist === 0
  ) && (
    opts?.divisions == null || opts.divisions === 0
  )
    ? (() => {
        const profile = getSketchBrepProfilePlan(sketch);
        if (!profile) return null;
        return {
          kind: 'extrude' as const,
          profile,
          height,
          center: opts?.center ?? false,
          scaleTop,
        };
      })()
    : null);
  const topo = buildGenericExtrusionTopology(sketch, height, opts?.center ?? false);
  const placed = new TrackedShape(shape, topo, 0, true);
  const placement = getSketchPlacement3D(sketch);
  if (!placement) return placed;
  return new TrackedShape(shape.transform(placement), transformTopology(topo, placement), 0, true);
}

export function sketchRevolve(sketch: Sketch, degrees = 360, segments?: number): Shape {
  const revolved = setShapeBrepPlan(new Shape(sketch.cross.revolve(segments ?? 0, degrees), sketch.colorHex, {
    fidelity: 'kernel-native',
    sources: ['revolve'],
  }), (() => {
    if (segments != null && segments > 0) return null;
    const profile = getSketchBrepProfilePlan(sketch);
    if (!profile) return null;
    return {
      kind: 'revolve' as const,
      profile,
      degrees,
    };
  })());
  const placement = getSketchPlacement3D(sketch);
  if (!placement) return revolved;
  return revolved.transform(placement);
}

Sketch.prototype.extrude = function (height: number, opts?: {
  twist?: number;
  divisions?: number;
  scaleTop?: number | [number, number];
  center?: boolean;
}) { return sketchExtrude(this, height, opts); };

Sketch.prototype.revolve = function (degrees = 360, segments?: number) { return sketchRevolve(this, degrees, segments); };

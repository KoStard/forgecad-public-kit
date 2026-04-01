/**
 * Thread, bolt, nut, washer, fastenerSet, and partLibrary.
 */

import { buildShapeFromCompilePlan, box, cylinder, Shape, union } from '../kernel';
import { type MetricSize, type FastenerFit, METRIC_HOLE_TABLE } from './basic-fasteners';
import { boltHole, fastenerHole, counterbore, tube, pipe, hexNut, roundedBox, bracket, holePattern } from './basic-fasteners';
import { tSlotProfile, tSlotExtrusion } from './tslot';
import { profile2020BSlot6Profile, profile2020BSlot6 } from './profiles-2020';
import { explode } from './explode';
import { pipeRoute, elbow } from './pipe-routing';
import { spurGear, bevelGear, faceGear, sideGear, ringGear, rackGear, gearPair, bevelGearPair, faceGearPair, sideGearPair } from './gears';

// ---------------------------------------------------------------------------
// Thread
// ---------------------------------------------------------------------------

/**
 * External thread via twisted extrusion — no SDF grid artifacts.
 *
 * The idea: build a cross-section that's a circle at the root diameter
 * with one trapezoidal bump out to the crest diameter. Then twist-extrude
 * it so the bump traces a helix. Manifold's extrude+twist produces clean
 * structured geometry — quads split into triangles that follow the thread.
 *
 * Returns a threaded cylinder along +Z from z=0 to z=length.
 */
export function thread(diameter: number, pitch: number, length: number, options?: { depth?: number; segments?: number }): Shape {
  const r = diameter / 2;
  const depth = options?.depth ?? pitch * 0.35;
  const segs = options?.segments ?? 36;
  const rRoot = r - depth;
  const rCrest = r;
  const turns = length / pitch;
  const divisions = Math.max(4, Math.ceil(turns * segs));

  // The tooth angular width at the root radius.
  // Standard metric: tooth occupies ~50% of pitch circumferentially.
  // One pitch spans (pitch / rRoot) radians at the root circle.
  const toothHalfWidth = (pitch * 0.5) / (2 * rRoot); // half-width in radians
  const flankWidth = toothHalfWidth * 0.4; // transition zone

  const pts: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;

    // Distance from the tooth center (at angle=0), wrapped to [-π, π]
    let da = a;
    if (da > Math.PI) da -= Math.PI * 2;
    const absDA = Math.abs(da);

    let radius: number;
    if (absDA < toothHalfWidth - flankWidth) {
      // Crest flat
      radius = rCrest;
    } else if (absDA < toothHalfWidth) {
      // Flank — linear blend from crest to root
      const t = (absDA - (toothHalfWidth - flankWidth)) / flankWidth;
      radius = rCrest + (rRoot - rCrest) * t;
    } else {
      // Root
      radius = rRoot;
    }

    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }

  const plan: import('../compilePlan').ShapeCompilePlan = {
    kind: 'extrude',
    profile: { kind: 'polygon', points: pts, transforms: [] },
    height: length,
    center: false,
    twist: turns * 360,
    twistSegments: divisions,
  };
  return buildShapeFromCompilePlan(plan);
}

// ---------------------------------------------------------------------------
// Bolt
// ---------------------------------------------------------------------------

/**
 * Hex bolt with real helical threads.
 * Head at z=0..headHeight, shaft extends downward along -Z.
 */
export function bolt(
  diameter: number,
  length: number,
  options?: {
    pitch?: number;
    headHeight?: number;
    headAcrossFlats?: number;
    threadLength?: number;
    segments?: number;
  },
): Shape {
  const r = diameter / 2;
  const pitch = options?.pitch ?? diameter * 0.15;
  const headH = options?.headHeight ?? diameter * 0.65;
  const headAF = options?.headAcrossFlats ?? diameter * 1.6;
  const threadLen = options?.threadLength ?? length;
  const segs = options?.segments ?? 36;

  // Hex head
  const slab = box(headAF * 1.2, headAF, headH, true).translate(0, 0, headH / 2);
  const hexHead = slab.intersect(slab.rotate(0, 0, 60)).intersect(slab.rotate(0, 0, 120));

  // Smooth shaft (unthreaded portion)
  const unthreadedLen = length - threadLen;
  const parts: Shape[] = [hexHead];

  if (unthreadedLen > 0.1) {
    parts.push(cylinder(unthreadedLen, r, undefined, segs).translate(0, 0, -unthreadedLen));
  }

  // Threaded portion
  const threaded = thread(diameter, pitch, threadLen, { segments: segs }).translate(0, 0, -length);
  parts.push(threaded);

  return union(...parts);
}

// ---------------------------------------------------------------------------
// Nut
// ---------------------------------------------------------------------------

/**
 * Hex nut with threaded bore.
 * Centered at origin, height along Z.
 */
export function nut(
  diameter: number,
  options?: {
    pitch?: number;
    height?: number;
    acrossFlats?: number;
    segments?: number;
  },
): Shape {
  const r = diameter / 2;
  const _pitch = options?.pitch ?? diameter * 0.15;
  const nutH = options?.height ?? diameter * 0.8;
  const nutAF = options?.acrossFlats ?? diameter * 1.6;
  const _segs = options?.segments ?? 36;

  // Hex body
  const slab = box(nutAF * 1.2, nutAF, nutH, true);
  let hexBody = slab.intersect(slab.rotate(0, 0, 60)).intersect(slab.rotate(0, 0, 120));

  // Threaded bore (clearance bore for simplicity)
  const bore = cylinder(nutH + 1, r + 0.1, undefined, 48, true);
  hexBody = hexBody.subtract(bore);

  return hexBody;
}

// ---------------------------------------------------------------------------
// Washers
// ---------------------------------------------------------------------------

type WasherStandard = 'din-125-a';

/** DIN 125-A flat washer dimensions (inner diameter, outer diameter, thickness) in mm */
export const WASHER_TABLE: Record<MetricSize, { id: number; od: number; t: number }> = {
  M2: { id: 2.2, od: 5.0, t: 0.3 },
  'M2.5': { id: 2.7, od: 6.0, t: 0.5 },
  M3: { id: 3.2, od: 7.0, t: 0.5 },
  M4: { id: 4.3, od: 9.0, t: 0.8 },
  M5: { id: 5.3, od: 10.0, t: 1.0 },
  M6: { id: 6.4, od: 12.0, t: 1.6 },
  M8: { id: 8.4, od: 17.0, t: 1.6 },
  M10: { id: 10.5, od: 21.0, t: 2.0 },
};

/**
 * Flat washer (DIN 125-A by default).
 * Returns a flat ring centered at the origin, thickness along Z.
 * Use `size` to select a standard metric thread size.
 */
export function washer(size: MetricSize, options?: { standard?: WasherStandard; segments?: number }): Shape {
  const dims = WASHER_TABLE[size];
  if (!dims) throw new Error(`washer: unsupported size "${size}"`);
  const segs = options?.segments ?? 48;
  const outer = cylinder(dims.t, dims.od / 2, undefined, segs, true);
  const bore = cylinder(dims.t + 1, dims.id / 2, undefined, segs, true);
  return outer.subtract(bore);
}

// ---------------------------------------------------------------------------
// Fastener set
// ---------------------------------------------------------------------------

/** Reference dimensions for a complete fastener joint. */
export interface FastenerSetDimensions {
  size: MetricSize;
  nominalDiameter: number;
  boltLength: number;
  clearanceDia: number;
  tapDia: number;
  nutAcrossFlats: number;
  nutHeight: number;
  washerOuterDia: number;
  washerInnerDia: number;
  washerThickness: number;
}

export interface FastenerSetOptions {
  /** Include a washer under the bolt head (default: true). */
  washerUnderHead?: boolean;
  /** Include a washer under the nut (default: true). */
  washerUnderNut?: boolean;
  /** Clearance hole fit (default: 'normal'). */
  fit?: FastenerFit;
  /** Thread segment count (default: 36). */
  segments?: number;
}

export interface FastenerSetResult {
  /** Hex bolt: head top at z=0, threaded shaft extends toward −Z by `boltLength`. */
  bolt: Shape;
  /** Hex nut centered at z=0. */
  nut: Shape;
  /** Flat washer centered at z=0. Null when washerUnderHead is false. */
  washerUnderHead: Shape | null;
  /** Flat washer centered at z=0. Null when washerUnderNut is false. */
  washerUnderNut: Shape | null;
  /** Clearance-hole cutter (cylinder) centered at z=0, for subtracting from a through-plate. */
  clearanceHole: Shape;
  /** Tap-drill cutter (cylinder) centered at z=0, for subtracting from a tapped plate. */
  tappedHole: Shape;
  /** Reference dimensions for BOM, placement calculations, and documentation. */
  dims: FastenerSetDimensions;
}

/**
 * Complete ISO metric fastener set — bolt, nut, optional washers, and matching hole cutters.
 *
 * All shapes are returned un-positioned (each centered on the Z-axis at z=0 or the
 * convention described in `FastenerSetResult`). Place them yourself using `.translate()`.
 *
 * @param size   - ISO metric thread size, e.g. 'M5'.
 * @param boltLength - Nominal shaft length in mm (head not included).
 * @param options - Optional configuration.
 */
export function fastenerSet(size: MetricSize, boltLength: number, options?: FastenerSetOptions): FastenerSetResult {
  const sizeData = METRIC_HOLE_TABLE[size];
  if (!sizeData) throw new Error(`fastenerSet: unsupported size "${size}"`);
  if (!Number.isFinite(boltLength) || boltLength <= 0) {
    throw new Error('fastenerSet: boltLength must be > 0');
  }

  const fit = options?.fit ?? 'normal';
  const segs = options?.segments ?? 36;
  const includeHeadWasher = options?.washerUnderHead ?? true;
  const includeNutWasher = options?.washerUnderNut ?? true;

  const nomDia = parseFloat(size.replace('M', ''));
  const washerDims = WASHER_TABLE[size];
  const nutHeight = nomDia * 0.8;
  const nutAF = nomDia * 1.6;

  const boltShape = bolt(nomDia, boltLength, { segments: segs });
  const nutShape = nut(nomDia, { height: nutHeight, acrossFlats: nutAF, segments: segs });

  const headWasher = includeHeadWasher ? washer(size, { segments: segs }) : null;
  const nutWasherShape = includeNutWasher ? washer(size, { segments: segs }) : null;

  const clearanceDia = sizeData[fit];
  const tapDia = sizeData.tap;
  const depth = boltLength + 1; // slightly deeper than bolt for clean cutter

  const clearanceHole = cylinder(depth, clearanceDia / 2, undefined, segs, true);
  const tappedHole = cylinder(depth, tapDia / 2, undefined, segs, true);

  const dims: FastenerSetDimensions = {
    size,
    nominalDiameter: nomDia,
    boltLength,
    clearanceDia,
    tapDia,
    nutAcrossFlats: nutAF,
    nutHeight,
    washerOuterDia: washerDims.od,
    washerInnerDia: washerDims.id,
    washerThickness: washerDims.t,
  };

  return {
    bolt: boltShape,
    nut: nutShape,
    washerUnderHead: headWasher,
    washerUnderNut: nutWasherShape,
    clearanceHole,
    tappedHole,
    dims,
  };
}

// ---------------------------------------------------------------------------
// Part library catalog
// ---------------------------------------------------------------------------

/** All library parts, keyed by name */
export const partLibrary = {
  boltHole,
  fastenerHole,
  counterbore,
  tube,
  pipe,
  explode,
  hexNut,
  roundedBox,
  bracket,
  holePattern,
  thread,
  bolt,
  nut,
  washer,
  fastenerSet,
  pipeRoute,
  elbow,
  tSlotProfile,
  tSlotExtrusion,
  profile2020BSlot6Profile,
  profile2020BSlot6,
  spurGear,
  bevelGear,
  faceGear,
  sideGear,
  ringGear,
  rackGear,
  gearPair,
  bevelGearPair,
  faceGearPair,
  sideGearPair,
};

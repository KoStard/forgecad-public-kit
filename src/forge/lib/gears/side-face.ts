/**
 * Side gear and face gear: SideGearOptions, FaceGearOptions, sideGear, faceGear.
 */

import { profilePlanFromCrossSection } from '../../compilePlan';
import { Shape, cylinder, union } from '../../kernel';
import { difference2d } from '../../sketch/booleans';
import { Sketch, setSketchCompileProfilePlan } from '../../sketch/core';
import { sketchExtrude } from '../../sketch/extrude';
import { circle2d } from '../../sketch/primitives';
import { GearMeta, attachGearMeta, remapErrorPrefix } from './infrastructure';
import { NormalizedSpurGearOptions, SpurGearOptions, buildSpurGearMeta, buildSpurGearProfile, normalizeSpurGearOptions } from './spur';

export interface SideGearOptions extends SpurGearOptions {
  side?: 'top' | 'bottom';
  toothHeight?: number;
}

export interface FaceGearOptions extends SideGearOptions {}

interface NormalizedSideGearOptions extends NormalizedSpurGearOptions {
  side: 'top' | 'bottom';
  toothHeight: number;
}

export function normalizeSideGearOptions(options: SideGearOptions): NormalizedSideGearOptions {
  let normalizedSpur: NormalizedSpurGearOptions;
  try {
    normalizedSpur = normalizeSpurGearOptions(options);
  } catch (error) {
    remapErrorPrefix(error, 'spurGear', 'sideGear');
  }

  const side = options.side ?? 'top';
  if (side !== 'top' && side !== 'bottom') {
    throw new Error('sideGear: "side" must be "top" or "bottom"');
  }

  const toothHeight = options.toothHeight ?? options.module;
  if (!(Number.isFinite(toothHeight) && toothHeight > 0)) {
    throw new Error('sideGear: "toothHeight" must be > 0');
  }

  return {
    ...normalizedSpur,
    side,
    toothHeight,
  };
}

export function resolveSideGearZBands(options: NormalizedSideGearOptions): {
  bodyMinZ: number;
  bodyMaxZ: number;
  toothMinZ: number;
  toothMaxZ: number;
  meshPlaneZ: number;
} {
  const bodyMinZ = options.center ? -options.faceWidth * 0.5 : 0;
  const bodyMaxZ = bodyMinZ + options.faceWidth;

  if (options.side === 'top') {
    const toothMinZ = bodyMaxZ;
    const toothMaxZ = toothMinZ + options.toothHeight;
    return {
      bodyMinZ,
      bodyMaxZ,
      toothMinZ,
      toothMaxZ,
      meshPlaneZ: (toothMinZ + toothMaxZ) * 0.5,
    };
  }

  const toothMaxZ = bodyMinZ;
  const toothMinZ = toothMaxZ - options.toothHeight;
  return {
    bodyMinZ,
    bodyMaxZ,
    toothMinZ,
    toothMaxZ,
    meshPlaneZ: (toothMinZ + toothMaxZ) * 0.5,
  };
}

/**
 * Crown/face style gear where the teeth project from one side of the disk
 * instead of the outer cylindrical rim.
 */
export function sideGear(options: SideGearOptions): Shape {
  const normalized = normalizeSideGearOptions(options);

  let spurMeta: GearMeta;
  try {
    spurMeta = buildSpurGearMeta(normalized);
  } catch (error) {
    remapErrorPrefix(error, 'spurGear', 'sideGear');
  }

  const zBands = resolveSideGearZBands(normalized);
  const meta: GearMeta = {
    ...spurMeta,
    kind: 'face',
    toothHeight: normalized.toothHeight,
    toothSide: normalized.side,
    toothMinZ: zBands.toothMinZ,
    toothMaxZ: zBands.toothMaxZ,
    meshPlaneZ: zBands.meshPlaneZ,
  };

  const segments = Math.max(48, normalized.teeth * normalized.segmentsPerTooth);
  const rootDisk = cylinder(normalized.faceWidth, meta.rootRadius, undefined, segments, normalized.center);
  const profile = buildSpurGearProfile(spurMeta, normalized.segmentsPerTooth);
  const toothBandRaw = difference2d(profile, circle2d(meta.rootRadius, Math.max(48, normalized.teeth * 2)));
  // Use backend-level simplify for polygon cleanup (not a public Sketch API).
  const simplifiedCross = toothBandRaw.cross.simplify(1e-6);
  const toothBandProfile = setSketchCompileProfilePlan(
    new Sketch(simplifiedCross, toothBandRaw.colorHex),
    profilePlanFromCrossSection(simplifiedCross),
  );

  const teethBand = sketchExtrude(toothBandProfile, normalized.toothHeight, { center: false }).toShape().translate(0, 0, zBands.toothMinZ);

  let shape = union(rootDisk, teethBand);
  if (normalized.boreDiameter > 0) {
    const zMin = Math.min(zBands.bodyMinZ, zBands.toothMinZ);
    const zMax = Math.max(zBands.bodyMaxZ, zBands.toothMaxZ);
    const bore = cylinder(zMax - zMin + 2, normalized.boreDiameter * 0.5, undefined, Math.max(48, normalized.teeth * 2)).translate(
      0,
      0,
      zMin - 1,
    );
    shape = shape.subtract(bore);
  }

  return attachGearMeta(shape, meta);
}

/**
 * Face gear (crown style) where teeth are on one face (top or bottom) instead of the outer rim.
 *
 * Uses the same involute tooth sizing as spurGear, then projects the tooth band axially from one side.
 * Alias for sideGear (which is kept for backward compatibility).
 */
export function faceGear(options: FaceGearOptions): Shape {
  try {
    return sideGear(options);
  } catch (error) {
    remapErrorPrefix(error, 'sideGear', 'faceGear');
  }
}

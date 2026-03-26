/**
 * Bevel gear: BevelGearOptions, bevelGear, and bevel-specific helpers.
 */

import { Shape } from '../../kernel';
import { difference2d } from '../../sketch/booleans';
import { sketchExtrude } from '../../sketch/extrude';
import { circle2d } from '../../sketch/primitives';
import { EPSILON, attachGearMeta, isFinitePositive } from './infrastructure';
import { NormalizedSpurGearOptions, SpurGearOptions, buildSpurGearMeta, buildSpurGearProfile, normalizeSpurGearOptions } from './spur';

export interface BevelGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  pitchAngleDeg?: number;
  mateTeeth?: number;
  shaftAngleDeg?: number;
  center?: boolean;
  segmentsPerTooth?: number;
}

export interface NormalizedBevelGearOptions extends NormalizedSpurGearOptions {
  pitchAngleDeg: number;
  pitchAngleRad: number;
  shaftAngleDeg: number;
  coneDistance: number;
  topScale: number;
}

export function normalizeShaftAngle(label: string, value: number): number {
  if (!isFinitePositive(value) || value >= 175) {
    throw new Error(`${label}: "shaftAngleDeg" must be in (0, 175)`);
  }
  return value;
}

export function computeBevelPitchAngleDeg(teeth: number, mateTeeth: number, shaftAngleDeg: number): number {
  const shaftAngleRad = (shaftAngleDeg * Math.PI) / 180;
  const numerator = teeth * Math.sin(shaftAngleRad);
  const denominator = mateTeeth + teeth * Math.cos(shaftAngleRad);
  const angle = Math.atan2(numerator, denominator);
  if (!(angle > EPSILON && angle < shaftAngleRad - EPSILON)) {
    throw new Error('bevelGear: could not derive a valid pitch angle from teeth/shaft angle');
  }
  return (angle * 180) / Math.PI;
}

export function normalizeBevelGearOptions(options: BevelGearOptions): NormalizedBevelGearOptions {
  const spur = normalizeSpurGearOptions({
    module: options.module,
    teeth: options.teeth,
    pressureAngleDeg: options.pressureAngleDeg,
    faceWidth: options.faceWidth,
    backlash: options.backlash,
    clearance: options.clearance,
    addendum: options.addendum,
    dedendum: options.dedendum,
    boreDiameter: options.boreDiameter,
    center: options.center,
    segmentsPerTooth: options.segmentsPerTooth,
  } as SpurGearOptions);

  const shaftAngleDeg = normalizeShaftAngle('bevelGear', options.shaftAngleDeg ?? 90);
  let pitchAngleDeg = options.pitchAngleDeg;

  if (pitchAngleDeg === undefined) {
    if (options.mateTeeth !== undefined) {
      if (!Number.isInteger(options.mateTeeth) || options.mateTeeth < 6) {
        throw new Error('bevelGear: "mateTeeth" must be an integer >= 6');
      }
      pitchAngleDeg = computeBevelPitchAngleDeg(spur.teeth, options.mateTeeth, shaftAngleDeg);
    } else {
      pitchAngleDeg = 45;
    }
  }

  if (!isFinitePositive(pitchAngleDeg) || pitchAngleDeg >= 88) {
    throw new Error('bevelGear: "pitchAngleDeg" must be in (0, 88)');
  }
  const pitchAngleRad = (pitchAngleDeg * Math.PI) / 180;
  const pitchRadius = spur.module * spur.teeth * 0.5;
  const coneDistance = pitchRadius / Math.max(EPSILON, Math.sin(pitchAngleRad));
  if (!isFinitePositive(coneDistance)) {
    throw new Error('bevelGear: invalid cone distance');
  }

  const smallPitchRadius = pitchRadius - spur.faceWidth * Math.tan(pitchAngleRad);
  if (smallPitchRadius <= spur.module * 0.25) {
    throw new Error('bevelGear: faceWidth is too large for the selected pitch angle');
  }
  const topScale = smallPitchRadius / pitchRadius;
  if (!(topScale > EPSILON && topScale <= 1)) {
    throw new Error('bevelGear: computed top scale is invalid');
  }

  return {
    ...spur,
    pitchAngleDeg,
    pitchAngleRad,
    shaftAngleDeg,
    coneDistance,
    topScale,
  };
}

/** Conical bevel gear generated from a tapered involute extrusion. Specify pitchAngleDeg directly or derive it from mateTeeth + shaftAngleDeg. */
export function bevelGear(options: BevelGearOptions): Shape {
  const normalized = normalizeBevelGearOptions(options);
  const meta = buildSpurGearMeta(normalized);
  let profile = buildSpurGearProfile(meta, normalized.segmentsPerTooth);

  if (normalized.boreDiameter > 0) {
    profile = difference2d(profile, circle2d(normalized.boreDiameter * 0.5, Math.max(48, normalized.teeth * 2)));
  }

  const shape = sketchExtrude(profile, normalized.faceWidth, {
    center: normalized.center,
    scaleTop: normalized.topScale,
  }).toShape();

  return attachGearMeta(shape, {
    ...meta,
    kind: 'bevel',
    centered: normalized.center,
    pitchAngleDeg: normalized.pitchAngleDeg,
    pitchAngleRad: normalized.pitchAngleRad,
    shaftAngleDeg: normalized.shaftAngleDeg,
    coneDistance: normalized.coneDistance,
    topScale: normalized.topScale,
  });
}

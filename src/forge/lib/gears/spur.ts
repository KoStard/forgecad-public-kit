/**
 * Spur gear: SpurGearOptions, spurGear, and internal helpers shared by
 * bevel, side, and face gears.
 */

import { Shape } from '../../kernel';
import { difference2d, union2d } from '../../sketch/booleans';
import { Sketch } from '../../sketch/core';
import { sketchExtrude } from '../../sketch/extrude';
import { circle2d, polygon } from '../../sketch/primitives';
import { sketchRotate } from '../../sketch/transforms';
import {
  EPSILON,
  GearMeta,
  addArcPoints,
  attachGearMeta,
  flankAngleAtRadius,
  isFinitePositive,
} from './infrastructure';

export interface SpurGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  center?: boolean;
  segmentsPerTooth?: number;
}

export interface NormalizedSpurGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg: number;
  pressureAngleRad: number;
  faceWidth: number;
  backlash: number;
  clearance: number;
  addendum: number;
  dedendum: number;
  boreDiameter: number;
  center: boolean;
  segmentsPerTooth: number;
}

export function normalizeSpurGearOptions(options: SpurGearOptions): NormalizedSpurGearOptions {
  if (!isFinitePositive(options.module)) throw new Error('spurGear: "module" must be > 0');
  if (!Number.isInteger(options.teeth) || options.teeth < 6) throw new Error('spurGear: "teeth" must be an integer >= 6');
  if (!isFinitePositive(options.faceWidth)) throw new Error('spurGear: "faceWidth" must be > 0');

  const pressureAngleDeg = options.pressureAngleDeg ?? 20;
  if (!isFinitePositive(pressureAngleDeg) || pressureAngleDeg >= 60) {
    throw new Error('spurGear: "pressureAngleDeg" must be in (0, 60)');
  }

  const module = options.module;
  const circularPitch = Math.PI * module;
  const backlash = options.backlash ?? 0;
  if (!Number.isFinite(backlash) || backlash < 0 || backlash >= circularPitch * 0.45) {
    throw new Error(`spurGear: "backlash" must be in [0, ${(circularPitch * 0.45).toFixed(3)})`);
  }

  const clearance = options.clearance ?? module * 0.25;
  if (!Number.isFinite(clearance) || clearance < 0) {
    throw new Error('spurGear: "clearance" must be >= 0');
  }

  const addendum = options.addendum ?? module;
  if (!isFinitePositive(addendum)) throw new Error('spurGear: "addendum" must be > 0');

  const dedendum = options.dedendum ?? addendum + clearance;
  if (!isFinitePositive(dedendum)) throw new Error('spurGear: "dedendum" must be > 0');

  const boreDiameter = options.boreDiameter ?? 0;
  if (!Number.isFinite(boreDiameter) || boreDiameter < 0) {
    throw new Error('spurGear: "boreDiameter" must be >= 0');
  }

  const segmentsPerTooth = Math.max(4, Math.floor(options.segmentsPerTooth ?? 10));

  return {
    module,
    teeth: options.teeth,
    pressureAngleDeg,
    pressureAngleRad: (pressureAngleDeg * Math.PI) / 180,
    faceWidth: options.faceWidth,
    backlash,
    clearance,
    addendum,
    dedendum,
    boreDiameter,
    center: options.center ?? true,
    segmentsPerTooth,
  };
}

export function buildSpurGearMeta(options: NormalizedSpurGearOptions): GearMeta {
  const pitchRadius = options.module * options.teeth * 0.5;
  const baseRadius = pitchRadius * Math.cos(options.pressureAngleRad);
  const outerRadius = pitchRadius + options.addendum;
  const rootRadius = Math.max(EPSILON, pitchRadius - options.dedendum);

  if (!(rootRadius < outerRadius - EPSILON)) {
    throw new Error('spurGear: invalid radii (root radius must be smaller than outer radius)');
  }
  if (options.boreDiameter > 0 && options.boreDiameter * 0.5 >= rootRadius - EPSILON) {
    throw new Error('spurGear: bore is too large for the computed root radius');
  }

  return {
    kind: 'spur',
    module: options.module,
    pressureAngleDeg: options.pressureAngleDeg,
    pressureAngleRad: options.pressureAngleRad,
    teeth: options.teeth,
    pitchRadius,
    baseRadius,
    addendum: options.addendum,
    dedendum: options.dedendum,
    outerRadius,
    rootRadius,
    faceWidth: options.faceWidth,
    backlash: options.backlash,
    centered: options.center,
  };
}

export function createSpurToothSketch(meta: GearMeta, segmentsPerTooth: number): Sketch {
  const circularPitch = Math.PI * meta.module;
  const thicknessAtPitch = circularPitch * 0.5 - meta.backlash;
  if (thicknessAtPitch <= EPSILON) {
    throw new Error('spurGear: backlash leaves no tooth thickness at pitch circle');
  }

  const halfThicknessAtPitch = thicknessAtPitch / (2 * meta.pitchRadius);
  const flankStartRadius = Math.max(meta.baseRadius, meta.rootRadius);
  const flankSteps = Math.max(4, segmentsPerTooth);
  const arcSteps = Math.max(3, Math.ceil(segmentsPerTooth * 0.6));

  const leftFlank: [number, number][] = [];
  const rightFlank: [number, number][] = [];

  for (let i = 0; i <= flankSteps; i++) {
    const t = flankSteps === 0 ? 0 : i / flankSteps;
    const r = flankStartRadius + (meta.outerRadius - flankStartRadius) * t;
    const theta = flankAngleAtRadius(r, meta.baseRadius, halfThicknessAtPitch, meta.pressureAngleRad);
    leftFlank.push([r * Math.cos(theta), r * Math.sin(theta)]);
    rightFlank.push([r * Math.cos(-theta), r * Math.sin(-theta)]);
  }

  const thetaStart = flankAngleAtRadius(flankStartRadius, meta.baseRadius, halfThicknessAtPitch, meta.pressureAngleRad);
  const thetaTip = flankAngleAtRadius(meta.outerRadius, meta.baseRadius, halfThicknessAtPitch, meta.pressureAngleRad);

  const pts: [number, number][] = [];
  pts.push(...leftFlank);
  addArcPoints(pts, meta.outerRadius, thetaTip, -thetaTip, arcSteps);
  for (let i = rightFlank.length - 1; i >= 0; i--) {
    pts.push(rightFlank[i]);
  }
  addArcPoints(pts, meta.rootRadius, -thetaStart, thetaStart, arcSteps);

  return polygon(pts);
}

export function buildSpurGearProfile(meta: GearMeta, segmentsPerTooth: number): Sketch {
  const base = circle2d(meta.rootRadius, Math.max(48, meta.teeth * segmentsPerTooth));
  const tooth = createSpurToothSketch(meta, segmentsPerTooth);
  const teeth: Sketch[] = [];
  for (let i = 0; i < meta.teeth; i++) {
    teeth.push(sketchRotate(tooth, (360 / meta.teeth) * i));
  }
  return union2d(base, ...teeth);
}

export function spurGear(options: SpurGearOptions): Shape {
  const normalized = normalizeSpurGearOptions(options);
  const meta = buildSpurGearMeta(normalized);
  let profile = buildSpurGearProfile(meta, normalized.segmentsPerTooth);

  if (normalized.boreDiameter > 0) {
    profile = difference2d(profile, circle2d(normalized.boreDiameter * 0.5, Math.max(48, normalized.teeth * 2)));
  }

  const shape = sketchExtrude(profile, normalized.faceWidth, { center: normalized.center }).toShape();
  return attachGearMeta(shape, meta);
}

/**
 * Ring gear: RingGearOptions, ringGear, createRingSpaceSketch.
 */

import { Shape } from '../../kernel';
import { difference2d, union2d } from '../../sketch/booleans';
import { Sketch } from '../../sketch/core';
import { sketchExtrude } from '../../sketch/extrude';
import { circle2d, polygon } from '../../sketch/primitives';
import { sketchRotate } from '../../sketch/transforms';
import { EPSILON, GearMeta, addArcPoints, attachGearMeta, flankAngleAtRadius, isFinitePositive } from './infrastructure';

export interface RingGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  rimWidth?: number;
  outerDiameter?: number;
  center?: boolean;
  segmentsPerTooth?: number;
}

interface NormalizedRingGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg: number;
  pressureAngleRad: number;
  faceWidth: number;
  backlash: number;
  addendum: number;
  dedendum: number;
  rimWidth: number;
  outerRadius: number;
  center: boolean;
  segmentsPerTooth: number;
}

function normalizeRingGearOptions(options: RingGearOptions): NormalizedRingGearOptions {
  if (!isFinitePositive(options.module)) throw new Error('ringGear: "module" must be > 0');
  if (!Number.isInteger(options.teeth) || options.teeth < 12) throw new Error('ringGear: "teeth" must be an integer >= 12');
  if (!isFinitePositive(options.faceWidth)) throw new Error('ringGear: "faceWidth" must be > 0');

  const pressureAngleDeg = options.pressureAngleDeg ?? 20;
  if (!isFinitePositive(pressureAngleDeg) || pressureAngleDeg >= 60) {
    throw new Error('ringGear: "pressureAngleDeg" must be in (0, 60)');
  }

  const module = options.module;
  const circularPitch = Math.PI * module;
  const backlash = options.backlash ?? 0;
  if (!Number.isFinite(backlash) || backlash < 0 || backlash >= circularPitch * 0.45) {
    throw new Error(`ringGear: "backlash" must be in [0, ${(circularPitch * 0.45).toFixed(3)})`);
  }

  const clearance = options.clearance ?? module * 0.25;
  if (!Number.isFinite(clearance) || clearance < 0) {
    throw new Error('ringGear: "clearance" must be >= 0');
  }

  const addendum = options.addendum ?? module;
  if (!isFinitePositive(addendum)) throw new Error('ringGear: "addendum" must be > 0');
  const dedendum = options.dedendum ?? addendum + clearance;
  if (!isFinitePositive(dedendum)) throw new Error('ringGear: "dedendum" must be > 0');

  const pitchRadius = module * options.teeth * 0.5;
  const rootRadius = pitchRadius + dedendum;
  const rimWidth = options.rimWidth ?? module * 2;
  if (!isFinitePositive(rimWidth)) throw new Error('ringGear: "rimWidth" must be > 0');

  const outerRadius = options.outerDiameter != null ? options.outerDiameter * 0.5 : rootRadius + rimWidth;
  if (!(outerRadius > rootRadius + EPSILON)) {
    throw new Error('ringGear: outer diameter/rim width leaves no ring body');
  }

  return {
    module,
    teeth: options.teeth,
    pressureAngleDeg,
    pressureAngleRad: (pressureAngleDeg * Math.PI) / 180,
    faceWidth: options.faceWidth,
    backlash,
    addendum,
    dedendum,
    rimWidth,
    outerRadius,
    center: options.center ?? true,
    segmentsPerTooth: Math.max(4, Math.floor(options.segmentsPerTooth ?? 10)),
  };
}

export function createRingSpaceSketch(meta: GearMeta, segmentsPerTooth: number): Sketch {
  const circularPitch = Math.PI * meta.module;
  const spaceAtPitch = circularPitch * 0.5 + meta.backlash;
  const halfSpaceAtPitch = spaceAtPitch / (2 * meta.pitchRadius);

  const tipRadius = meta.outerRadius;
  const rootRadius = meta.rootRadius;
  const flankStartRadius = Math.max(meta.baseRadius, tipRadius);
  const flankSteps = Math.max(4, segmentsPerTooth);
  const arcSteps = Math.max(3, Math.ceil(segmentsPerTooth * 0.6));

  const leftFlank: [number, number][] = [];
  const rightFlank: [number, number][] = [];

  for (let i = 0; i <= flankSteps; i++) {
    const t = flankSteps === 0 ? 0 : i / flankSteps;
    const r = flankStartRadius + (rootRadius - flankStartRadius) * t;
    const theta = flankAngleAtRadius(r, meta.baseRadius, halfSpaceAtPitch, meta.pressureAngleRad);
    leftFlank.push([r * Math.cos(theta), r * Math.sin(theta)]);
    rightFlank.push([r * Math.cos(-theta), r * Math.sin(-theta)]);
  }

  const thetaStart = flankAngleAtRadius(flankStartRadius, meta.baseRadius, halfSpaceAtPitch, meta.pressureAngleRad);
  const thetaRoot = flankAngleAtRadius(rootRadius, meta.baseRadius, halfSpaceAtPitch, meta.pressureAngleRad);

  const pts: [number, number][] = [];
  pts.push(...leftFlank);
  addArcPoints(pts, rootRadius, thetaRoot, -thetaRoot, arcSteps);
  for (let i = rightFlank.length - 1; i >= 0; i--) {
    pts.push(rightFlank[i]);
  }
  addArcPoints(pts, tipRadius, -thetaStart, thetaStart, arcSteps);

  return polygon(pts);
}

export function ringGear(options: RingGearOptions): Shape {
  const normalized = normalizeRingGearOptions(options);
  const pitchRadius = normalized.module * normalized.teeth * 0.5;
  const baseRadius = pitchRadius * Math.cos(normalized.pressureAngleRad);
  const tipRadius = pitchRadius - normalized.addendum;
  const rootRadius = pitchRadius + normalized.dedendum;

  if (!(tipRadius > EPSILON)) throw new Error('ringGear: addendum is too large for the tooth count/module');
  if (!(tipRadius < rootRadius - EPSILON)) throw new Error('ringGear: invalid tip/root radius relationship');

  const meta: GearMeta = {
    kind: 'ring',
    module: normalized.module,
    pressureAngleDeg: normalized.pressureAngleDeg,
    pressureAngleRad: normalized.pressureAngleRad,
    teeth: normalized.teeth,
    pitchRadius,
    baseRadius,
    addendum: normalized.addendum,
    dedendum: normalized.dedendum,
    outerRadius: tipRadius,
    rootRadius,
    faceWidth: normalized.faceWidth,
    backlash: normalized.backlash,
    centered: normalized.center,
  };

  const ringBlank = difference2d(
    circle2d(normalized.outerRadius, Math.max(64, normalized.teeth * normalized.segmentsPerTooth)),
    circle2d(tipRadius, Math.max(64, normalized.teeth * normalized.segmentsPerTooth)),
  );

  const toothSpace = createRingSpaceSketch(meta, normalized.segmentsPerTooth);
  const spaces: Sketch[] = [];
  for (let i = 0; i < normalized.teeth; i++) {
    spaces.push(sketchRotate(toothSpace, (360 / normalized.teeth) * i));
  }
  const profile = difference2d(ringBlank, union2d(...spaces));
  const shape = sketchExtrude(profile, normalized.faceWidth, { center: normalized.center }).toShape();
  return attachGearMeta(shape, meta);
}

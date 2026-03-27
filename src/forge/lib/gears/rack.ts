/**
 * Rack gear: RackGearOptions, rackGear.
 */

import { Shape } from '../../kernel';
import { union2d } from '../../sketch/booleans';
import { sketchExtrude } from '../../sketch/extrude';
import { polygon, rect } from '../../sketch/primitives';
import { sketchTranslate } from '../../sketch/transforms';
import { EPSILON, GearMeta, attachGearMeta, isFinitePositive } from './infrastructure';

export interface RackGearOptions {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  baseHeight?: number;
  center?: boolean;
}

/** Linear rack gear with pressure-angle flanks. Use with spurGear for rack-and-pinion mechanisms. */
export function rackGear(options: RackGearOptions): Shape {
  if (!isFinitePositive(options.module)) throw new Error('rackGear: "module" must be > 0');
  if (!Number.isInteger(options.teeth) || options.teeth < 2) throw new Error('rackGear: "teeth" must be an integer >= 2');
  if (!isFinitePositive(options.faceWidth)) throw new Error('rackGear: "faceWidth" must be > 0');

  const pressureAngleDeg = options.pressureAngleDeg ?? 20;
  if (!isFinitePositive(pressureAngleDeg) || pressureAngleDeg >= 60) {
    throw new Error('rackGear: "pressureAngleDeg" must be in (0, 60)');
  }
  const pressureAngleRad = (pressureAngleDeg * Math.PI) / 180;

  const module = options.module;
  const pitch = Math.PI * module;
  const backlash = options.backlash ?? 0;
  if (!Number.isFinite(backlash) || backlash < 0 || backlash >= pitch * 0.45) {
    throw new Error(`rackGear: "backlash" must be in [0, ${(pitch * 0.45).toFixed(3)})`);
  }

  const clearance = options.clearance ?? module * 0.25;
  if (!Number.isFinite(clearance) || clearance < 0) {
    throw new Error('rackGear: "clearance" must be >= 0');
  }

  const addendum = options.addendum ?? module;
  const dedendum = options.dedendum ?? addendum + clearance;
  if (!isFinitePositive(addendum) || !isFinitePositive(dedendum)) {
    throw new Error('rackGear: addendum and dedendum must be > 0');
  }

  const baseHeight = options.baseHeight ?? module * 1.6;
  if (!isFinitePositive(baseHeight)) throw new Error('rackGear: "baseHeight" must be > 0');

  const thicknessAtPitch = pitch * 0.5 - backlash;
  if (thicknessAtPitch <= EPSILON) throw new Error('rackGear: backlash leaves no tooth thickness');

  const halfPitchThickness = thicknessAtPitch * 0.5;
  const dxTip = addendum * Math.tan(pressureAngleRad);
  const dxRoot = dedendum * Math.tan(pressureAngleRad);
  const halfTip = halfPitchThickness - dxTip;
  const halfRoot = halfPitchThickness + dxRoot;
  if (halfTip <= EPSILON) {
    throw new Error('rackGear: tooth tip collapsed (increase module or lower pressure angle/addendum)');
  }

  const toothSketch = polygon([
    [-halfRoot, -dedendum],
    [-halfTip, addendum],
    [halfTip, addendum],
    [halfRoot, -dedendum],
  ]);

  const teethSketches = [];
  const firstCenter = -((options.teeth - 1) * pitch) * 0.5;
  for (let i = 0; i < options.teeth; i++) {
    const cx = firstCenter + i * pitch;
    teethSketches.push(sketchTranslate(toothSketch, cx, 0));
  }

  const span = (options.teeth - 1) * pitch + halfRoot * 2;
  const base = sketchTranslate(rect(span + module * 2, baseHeight, true), 0, -dedendum - baseHeight * 0.5);
  const profile = union2d(base, ...teethSketches);
  const shape = sketchExtrude(profile, options.faceWidth, { center: options.center ?? true }).toShape();

  const meta: GearMeta = {
    kind: 'rack',
    module,
    pressureAngleDeg,
    pressureAngleRad,
    teeth: options.teeth,
    pitchRadius: Infinity,
    baseRadius: Infinity,
    addendum,
    dedendum,
    outerRadius: Infinity,
    rootRadius: Infinity,
    faceWidth: options.faceWidth,
    backlash,
    centered: options.center ?? true,
  };
  return attachGearMeta(shape, meta);
}

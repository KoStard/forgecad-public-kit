/**
 * Gear library: spurGear, sideGear, faceGear, ringGear, rackGear, bevelGear,
 * gearPair, bevelGearPair, sideGearPair, faceGearPair, plus all shared gear
 * infrastructure (GearMeta, involuteFn, etc.).
 */

import { profilePlanFromCrossSection } from '../compilePlan';
import { buildShapeFromCompilePlan, cylinder, Shape, union } from '../kernel';
import { difference2d, union2d } from '../sketch/booleans';
import { Sketch, setSketchCompileProfilePlan } from '../sketch/core';
import { sketchExtrude } from '../sketch/extrude';
import { circle2d, polygon, rect } from '../sketch/primitives';
import { sketchRotate, sketchTranslate } from '../sketch/transforms';

// ---------------------------------------------------------------------------
// Shared gear infrastructure
// ---------------------------------------------------------------------------

export const GEAR_META_KEY = Symbol.for('forgecad.library.gearMeta');
const EPSILON = 1e-9;

export type GearKind = 'spur' | 'ring' | 'rack' | 'bevel' | 'face';

export interface GearMeta {
  kind: GearKind;
  module: number;
  pressureAngleDeg: number;
  pressureAngleRad: number;
  teeth: number;
  pitchRadius: number;
  baseRadius: number;
  addendum: number;
  dedendum: number;
  outerRadius: number;
  rootRadius: number;
  faceWidth: number;
  backlash: number;
  toothHeight?: number;
  toothSide?: 'top' | 'bottom';
  toothMinZ?: number;
  toothMaxZ?: number;
  meshPlaneZ?: number;
  centered?: boolean;
  pitchAngleDeg?: number;
  pitchAngleRad?: number;
  shaftAngleDeg?: number;
  coneDistance?: number;
  topScale?: number;
}

function clamp01(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function involuteFn(angleRad: number): number {
  return Math.tan(angleRad) - angleRad;
}

function addArcPoints(
  target: [number, number][],
  radius: number,
  startAngle: number,
  endAngle: number,
  steps: number,
  includeStart = false,
  includeEnd = false,
): void {
  const n = Math.max(1, Math.floor(steps));
  for (let i = 0; i <= n; i++) {
    if (i === 0 && !includeStart) continue;
    if (i === n && !includeEnd) continue;
    const t = n === 0 ? 0 : i / n;
    const a = startAngle + (endAngle - startAngle) * t;
    target.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
}

function flankAngleAtRadius(radius: number, baseRadius: number, halfThicknessAtPitch: number, pressureAngleRad: number): number {
  const alphaAtRadius = Math.acos(clamp01(baseRadius / Math.max(radius, baseRadius)));
  return halfThicknessAtPitch + involuteFn(pressureAngleRad) - involuteFn(alphaAtRadius);
}

function attachGearMeta(shape: Shape, meta: GearMeta): Shape {
  (shape as Shape & { [GEAR_META_KEY]?: GearMeta })[GEAR_META_KEY] = meta;
  return shape;
}

function readGearMeta(shape: Shape): GearMeta | null {
  const meta = (shape as Shape & { [GEAR_META_KEY]?: GearMeta })[GEAR_META_KEY];
  return meta ?? null;
}

function remapErrorPrefix(error: unknown, sourcePrefix: string, targetPrefix: string): never {
  if (error instanceof Error) {
    if (error.message.startsWith(`${sourcePrefix}:`)) {
      throw new Error(`${targetPrefix}:${error.message.slice(sourcePrefix.length + 1)}`);
    }
    throw error;
  }
  throw error;
}

// ---------------------------------------------------------------------------
// Spur gear
// ---------------------------------------------------------------------------

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

interface NormalizedSpurGearOptions {
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

function normalizeSpurGearOptions(options: SpurGearOptions): NormalizedSpurGearOptions {
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

function buildSpurGearMeta(options: NormalizedSpurGearOptions): GearMeta {
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

function createSpurToothSketch(meta: GearMeta, segmentsPerTooth: number): Sketch {
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

function buildSpurGearProfile(meta: GearMeta, segmentsPerTooth: number): Sketch {
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

// ---------------------------------------------------------------------------
// Side / face gear
// ---------------------------------------------------------------------------

export interface SideGearOptions extends SpurGearOptions {
  side?: 'top' | 'bottom';
  toothHeight?: number;
}

export interface FaceGearOptions extends SideGearOptions {}

interface NormalizedSideGearOptions extends NormalizedSpurGearOptions {
  side: 'top' | 'bottom';
  toothHeight: number;
}

function normalizeSideGearOptions(options: SideGearOptions): NormalizedSideGearOptions {
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
  if (!isFinitePositive(toothHeight)) {
    throw new Error('sideGear: "toothHeight" must be > 0');
  }

  return {
    ...normalizedSpur,
    side,
    toothHeight,
  };
}

function resolveSideGearZBands(options: NormalizedSideGearOptions): {
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

export function faceGear(options: FaceGearOptions): Shape {
  try {
    return sideGear(options);
  } catch (error) {
    remapErrorPrefix(error, 'sideGear', 'faceGear');
  }
}

// ---------------------------------------------------------------------------
// Ring gear
// ---------------------------------------------------------------------------

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

function createRingSpaceSketch(meta: GearMeta, segmentsPerTooth: number): Sketch {
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

// ---------------------------------------------------------------------------
// Rack gear
// ---------------------------------------------------------------------------

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

  const teethSketches: Sketch[] = [];
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

// ---------------------------------------------------------------------------
// Bevel gear
// ---------------------------------------------------------------------------

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

interface NormalizedBevelGearOptions extends NormalizedSpurGearOptions {
  pitchAngleDeg: number;
  pitchAngleRad: number;
  shaftAngleDeg: number;
  coneDistance: number;
  topScale: number;
}

function normalizeShaftAngle(label: string, value: number): number {
  if (!isFinitePositive(value) || value >= 175) {
    throw new Error(`${label}: "shaftAngleDeg" must be in (0, 175)`);
  }
  return value;
}

function computeBevelPitchAngleDeg(teeth: number, mateTeeth: number, shaftAngleDeg: number): number {
  const shaftAngleRad = (shaftAngleDeg * Math.PI) / 180;
  const numerator = teeth * Math.sin(shaftAngleRad);
  const denominator = mateTeeth + teeth * Math.cos(shaftAngleRad);
  const angle = Math.atan2(numerator, denominator);
  if (!(angle > EPSILON && angle < shaftAngleRad - EPSILON)) {
    throw new Error('bevelGear: could not derive a valid pitch angle from teeth/shaft angle');
  }
  return (angle * 180) / Math.PI;
}

function normalizeBevelGearOptions(options: BevelGearOptions): NormalizedBevelGearOptions {
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
  });

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

// ---------------------------------------------------------------------------
// Gear pair
// ---------------------------------------------------------------------------

export interface GearPairSpec {
  module: number;
  teeth: number;
  pressureAngleDeg?: number;
  faceWidth?: number;
  backlash?: number;
  clearance?: number;
  addendum?: number;
  dedendum?: number;
  boreDiameter?: number;
  segmentsPerTooth?: number;
}

export interface GearPairOptions {
  pinion: Shape | GearPairSpec;
  gear: Shape | GearPairSpec;
  backlash?: number;
  centerDistance?: number;
  place?: boolean;
  phaseDeg?: number;
}

export interface GearPairDiagnostic {
  level: 'info' | 'warn' | 'error';
  code: string;
  message: string;
}

export interface GearPairResult {
  pinion: Shape;
  gear: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  workingPressureAngleDeg: number;
  contactRatio: number;
  jointRatio: number;
  speedReduction: number;
  /** Phase rotation (degrees) for the gear around its shaft axis for correct tooth
   *  mesh alignment. When `place: true` this is already baked into `gear`.
   *  When `place: false`, rotate the gear by this amount before positioning. */
  phaseDeg: number;
  diagnostics: GearPairDiagnostic[];
  status: 'ok' | 'warn' | 'error';
}

function resolveGearPairMember(value: Shape | GearPairSpec, label: 'pinion' | 'gear'): { shape: Shape; meta: GearMeta } {
  if (value instanceof Shape) {
    const meta = readGearMeta(value);
    if (!meta || meta.kind !== 'spur') {
      throw new Error(`gearPair: "${label}" shape has no spur-gear metadata; pass a spurGear(...) result or GearPairSpec`);
    }
    return { shape: value.clone(), meta };
  }

  const fallbackFaceWidth = Math.max(2, value.module * 6);
  const shape = spurGear({
    module: value.module,
    teeth: value.teeth,
    pressureAngleDeg: value.pressureAngleDeg,
    faceWidth: value.faceWidth ?? fallbackFaceWidth,
    backlash: value.backlash,
    clearance: value.clearance,
    addendum: value.addendum,
    dedendum: value.dedendum,
    boreDiameter: value.boreDiameter,
    center: true,
    segmentsPerTooth: value.segmentsPerTooth,
  });
  const meta = readGearMeta(shape);
  if (!meta || meta.kind !== 'spur') {
    throw new Error(`gearPair: failed to derive spur-gear metadata for "${label}"`);
  }
  return { shape, meta };
}

function pairStatusFromDiagnostics(diagnostics: GearPairDiagnostic[]): 'ok' | 'warn' | 'error' {
  if (diagnostics.some((d) => d.level === 'error')) return 'error';
  if (diagnostics.some((d) => d.level === 'warn')) return 'warn';
  return 'ok';
}

export function gearPair(options: GearPairOptions): GearPairResult {
  const pinion = resolveGearPairMember(options.pinion, 'pinion');
  const gear = resolveGearPairMember(options.gear, 'gear');
  const diagnostics: GearPairDiagnostic[] = [];

  if (Math.abs(pinion.meta.module - gear.meta.module) > 1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'gear.module_mismatch',
      message: `Module mismatch: pinion=${pinion.meta.module}, gear=${gear.meta.module}`,
    });
  }

  const pressureAngleDeg = pinion.meta.pressureAngleDeg;
  if (Math.abs(pressureAngleDeg - gear.meta.pressureAngleDeg) > 1e-4) {
    diagnostics.push({
      level: 'error',
      code: 'gear.pressure_angle_mismatch',
      message: `Pressure-angle mismatch: pinion=${pressureAngleDeg.toFixed(3)}deg, gear=${gear.meta.pressureAngleDeg.toFixed(3)}deg`,
    });
  }

  const module = pinion.meta.module;
  const alpha = pinion.meta.pressureAngleRad;
  const nominalCenterDistance = pinion.meta.pitchRadius + gear.meta.pitchRadius;
  const requestedBacklash = options.backlash ?? Math.max(pinion.meta.backlash, gear.meta.backlash, 0);
  const autoCenterDistance = nominalCenterDistance + requestedBacklash / (2 * Math.max(EPSILON, Math.tan(alpha)));
  const centerDistance = options.centerDistance ?? autoCenterDistance;
  if (!Number.isFinite(centerDistance) || centerDistance <= 0) {
    throw new Error('gearPair: centerDistance must be > 0');
  }

  const baseSum = pinion.meta.baseRadius + gear.meta.baseRadius;
  if (centerDistance < baseSum - 1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'gear.invalid_center_distance',
      message: `Center distance ${centerDistance.toFixed(4)} is below base-circle sum ${baseSum.toFixed(4)}`,
    });
  }

  const rootSum = pinion.meta.rootRadius + gear.meta.rootRadius;
  if (centerDistance <= rootSum + 1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'gear.root_collision',
      message: `Center distance ${centerDistance.toFixed(4)} causes root-circle collision (min ${rootSum.toFixed(4)})`,
    });
  }

  const addendumReach = pinion.meta.outerRadius + gear.meta.outerRadius;
  if (centerDistance >= addendumReach - 1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'gear.no_contact',
      message: `Center distance ${centerDistance.toFixed(4)} exceeds addendum reach ${addendumReach.toFixed(4)} (no mesh contact)`,
    });
  }

  const cosWorking = clamp01(baseSum / Math.max(centerDistance, EPSILON));
  const alphaWorking = Math.acos(cosWorking);
  const basePitch = Math.PI * module * Math.cos(alpha);
  const pathLength =
    Math.sqrt(Math.max(0, pinion.meta.outerRadius ** 2 - pinion.meta.baseRadius ** 2)) +
    Math.sqrt(Math.max(0, gear.meta.outerRadius ** 2 - gear.meta.baseRadius ** 2)) -
    centerDistance * Math.sin(alphaWorking);
  const contactRatio = pathLength / Math.max(EPSILON, basePitch);

  if (contactRatio < 1) {
    diagnostics.push({
      level: 'error',
      code: 'gear.low_contact_ratio',
      message: `Contact ratio ${contactRatio.toFixed(3)} is below 1.0 (mesh instability expected)`,
    });
  } else if (contactRatio < 1.2) {
    diagnostics.push({
      level: 'warn',
      code: 'gear.contact_ratio_margin',
      message: `Contact ratio ${contactRatio.toFixed(3)} is low; target >= 1.2 for smoother transfer`,
    });
  }

  const impliedBacklash = 2 * (centerDistance - nominalCenterDistance) * Math.tan(alpha);

  if (impliedBacklash < -1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'gear.negative_backlash',
      message: `Computed backlash ${impliedBacklash.toFixed(4)} is negative`,
    });
  } else if (impliedBacklash < pinion.meta.module * 0.01) {
    diagnostics.push({
      level: 'warn',
      code: 'gear.tight_backlash',
      message: `Backlash ${impliedBacklash.toFixed(4)} is very tight for module ${pinion.meta.module}`,
    });
  }

  const place = options.place ?? true;
  const pinionShape = place ? pinion.shape : pinion.shape.clone();
  const phaseDeg = options.phaseDeg ?? 180 / gear.meta.teeth;
  const gearShape = place ? gear.shape.rotate(0, 0, phaseDeg).translate(centerDistance, 0, 0) : gear.shape;
  const status = pairStatusFromDiagnostics(diagnostics);

  return {
    pinion: pinionShape,
    gear: gearShape,
    centerDistance,
    centerDistanceNominal: nominalCenterDistance,
    backlash: impliedBacklash,
    pressureAngleDeg,
    workingPressureAngleDeg: (alphaWorking * 180) / Math.PI,
    contactRatio,
    jointRatio: -(pinion.meta.teeth / gear.meta.teeth),
    speedReduction: gear.meta.teeth / pinion.meta.teeth,
    phaseDeg,
    diagnostics,
    status,
  };
}

// ---------------------------------------------------------------------------
// Bevel gear pair
// ---------------------------------------------------------------------------

interface GearMeshPlacement {
  pinionAxis: [number, number, number];
  gearAxis: [number, number, number];
  pinionCenter: [number, number, number];
  gearCenter: [number, number, number];
}

export interface BevelGearPairSpec extends GearPairSpec {}

export interface BevelGearPairOptions {
  pinion: Shape | BevelGearPairSpec;
  gear: Shape | BevelGearPairSpec;
  shaftAngleDeg?: number;
  backlash?: number;
  place?: boolean;
  phaseDeg?: number;
}

export interface SideGearSpec extends GearPairSpec {
  side?: 'top' | 'bottom';
  toothHeight?: number;
}

export interface FaceGearSpec extends SideGearSpec {}

export interface SideGearPairOptions {
  side: Shape | SideGearSpec;
  vertical: Shape | GearPairSpec;
  backlash?: number;
  centerDistance?: number;
  meshPlaneZ?: number;
  place?: boolean;
  phaseDeg?: number;
}

export interface BevelGearPairResult extends GearMeshPlacement {
  pinion: Shape;
  gear: Shape;
  shaftAngleDeg: number;
  pinionPitchAngleDeg: number;
  gearPitchAngleDeg: number;
  coneDistance: number;
  backlash: number;
  jointRatio: number;
  speedReduction: number;
  /** Phase rotation (degrees) for gear tooth mesh alignment. See GearPairResult.phaseDeg. */
  phaseDeg: number;
  diagnostics: GearPairDiagnostic[];
  status: 'ok' | 'warn' | 'error';
}

export interface SideGearPairResult {
  side: Shape;
  vertical: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  meshPlaneZ: number;
  radialOverlap: number;
  jointRatio: number;
  speedReduction: number;
  /** Phase rotation (degrees) for the vertical gear. See GearPairResult.phaseDeg. */
  phaseDeg: number;
  diagnostics: GearPairDiagnostic[];
  status: 'ok' | 'warn' | 'error';
}

export interface FaceGearPairOptions {
  face: Shape | FaceGearSpec;
  vertical: Shape | GearPairSpec;
  backlash?: number;
  centerDistance?: number;
  meshPlaneZ?: number;
  place?: boolean;
  phaseDeg?: number;
}

export interface FaceGearPairResult {
  face: Shape;
  vertical: Shape;
  centerDistance: number;
  centerDistanceNominal: number;
  backlash: number;
  pressureAngleDeg: number;
  meshPlaneZ: number;
  radialOverlap: number;
  jointRatio: number;
  speedReduction: number;
  /** Phase rotation (degrees) for the vertical gear. See GearPairResult.phaseDeg. */
  phaseDeg: number;
  diagnostics: GearPairDiagnostic[];
  status: 'ok' | 'warn' | 'error';
}

function resolveBevelPairMember(
  value: Shape | BevelGearPairSpec,
  label: 'pinion' | 'gear',
  mateTeeth: number,
  shaftAngleDeg: number,
): { shape: Shape; meta: GearMeta } {
  if (value instanceof Shape) {
    const meta = readGearMeta(value);
    if (!meta || meta.kind !== 'bevel') {
      throw new Error(`bevelGearPair: "${label}" shape has no bevel-gear metadata; pass bevelGear(...) or BevelGearPairSpec`);
    }
    return { shape: value.clone(), meta };
  }

  const fallbackFaceWidth = Math.max(2, value.module * 6);
  const shape = bevelGear({
    module: value.module,
    teeth: value.teeth,
    pressureAngleDeg: value.pressureAngleDeg,
    faceWidth: value.faceWidth ?? fallbackFaceWidth,
    backlash: value.backlash,
    clearance: value.clearance,
    addendum: value.addendum,
    dedendum: value.dedendum,
    boreDiameter: value.boreDiameter,
    mateTeeth,
    shaftAngleDeg,
    center: true,
    segmentsPerTooth: value.segmentsPerTooth,
  });
  const meta = readGearMeta(shape);
  if (!meta || meta.kind !== 'bevel') {
    throw new Error(`bevelGearPair: failed to derive bevel metadata for "${label}"`);
  }
  return { shape, meta };
}

export function bevelGearPair(options: BevelGearPairOptions): BevelGearPairResult {
  const shaftAngleDeg = normalizeShaftAngle('bevelGearPair', options.shaftAngleDeg ?? 90);
  const pinionTeeth =
    options.pinion instanceof Shape
      ? (() => {
          const meta = readGearMeta(options.pinion);
          if (!meta || meta.kind !== 'bevel') {
            throw new Error('bevelGearPair: pinion shape must come from bevelGear(...)');
          }
          return meta.teeth;
        })()
      : options.pinion.teeth;
  const gearTeeth =
    options.gear instanceof Shape
      ? (() => {
          const meta = readGearMeta(options.gear);
          if (!meta || meta.kind !== 'bevel') {
            throw new Error('bevelGearPair: gear shape must come from bevelGear(...)');
          }
          return meta.teeth;
        })()
      : options.gear.teeth;

  const pinionPitchAngleDeg = computeBevelPitchAngleDeg(pinionTeeth, gearTeeth, shaftAngleDeg);
  const gearPitchAngleDeg = shaftAngleDeg - pinionPitchAngleDeg;
  const pinionPitchAngleRad = (pinionPitchAngleDeg * Math.PI) / 180;
  const gearPitchAngleRad = (gearPitchAngleDeg * Math.PI) / 180;

  const pinion = resolveBevelPairMember(options.pinion, 'pinion', gearTeeth, shaftAngleDeg);
  const gear = resolveBevelPairMember(options.gear, 'gear', pinionTeeth, shaftAngleDeg);
  const diagnostics: GearPairDiagnostic[] = [];

  if (Math.abs(pinion.meta.module - gear.meta.module) > 1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'bevel.module_mismatch',
      message: `Module mismatch: pinion=${pinion.meta.module}, gear=${gear.meta.module}`,
    });
  }

  if (Math.abs(pinion.meta.pressureAngleDeg - gear.meta.pressureAngleDeg) > 1e-4) {
    diagnostics.push({
      level: 'error',
      code: 'bevel.pressure_angle_mismatch',
      message: `Pressure-angle mismatch: pinion=${pinion.meta.pressureAngleDeg.toFixed(3)}deg, gear=${gear.meta.pressureAngleDeg.toFixed(3)}deg`,
    });
  }

  const pinionMetaPitch = pinion.meta.pitchAngleDeg ?? pinionPitchAngleDeg;
  const gearMetaPitch = gear.meta.pitchAngleDeg ?? gearPitchAngleDeg;
  if (Math.abs(pinionMetaPitch - pinionPitchAngleDeg) > 0.75) {
    diagnostics.push({
      level: 'warn',
      code: 'bevel.pinion_pitch_angle_override',
      message: `Pinion pitch angle (${pinionMetaPitch.toFixed(2)}deg) differs from tooth-derived ${pinionPitchAngleDeg.toFixed(2)}deg`,
    });
  }
  if (Math.abs(gearMetaPitch - gearPitchAngleDeg) > 0.75) {
    diagnostics.push({
      level: 'warn',
      code: 'bevel.gear_pitch_angle_override',
      message: `Gear pitch angle (${gearMetaPitch.toFixed(2)}deg) differs from tooth-derived ${gearPitchAngleDeg.toFixed(2)}deg`,
    });
  }

  const coneDistancePinion = pinion.meta.coneDistance ?? pinion.meta.pitchRadius / Math.max(EPSILON, Math.sin(pinionPitchAngleRad));
  const coneDistanceGear = gear.meta.coneDistance ?? gear.meta.pitchRadius / Math.max(EPSILON, Math.sin(gearPitchAngleRad));
  const coneDistance = (coneDistancePinion + coneDistanceGear) * 0.5;
  if (Math.abs(coneDistancePinion - coneDistanceGear) > pinion.meta.module * 0.5) {
    diagnostics.push({
      level: 'warn',
      code: 'bevel.cone_distance_mismatch',
      message: `Pitch-cone distances differ: pinion=${coneDistancePinion.toFixed(3)}, gear=${coneDistanceGear.toFixed(3)}`,
    });
  }

  const pinionToApex = pinion.meta.pitchRadius / Math.max(EPSILON, Math.tan(pinionPitchAngleRad)) - pinion.meta.faceWidth * 0.5;
  const gearToApex = gear.meta.pitchRadius / Math.max(EPSILON, Math.tan(gearPitchAngleRad)) - gear.meta.faceWidth * 0.5;
  if (pinionToApex <= 0 || gearToApex <= 0) {
    diagnostics.push({
      level: 'warn',
      code: 'bevel.short_cone',
      message: 'Face width is large relative to pitch angles; apex alignment may be truncated.',
    });
  }

  const shaftAngleRad = (shaftAngleDeg * Math.PI) / 180;
  const pinionAxis: [number, number, number] = [0, 0, 1];
  const gearAxis: [number, number, number] = [Math.sin(shaftAngleRad), 0, Math.cos(shaftAngleRad)];
  const pinionCenter: [number, number, number] = [0, 0, -pinionToApex];
  const gearCenter: [number, number, number] = [-gearAxis[0] * gearToApex, 0, -gearAxis[2] * gearToApex];

  const place = options.place ?? true;
  const phaseDeg = options.phaseDeg ?? 180 / gear.meta.teeth;
  const pinionShape = place ? pinion.shape.translate(pinionCenter[0], pinionCenter[1], pinionCenter[2]) : pinion.shape.clone();
  const gearShape = place
    ? gear.shape.rotate(0, 0, phaseDeg).rotate(0, shaftAngleDeg, 0).translate(gearCenter[0], gearCenter[1], gearCenter[2])
    : gear.shape.clone();
  const status = pairStatusFromDiagnostics(diagnostics);
  const backlash = options.backlash ?? Math.max(pinion.meta.backlash, gear.meta.backlash, 0);

  return {
    pinion: pinionShape,
    gear: gearShape,
    shaftAngleDeg,
    pinionPitchAngleDeg,
    gearPitchAngleDeg,
    coneDistance,
    backlash,
    jointRatio: -(pinion.meta.teeth / gear.meta.teeth),
    speedReduction: gear.meta.teeth / pinion.meta.teeth,
    phaseDeg,
    pinionAxis,
    gearAxis,
    pinionCenter,
    gearCenter,
    diagnostics,
    status,
  };
}

// ---------------------------------------------------------------------------
// Side / face gear pair
// ---------------------------------------------------------------------------

function resolveSideGearPairSideMember(value: Shape | SideGearSpec): { shape: Shape; meta: GearMeta } {
  if (value instanceof Shape) {
    const meta = readGearMeta(value);
    if (!meta || meta.kind !== 'face') {
      throw new Error('sideGearPair: "side" shape has no side-gear metadata; pass a sideGear(...) result or SideGearSpec');
    }
    return { shape: value.clone(), meta };
  }

  const fallbackFaceWidth = Math.max(2, value.module * 5);
  const shape = sideGear({
    module: value.module,
    teeth: value.teeth,
    pressureAngleDeg: value.pressureAngleDeg,
    faceWidth: value.faceWidth ?? fallbackFaceWidth,
    backlash: value.backlash,
    clearance: value.clearance,
    addendum: value.addendum,
    dedendum: value.dedendum,
    boreDiameter: value.boreDiameter,
    center: true,
    segmentsPerTooth: value.segmentsPerTooth,
    side: value.side,
    toothHeight: value.toothHeight,
  });
  const meta = readGearMeta(shape);
  if (!meta || meta.kind !== 'face') {
    throw new Error('sideGearPair: failed to derive side-gear metadata for "side"');
  }
  return { shape, meta };
}

function resolveSideGearPairVerticalMember(value: Shape | GearPairSpec): { shape: Shape; meta: GearMeta } {
  if (value instanceof Shape) {
    const meta = readGearMeta(value);
    if (!meta || meta.kind !== 'spur') {
      throw new Error('sideGearPair: "vertical" shape has no spur-gear metadata; pass a spurGear(...) result or GearPairSpec');
    }
    return { shape: value.clone(), meta };
  }

  const fallbackFaceWidth = Math.max(2, value.module * 6);
  const shape = spurGear({
    module: value.module,
    teeth: value.teeth,
    pressureAngleDeg: value.pressureAngleDeg,
    faceWidth: value.faceWidth ?? fallbackFaceWidth,
    backlash: value.backlash,
    clearance: value.clearance,
    addendum: value.addendum,
    dedendum: value.dedendum,
    boreDiameter: value.boreDiameter,
    center: true,
    segmentsPerTooth: value.segmentsPerTooth,
  });
  const meta = readGearMeta(shape);
  if (!meta || meta.kind !== 'spur') {
    throw new Error('sideGearPair: failed to derive spur-gear metadata for "vertical"');
  }
  return { shape, meta };
}

function defaultSideMeshPlaneZ(meta: GearMeta): number {
  if (meta.meshPlaneZ != null) return meta.meshPlaneZ;
  if (meta.toothSide === 'bottom') {
    return -(meta.faceWidth * 0.5 + (meta.toothHeight ?? meta.module) * 0.5);
  }
  return meta.faceWidth * 0.5 + (meta.toothHeight ?? meta.module) * 0.5;
}

/**
 * Pair helper for side (crown/face) gear + perpendicular "vertical" spur gear.
 * Auto-placement rotates the spur around +Y and positions it to mesh at the side tooth band.
 */
export function sideGearPair(options: SideGearPairOptions): SideGearPairResult {
  const side = resolveSideGearPairSideMember(options.side);
  const vertical = resolveSideGearPairVerticalMember(options.vertical);
  const diagnostics: GearPairDiagnostic[] = [];

  if (Math.abs(side.meta.module - vertical.meta.module) > 1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'sidegear.module_mismatch',
      message: `Module mismatch: side=${side.meta.module}, vertical=${vertical.meta.module}`,
    });
  }

  const pressureAngleDeg = side.meta.pressureAngleDeg;
  if (Math.abs(pressureAngleDeg - vertical.meta.pressureAngleDeg) > 1e-4) {
    diagnostics.push({
      level: 'error',
      code: 'sidegear.pressure_angle_mismatch',
      message: `Pressure-angle mismatch: side=${pressureAngleDeg.toFixed(3)}deg, vertical=${vertical.meta.pressureAngleDeg.toFixed(3)}deg`,
    });
  }

  const module = side.meta.module;
  const nominalCenterDistance = side.meta.pitchRadius + vertical.meta.pitchRadius;
  const requestedBacklash = options.backlash ?? Math.max(side.meta.backlash, vertical.meta.backlash, 0);
  const centerDistance = options.centerDistance ?? nominalCenterDistance + requestedBacklash * 0.5;
  if (!Number.isFinite(centerDistance) || centerDistance <= 0) {
    throw new Error('sideGearPair: centerDistance must be > 0');
  }

  const sideBandMin = side.meta.rootRadius;
  const sideBandMax = side.meta.outerRadius;
  const verticalBandMin = centerDistance - vertical.meta.outerRadius;
  const verticalBandMax = centerDistance - vertical.meta.rootRadius;
  const radialOverlap = Math.min(sideBandMax, verticalBandMax) - Math.max(sideBandMin, verticalBandMin);

  if (verticalBandMin < sideBandMin - 1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'sidegear.root_collision',
      message: `Center distance ${centerDistance.toFixed(4)} drives the vertical tooth below side root radius ${sideBandMin.toFixed(4)}`,
    });
  }

  if (radialOverlap <= 1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'sidegear.no_contact',
      message: `No radial tooth-band overlap at center distance ${centerDistance.toFixed(4)}`,
    });
  } else if (radialOverlap < module * 0.35) {
    diagnostics.push({
      level: 'warn',
      code: 'sidegear.low_overlap',
      message: `Radial overlap ${radialOverlap.toFixed(4)} is low for module ${module}`,
    });
  }

  const impliedBacklash = 2 * (centerDistance - nominalCenterDistance);
  if (impliedBacklash < -1e-6) {
    diagnostics.push({
      level: 'error',
      code: 'sidegear.negative_backlash',
      message: `Computed backlash ${impliedBacklash.toFixed(4)} is negative`,
    });
  } else if (impliedBacklash < module * 0.01) {
    diagnostics.push({
      level: 'warn',
      code: 'sidegear.tight_backlash',
      message: `Backlash ${impliedBacklash.toFixed(4)} is very tight for module ${module}`,
    });
  }

  const sideToothHeight = side.meta.toothHeight ?? module;
  if (sideToothHeight < module * 0.5) {
    diagnostics.push({
      level: 'warn',
      code: 'sidegear.shallow_tooth_height',
      message: `toothHeight ${sideToothHeight.toFixed(4)} is shallow; target >= ${(module * 0.5).toFixed(4)}`,
    });
  }

  const meshPlaneZ = options.meshPlaneZ ?? defaultSideMeshPlaneZ(side.meta);
  if (!Number.isFinite(meshPlaneZ)) {
    throw new Error('sideGearPair: meshPlaneZ must be finite');
  }
  if (
    side.meta.toothMinZ != null &&
    side.meta.toothMaxZ != null &&
    (meshPlaneZ < side.meta.toothMinZ - 1e-6 || meshPlaneZ > side.meta.toothMaxZ + 1e-6)
  ) {
    diagnostics.push({
      level: 'error',
      code: 'sidegear.mesh_plane_out_of_band',
      message: `meshPlaneZ ${meshPlaneZ.toFixed(4)} is outside side tooth band [${side.meta.toothMinZ.toFixed(4)}, ${side.meta.toothMaxZ.toFixed(4)}]`,
    });
  }

  const place = options.place ?? true;
  const sideShape = place ? side.shape : side.shape.clone();
  const phaseDeg = options.phaseDeg ?? 180 / vertical.meta.teeth;
  const verticalShape = place
    ? vertical.shape.rotate(0, 0, phaseDeg).rotate(-90, 0, 0).translate(centerDistance, 0, meshPlaneZ)
    : vertical.shape;
  const status = pairStatusFromDiagnostics(diagnostics);

  return {
    side: sideShape,
    vertical: verticalShape,
    centerDistance,
    centerDistanceNominal: nominalCenterDistance,
    backlash: impliedBacklash,
    pressureAngleDeg,
    meshPlaneZ,
    radialOverlap,
    jointRatio: -(side.meta.teeth / vertical.meta.teeth),
    speedReduction: vertical.meta.teeth / side.meta.teeth,
    phaseDeg,
    diagnostics,
    status,
  };
}

export function faceGearPair(options: FaceGearPairOptions): FaceGearPairResult {
  let pair: SideGearPairResult;
  try {
    pair = sideGearPair({
      side: options.face,
      vertical: options.vertical,
      backlash: options.backlash,
      centerDistance: options.centerDistance,
      meshPlaneZ: options.meshPlaneZ,
      place: options.place,
      phaseDeg: options.phaseDeg,
    });
  } catch (error) {
    remapErrorPrefix(error, 'sideGearPair', 'faceGearPair');
  }

  const diagnostics = pair.diagnostics.map((d) => ({
    ...d,
    code: d.code.startsWith('sidegear.') ? `facegear.${d.code.slice('sidegear.'.length)}` : d.code,
  }));

  return {
    face: pair.side,
    vertical: pair.vertical,
    centerDistance: pair.centerDistance,
    centerDistanceNominal: pair.centerDistanceNominal,
    backlash: pair.backlash,
    pressureAngleDeg: pair.pressureAngleDeg,
    meshPlaneZ: pair.meshPlaneZ,
    radialOverlap: pair.radialOverlap,
    jointRatio: pair.jointRatio,
    speedReduction: pair.speedReduction,
    phaseDeg: pair.phaseDeg,
    diagnostics,
    status: pairStatusFromDiagnostics(diagnostics),
  };
}

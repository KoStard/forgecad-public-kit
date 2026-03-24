/**
 * Gear pair functions: gearPair, bevelGearPair, sideGearPair, faceGearPair.
 */

import { Shape } from '../../kernel';
import { EPSILON, GearMeta, clamp01, readGearMeta, remapErrorPrefix } from './infrastructure';
import { SpurGearOptions, spurGear } from './spur';
import { FaceGearOptions, SideGearOptions, sideGear } from './side-face';
import { BevelGearOptions, bevelGear, computeBevelPitchAngleDeg, normalizeShaftAngle } from './bevel';

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

function pairStatusFromDiagnostics(diagnostics: GearPairDiagnostic[]): 'ok' | 'warn' | 'error' {
  if (diagnostics.some((d) => d.level === 'error')) return 'error';
  if (diagnostics.some((d) => d.level === 'warn')) return 'warn';
  return 'ok';
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
  } as SpurGearOptions);
  const meta = readGearMeta(shape);
  if (!meta || meta.kind !== 'spur') {
    throw new Error(`gearPair: failed to derive spur-gear metadata for "${label}"`);
  }
  return { shape, meta };
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
  } as BevelGearOptions);
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
  } as SideGearOptions);
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
  } as SpurGearOptions);
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

/**
 * Gear library barrel — re-exports all public gear API.
 */

export { GEAR_META_KEY } from './infrastructure';
export type { GearKind, GearMeta } from './infrastructure';
export { readGearMeta, attachGearMeta } from './infrastructure';

export type { SpurGearOptions } from './spur';
export { spurGear } from './spur';

export type { SideGearOptions, FaceGearOptions } from './side-face';
export { sideGear, faceGear } from './side-face';

export type { RingGearOptions } from './ring';
export { ringGear } from './ring';

export type { RackGearOptions } from './rack';
export { rackGear } from './rack';

export type { BevelGearOptions } from './bevel';
export { bevelGear } from './bevel';

export type {
  GearPairSpec,
  GearPairOptions,
  GearPairDiagnostic,
  GearPairResult,
  BevelGearPairSpec,
  BevelGearPairOptions,
  BevelGearPairResult,
  SideGearSpec,
  FaceGearSpec,
  SideGearPairOptions,
  SideGearPairResult,
  FaceGearPairOptions,
  FaceGearPairResult,
} from './pairs';
export { gearPair, bevelGearPair, sideGearPair, faceGearPair } from './pairs';

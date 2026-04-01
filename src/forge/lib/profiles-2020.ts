/**
 * 20x20 B-type slot-6 aluminum extrusion profiles.
 */

import { Shape } from '../kernel';
import { Sketch } from '../sketch/core';
import { sketchExtrude } from '../sketch/extrude';
import { rect, roundedRect, circle2d } from '../sketch/primitives';
import { difference2d, union2d } from '../sketch/booleans';
import { sketchRotate } from '../sketch/transforms';
import { buildSingleSideSlotCutter } from './tslot';

/**
 * 2D profile options for a 20x20 B-type slot 6 extrusion.
 *
 * These defaults target common B-type 20x20 slot-6 geometry conventions:
 * - slot width ~6
 * - slot depth ~5.5
 * - center bore ~5.5 (core for M6 tapping)
 * - four internal relief pockets
 */
export interface Profile2020BSlot6ProfileOptions {
  /** Slot mouth width. */
  slotWidth?: number;
  /** Wider inner slot width. */
  slotInnerWidth?: number;
  /** Slot depth from outer face. */
  slotDepth?: number;
  /** Depth of the narrow neck before widening into slotInnerWidth. */
  slotNeckDepth?: number;
  /** Center core bore diameter (set 0 to disable). */
  centerBoreDia?: number;
  /** Solid boss diameter around center bore (must exceed centerBoreDia when bore is enabled). */
  centerBossDia?: number;
  /** Width of diagonal ribs connecting center boss to corner regions. */
  diagonalWebWidth?: number;
  /** Outside corner radius. */
  outerCornerRadius?: number;
  /** Circle segment count. */
  segments?: number;
}

export interface Profile2020BSlot6Options extends Profile2020BSlot6ProfileOptions {
  /** Center the extrusion around Z=0 instead of starting at Z=0. */
  center?: boolean;
}

const DEFAULT_2020_B_SLOT6_PROFILE: Required<Profile2020BSlot6ProfileOptions> = {
  slotWidth: 6.0,
  slotInnerWidth: 8.2,
  slotDepth: 5.5,
  slotNeckDepth: 1.8,
  centerBoreDia: 5.5,
  centerBossDia: 8.4,
  diagonalWebWidth: 4.4,
  outerCornerRadius: 1.0,
  segments: 40,
};

function normalized2020BSlot6ProfileOptions(options?: Profile2020BSlot6ProfileOptions): Required<Profile2020BSlot6ProfileOptions> {
  const opts: Required<Profile2020BSlot6ProfileOptions> = {
    ...DEFAULT_2020_B_SLOT6_PROFILE,
    ...(options ?? {}),
  };

  if (opts.slotWidth <= 0) throw new Error('profile2020BSlot6Profile: slotWidth must be > 0');
  if (opts.slotInnerWidth < opts.slotWidth) {
    throw new Error('profile2020BSlot6Profile: slotInnerWidth must be >= slotWidth');
  }
  if (opts.slotDepth <= 0 || opts.slotDepth >= 10) {
    throw new Error('profile2020BSlot6Profile: slotDepth must be > 0 and < 10');
  }
  if (opts.slotNeckDepth <= 0 || opts.slotNeckDepth >= opts.slotDepth) {
    throw new Error('profile2020BSlot6Profile: slotNeckDepth must be > 0 and < slotDepth');
  }
  if (opts.centerBoreDia < 0) {
    throw new Error('profile2020BSlot6Profile: centerBoreDia must be >= 0');
  }
  if (opts.centerBossDia < 0) {
    throw new Error('profile2020BSlot6Profile: centerBossDia must be >= 0');
  }
  if (opts.centerBoreDia > 0 && opts.centerBossDia <= opts.centerBoreDia) {
    throw new Error('profile2020BSlot6Profile: centerBossDia must be > centerBoreDia');
  }
  if (opts.diagonalWebWidth <= 0 || opts.diagonalWebWidth >= 12) {
    throw new Error('profile2020BSlot6Profile: diagonalWebWidth must be > 0 and < 12');
  }
  if (opts.outerCornerRadius < 0) {
    throw new Error('profile2020BSlot6Profile: outerCornerRadius must be >= 0');
  }
  if (opts.segments < 8) {
    throw new Error('profile2020BSlot6Profile: segments must be >= 8');
  }

  // Keep internal geometry inside 20x20 envelope.
  const half = 10;
  if (opts.slotDepth >= half) {
    throw new Error('profile2020BSlot6Profile: slotDepth must be < 10');
  }
  return opts;
}

/**
 * Accurate-ish 2D profile for 20x20 B-type slot 6.
 *
 * Returns a drawing-ready Sketch centered at origin.
 */
export function profile2020BSlot6Profile(options: Profile2020BSlot6ProfileOptions = {}): Sketch {
  const opts = normalized2020BSlot6ProfileOptions(options);
  const size = 20;

  const outer = opts.outerCornerRadius > 0 ? roundedRect(size, size, opts.outerCornerRadius, true) : rect(size, size, true);

  const sideSlot = buildSingleSideSlotCutter(size, opts.slotWidth, opts.slotInnerWidth, opts.slotDepth, opts.slotNeckDepth);
  const slots = union2d(sideSlot, sketchRotate(sideSlot, 90), sketchRotate(sideSlot, 180), sketchRotate(sideSlot, 270));

  let profile = difference2d(outer, slots);

  // Internal skeleton: center boss + X-webs for monolithic connectivity.
  const centerBoss = opts.centerBossDia > 0 ? circle2d(opts.centerBossDia / 2, opts.segments) : null;
  const webLen = size * 1.15;
  const xWeb = rect(webLen, opts.diagonalWebWidth, true);
  const webs = union2d(sketchRotate(xWeb, 45), sketchRotate(xWeb, -45));

  profile = union2d(profile, webs);
  if (centerBoss) {
    profile = union2d(profile, centerBoss);
  }

  if (opts.centerBoreDia > 0) {
    profile = difference2d(profile, circle2d(opts.centerBoreDia / 2, opts.segments));
  }

  return profile;
}

/**
 * 20x20 B-type slot 6 extrusion with profile-accurate defaults.
 *
 * Pass option overrides if your supplier's profile differs slightly.
 */
export function profile2020BSlot6(length: number, options: Profile2020BSlot6Options = {}): Shape {
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error('profile2020BSlot6: "length" must be > 0');
  }
  const { center = false, ...profileOptions } = options;
  const profile = profile2020BSlot6Profile(profileOptions);
  return sketchExtrude(profile, length, { center }).toShape();
}

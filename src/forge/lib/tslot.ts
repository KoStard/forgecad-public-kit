/**
 * T-slot profile and extrusion: tSlotProfile, tSlotExtrusion.
 */

import { Sketch } from '../sketch/core';
import { sketchExtrude } from '../sketch/extrude';
import { rect, roundedRect } from '../sketch/primitives';
import { difference2d, union2d } from '../sketch/booleans';
import { sketchRotate, sketchTranslate } from '../sketch/transforms';
import { circle2d } from '../sketch/primitives';
import { Shape } from '../kernel';

export interface TSlotProfileOptions {
  /** Outer profile size (square). */
  size?: number;
  /** Slot mouth width (the narrow opening at each side). */
  slotWidth?: number;
  /** Wider interior slot cavity width. Must be >= slotWidth. */
  slotInnerWidth?: number;
  /** Total slot depth from outer face inward. */
  slotDepth?: number;
  /** Depth of the narrow mouth before it widens into slotInnerWidth. */
  slotNeckDepth?: number;
  /** Outer shell wall thickness. */
  wall?: number;
  /** Central cross-web thickness. */
  web?: number;
  /** Center boss diameter (solid material around center bore). */
  centerBossDia?: number;
  /** Center bore diameter (for tapping/through-hole). Set 0 to disable. */
  centerBoreDia?: number;
  /** Outer corner radius. */
  outerCornerRadius?: number;
  /** Segment count used for circular features in 2D. */
  segments?: number;
}

export interface TSlotExtrusionOptions extends TSlotProfileOptions {
  /** Center the extrusion around Z=0 instead of starting at Z=0. */
  center?: boolean;
}

const DEFAULT_T_SLOT_PROFILE: Required<TSlotProfileOptions> = {
  size: 20,
  slotWidth: 6,
  slotInnerWidth: 10.4,
  slotDepth: 6,
  slotNeckDepth: 1.6,
  wall: 1.4,
  web: 2.1,
  centerBossDia: 8.2,
  centerBoreDia: 4.2,
  outerCornerRadius: 1.0,
  segments: 36,
};

function validateTSlotProfileOptions(opts: Required<TSlotProfileOptions>): void {
  if (!Number.isFinite(opts.size) || opts.size <= 0) {
    throw new Error('tSlotProfile: "size" must be > 0');
  }
  if (!Number.isFinite(opts.slotWidth) || opts.slotWidth <= 0) {
    throw new Error('tSlotProfile: "slotWidth" must be > 0');
  }
  if (!Number.isFinite(opts.slotInnerWidth) || opts.slotInnerWidth < opts.slotWidth) {
    throw new Error('tSlotProfile: "slotInnerWidth" must be >= slotWidth');
  }
  if (!Number.isFinite(opts.slotDepth) || opts.slotDepth <= 0) {
    throw new Error('tSlotProfile: "slotDepth" must be > 0');
  }
  if (!Number.isFinite(opts.slotNeckDepth) || opts.slotNeckDepth <= 0 || opts.slotNeckDepth >= opts.slotDepth) {
    throw new Error('tSlotProfile: "slotNeckDepth" must be > 0 and < slotDepth');
  }
  if (!Number.isFinite(opts.wall) || opts.wall < 0) {
    throw new Error('tSlotProfile: "wall" must be >= 0');
  }
  if (!Number.isFinite(opts.web) || opts.web <= 0) {
    throw new Error('tSlotProfile: "web" must be > 0');
  }
  if (opts.wall * 2 >= opts.size) {
    throw new Error('tSlotProfile: wall is too large for size');
  }
  const half = opts.size / 2;
  if (opts.slotDepth >= half) {
    throw new Error('tSlotProfile: slotDepth must be < size / 2');
  }
  if (opts.slotInnerWidth >= opts.size - 2 * opts.wall + 1e-6) {
    throw new Error('tSlotProfile: slotInnerWidth is too large for the requested wall thickness');
  }
  if (opts.centerBossDia < 0 || opts.centerBoreDia < 0) {
    throw new Error('tSlotProfile: centerBossDia/centerBoreDia must be >= 0');
  }
  if (opts.centerBoreDia > 0 && opts.centerBossDia <= opts.centerBoreDia) {
    throw new Error('tSlotProfile: centerBossDia must be > centerBoreDia when centerBoreDia > 0');
  }
  if (!Number.isFinite(opts.outerCornerRadius) || opts.outerCornerRadius < 0) {
    throw new Error('tSlotProfile: outerCornerRadius must be >= 0');
  }
  if (!Number.isFinite(opts.segments) || opts.segments < 8) {
    throw new Error('tSlotProfile: segments must be >= 8');
  }
}

function normalizedTSlotProfileOptions(options?: TSlotProfileOptions): Required<TSlotProfileOptions> {
  const merged: Required<TSlotProfileOptions> = {
    ...DEFAULT_T_SLOT_PROFILE,
    ...(options ?? {}),
  };

  // Avoid self-intersecting corner radius from oversized values.
  merged.outerCornerRadius = Math.min(merged.outerCornerRadius, merged.size / 2 - 1e-6);
  validateTSlotProfileOptions(merged);
  return merged;
}

export function buildSingleSideSlotCutter(
  size: number,
  slotWidth: number,
  slotInnerWidth: number,
  slotDepth: number,
  slotNeckDepth: number,
): Sketch {
  const neck = sketchTranslate(rect(slotWidth, slotNeckDepth, true), 0, size / 2 - slotNeckDepth / 2);
  const pocketDepth = slotDepth - slotNeckDepth;
  const pocket = sketchTranslate(rect(slotInnerWidth, pocketDepth, true), 0, size / 2 - slotNeckDepth - pocketDepth / 2);
  return union2d(neck, pocket);
}

/**
 * Build a 2D T-slot cross-section sketch.
 *
 * Default parameters describe a 20x20 B-type profile with slot 6.
 * Use this when you want a drawing-ready profile sketch before extrusion.
 */
export function tSlotProfile(options: TSlotProfileOptions = {}): Sketch {
  const opts = normalizedTSlotProfileOptions(options);
  const {
    size,
    slotWidth,
    slotInnerWidth,
    slotDepth,
    slotNeckDepth,
    wall,
    web,
    centerBossDia,
    centerBoreDia,
    outerCornerRadius,
    segments,
  } = opts;

  const innerSize = size - wall * 2;
  const innerCornerRadius = Math.max(0, Math.min(outerCornerRadius - wall, innerSize / 2 - 1e-6));

  const outer = outerCornerRadius > 0 ? roundedRect(size, size, outerCornerRadius, true) : rect(size, size, true);

  const inner = innerCornerRadius > 0 ? roundedRect(innerSize, innerSize, innerCornerRadius, true) : rect(innerSize, innerSize, true);

  const shell = difference2d(outer, inner);
  const webX = rect(innerSize, web, true);
  const webY = rect(web, innerSize, true);
  const boss = centerBossDia > 0 ? circle2d(centerBossDia / 2, segments) : null;

  const sideSlot = buildSingleSideSlotCutter(size, slotWidth, slotInnerWidth, slotDepth, slotNeckDepth);
  const slots = union2d(sideSlot, sketchRotate(sideSlot, 90), sketchRotate(sideSlot, 180), sketchRotate(sideSlot, 270));

  let profile = union2d(shell, webX, webY);
  if (boss) profile = union2d(profile, boss);
  profile = difference2d(profile, slots);
  if (centerBoreDia > 0) {
    profile = difference2d(profile, circle2d(centerBoreDia / 2, segments));
  }

  return profile;
}

/**
 * Build a T-slot extrusion from the generated 2D profile.
 * Extrudes along +Z by default.
 */
export function tSlotExtrusion(length: number, options: TSlotExtrusionOptions = {}): Shape {
  if (!Number.isFinite(length) || length <= 0) {
    throw new Error('tSlotExtrusion: "length" must be > 0');
  }
  const { center = false, ...profileOptions } = options;
  const profile = tSlotProfile(profileOptions);
  return sketchExtrude(profile, length, { center }).toShape();
}

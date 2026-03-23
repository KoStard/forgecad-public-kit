/**
 * ForgeCAD Part Library
 *
 * Pre-built parametric parts available in user scripts via lib.xxx()
 * Each part is a function that returns a Shape, taking parameters.
 */

import { box, cylinder, sphere, union, difference, intersection, Shape, buildShapeFromCompilePlan } from './kernel';
import { ShapeGroup } from './group';
import { Sketch, setSketchCompileProfilePlan } from './sketch/core';
import { profilePlanFromCrossSection } from './compilePlan';
import { TrackedShape } from './sketch/topology';
import { rect, roundedRect, circle2d, polygon } from './sketch/primitives';
import { union2d, difference2d } from './sketch/booleans';
import { sketchTranslate, sketchRotate } from './sketch/transforms';
import { sketchExtrude } from './sketch/extrude';
import {
  type ExplodeAxis,
  type ExplodeBounds,
  type ExplodeConfigOptions,
  type ExplodeDirective,
  type ExplodeDirection,
  computeExplodeMotion,
  createResolvedExplodeConfig,
  explodeAdd,
  explodeBoundsCenter,
  explodeLeafFanStage,
  explodeMergeBounds,
  explodeMul,
  hasExplodeOverride,
  resolveExplodeDirective,
  resolveExplodeLocalFanDirection,
} from './explodeCore';

/** M-series bolt hole (through-hole) */
export function boltHole(diameter: number, depth: number): Shape {
  return cylinder(depth, diameter / 2, undefined, 32, true);
}

type MetricSize = 'M2' | 'M2.5' | 'M3' | 'M4' | 'M5' | 'M6' | 'M8' | 'M10';
type FastenerFit = 'close' | 'normal' | 'loose' | 'tap';

export interface FastenerHoleOptions {
  standard?: 'iso-metric';
  size: MetricSize;
  fit?: FastenerFit;
  depth: number;
  counterbore?: { depth: number; diameter?: number };
  countersink?: { diameter: number; angleDeg?: number };
  center?: boolean;
  segments?: number;
}

const METRIC_HOLE_TABLE: Record<MetricSize, { close: number; normal: number; loose: number; tap: number; head: number }> = {
  M2: { close: 2.2, normal: 2.4, loose: 2.6, tap: 1.6, head: 4.0 },
  'M2.5': { close: 2.7, normal: 2.9, loose: 3.1, tap: 2.05, head: 5.0 },
  M3: { close: 3.2, normal: 3.4, loose: 3.6, tap: 2.5, head: 5.6 },
  M4: { close: 4.3, normal: 4.5, loose: 4.8, tap: 3.3, head: 7.5 },
  M5: { close: 5.3, normal: 5.5, loose: 5.8, tap: 4.2, head: 9.2 },
  M6: { close: 6.4, normal: 6.6, loose: 7.0, tap: 5.0, head: 11.0 },
  M8: { close: 8.4, normal: 9.0, loose: 10.0, tap: 6.8, head: 14.0 },
  M10: { close: 10.5, normal: 11.0, loose: 12.0, tap: 8.5, head: 18.0 },
};

/**
 * Standardized metric fastener hole (through-hole/tap drill + optional counterbore/countersink).
 * Returns hole geometry intended as a cutter (subtract from part).
 */
export function fastenerHole(opts: FastenerHoleOptions): Shape {
  const standard = opts.standard ?? 'iso-metric';
  if (standard !== 'iso-metric') {
    throw new Error(`Unsupported fastener standard "${standard}"`);
  }

  const sizeData = METRIC_HOLE_TABLE[opts.size];
  if (!sizeData) throw new Error(`Unsupported fastener size "${opts.size}"`);

  const fit = opts.fit ?? 'normal';
  const holeDia = sizeData[fit];
  const depth = opts.depth;
  const segs = opts.segments ?? 48;
  const centered = opts.center ?? true;

  let hole = cylinder(depth, holeDia / 2, undefined, segs, true);

  if (opts.counterbore) {
    const boreDepth = Math.max(0.01, opts.counterbore.depth);
    const boreDia = Math.max(holeDia, opts.counterbore.diameter ?? sizeData.head);
    const bore = cylinder(boreDepth, boreDia / 2, undefined, segs, true)
      .translate(0, 0, depth / 2 - boreDepth / 2);
    hole = union(hole, bore);
  }

  if (opts.countersink) {
    const sinkDia = Math.max(holeDia, opts.countersink.diameter);
    const angleDeg = opts.countersink.angleDeg ?? 90;
    const angleRad = (angleDeg * Math.PI) / 180;
    const sinkDepth = ((sinkDia - holeDia) * 0.5) / Math.tan(angleRad * 0.5);
    const sink = cylinder(Math.max(0.01, sinkDepth), sinkDia / 2, holeDia / 2, segs, true)
      .translate(0, 0, depth / 2 - sinkDepth / 2);
    hole = union(hole, sink);
  }

  if (!centered) {
    hole = hole.translate(0, 0, depth / 2);
  }

  return hole;
}

/** Counterbore hole — through-hole with a wider recess at the top */
export function counterbore(
  holeDia: number,
  boreDia: number,
  boreDepth: number,
  totalDepth: number,
): Shape {
  const through = cylinder(totalDepth, holeDia / 2, undefined, 32, true);
  const bore = cylinder(boreDepth, boreDia / 2, undefined, 32)
    .translate(0, 0, totalDepth / 2 - boreDepth);
  return union(through, bore);
}

/** Rectangular tube / hollow box */
export function tube(
  outerX: number,
  outerY: number,
  outerZ: number,
  wall: number,
): Shape {
  const outer = box(outerX, outerY, outerZ);
  const inner = box(outerX - wall * 2, outerY - wall * 2, outerZ + 1)
    .translate(wall, wall, -0.5);
  return outer.subtract(inner);
}

/** Pipe — hollow cylinder */
export function pipe(
  height: number,
  outerRadius: number,
  wall: number,
  segments = 32,
): Shape {
  const outer = cylinder(height, outerRadius, undefined, segments);
  const inner = cylinder(height + 1, outerRadius - wall, undefined, segments)
    .translate(0, 0, -0.5);
  return outer.subtract(inner);
}

/** Hex nut profile (2D extruded) */
export function hexNut(
  acrossFlats: number,
  height: number,
  holeDia: number,
): Shape {
  // Hexagon as intersection of 3 rotated boxes
  const r = acrossFlats / 2;
  const w = acrossFlats * 1.2; // oversized box
  const slab = box(w, acrossFlats, height, true);
  const hex = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));
  const hole = cylinder(height + 1, holeDia / 2, undefined, 32, true);
  return hex.subtract(hole);
}

/** Rounded box — box with spheres at corners (approximate fillet) */
export function roundedBox(
  x: number,
  y: number,
  z: number,
  radius: number,
): Shape {
  // Intersect 3 axis-aligned rounded slabs
  const sx = box(x - radius * 2, y, z, true);
  const sy = box(x, y - radius * 2, z, true);
  const sz = box(x, y, z - radius * 2, true);
  return union(sx, sy, sz).translate(x / 2, y / 2, z / 2);
}

/** Mounting bracket — L-shaped with optional holes */
export function bracket(
  width: number,
  height: number,
  depth: number,
  thick: number,
  holeDia = 0,
): Shape {
  const base = box(width, depth, thick);
  const wall = box(width, thick, height).translate(0, 0, thick);
  let shape = union(base, wall);

  if (holeDia > 0) {
    const baseHole = cylinder(thick + 1, holeDia / 2, undefined, 24)
      .translate(width / 2, depth / 2, 0);
    const wallHole = cylinder(thick + 1, holeDia / 2, undefined, 24)
      .rotate(90, 0, 0)
      .translate(width / 2, 0, thick + height / 2);
    shape = shape.subtract(baseHole).subtract(wallHole);
  }

  return shape;
}

/** Grid pattern of holes */
export function holePattern(
  rows: number,
  cols: number,
  spacingX: number,
  spacingY: number,
  holeDia: number,
  depth: number,
): Shape {
  const holes: Shape[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      holes.push(
        cylinder(depth, holeDia / 2, undefined, 24)
          .translate(c * spacingX, r * spacingY, 0),
      );
    }
  }
  return union(...holes);
}

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

function buildSingleSideSlotCutter(
  size: number,
  slotWidth: number,
  slotInnerWidth: number,
  slotDepth: number,
  slotNeckDepth: number,
): Sketch {
  const neck = sketchTranslate(
    rect(slotWidth, slotNeckDepth, true),
    0,
    size / 2 - slotNeckDepth / 2,
  );
  const pocketDepth = slotDepth - slotNeckDepth;
  const pocket = sketchTranslate(
    rect(slotInnerWidth, pocketDepth, true),
    0,
    size / 2 - slotNeckDepth - pocketDepth / 2,
  );
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

  const outer = outerCornerRadius > 0
    ? roundedRect(size, size, outerCornerRadius, true)
    : rect(size, size, true);

  const inner = innerCornerRadius > 0
    ? roundedRect(innerSize, innerSize, innerCornerRadius, true)
    : rect(innerSize, innerSize, true);

  const shell = difference2d(outer, inner);
  const webX = rect(innerSize, web, true);
  const webY = rect(web, innerSize, true);
  const boss = centerBossDia > 0 ? circle2d(centerBossDia / 2, segments) : null;

  const sideSlot = buildSingleSideSlotCutter(size, slotWidth, slotInnerWidth, slotDepth, slotNeckDepth);
  const slots = union2d(
    sideSlot,
    sketchRotate(sideSlot, 90),
    sketchRotate(sideSlot, 180),
    sketchRotate(sideSlot, 270),
  );

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

function normalized2020BSlot6ProfileOptions(
  options?: Profile2020BSlot6ProfileOptions,
): Required<Profile2020BSlot6ProfileOptions> {
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
export function profile2020BSlot6Profile(
  options: Profile2020BSlot6ProfileOptions = {},
): Sketch {
  const opts = normalized2020BSlot6ProfileOptions(options);
  const size = 20;

  const outer = opts.outerCornerRadius > 0
    ? roundedRect(size, size, opts.outerCornerRadius, true)
    : rect(size, size, true);

  const sideSlot = buildSingleSideSlotCutter(
    size,
    opts.slotWidth,
    opts.slotInnerWidth,
    opts.slotDepth,
    opts.slotNeckDepth,
  );
  const slots = union2d(
    sideSlot,
    sketchRotate(sideSlot, 90),
    sketchRotate(sideSlot, 180),
    sketchRotate(sideSlot, 270),
  );

  let profile = difference2d(outer, slots);

  // Internal skeleton: center boss + X-webs for monolithic connectivity.
  const centerBoss = opts.centerBossDia > 0 ? circle2d(opts.centerBossDia / 2, opts.segments) : null;
  const webLen = size * 1.15;
  const xWeb = rect(webLen, opts.diagonalWebWidth, true);
  const webs = union2d(
    sketchRotate(xWeb, 45),
    sketchRotate(xWeb, -45),
  );

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

export type { ExplodeAxis, ExplodeDirective, ExplodeDirection };

export interface ExplodeNamedItem {
  name: string;
  shape?: Shape | TrackedShape | ShapeGroup;
  sketch?: Sketch;
  color?: string;
  group?: ExplodeItem[];
  explode?: ExplodeDirective;
}

export type ExplodeItem = Shape | Sketch | TrackedShape | ShapeGroup | ExplodeNamedItem;

export interface ExplodeOptions extends ExplodeConfigOptions {}

/**
 * Deterministic exploded-view transform for arrays / named assemblies / ShapeGroup trees.
 * Returns the same structure type as input, with translated shapes/sketches.
 */
export function explode<T extends ExplodeItem[] | ShapeGroup>(
  items: T,
  options: ExplodeOptions = {},
): T {
  const config = createResolvedExplodeConfig(options);
  const boundsCache = new WeakMap<object, ExplodeBounds | null>();
  const rootBounds = computeExplodeBounds(items, boundsCache);
  const rootCenter = explodeBoundsCenter(rootBounds) ?? [0, 0, 0];

  const centerForNode = (
    node: unknown,
    fallback: [number, number, number],
  ): [number, number, number] => explodeBoundsCenter(computeExplodeBounds(node, boundsCache)) ?? fallback;

  const nodeMotion = (
    node: unknown,
    path: string,
    depth: number,
    originCenter: [number, number, number],
    inheritedDirection: [number, number, number] | undefined,
    name?: string,
    local?: ExplodeDirective,
  ) => {
    const center = centerForNode(node, originCenter);
    return computeExplodeMotion({
      pathKeys: [path],
      seed: path,
      depth,
      center,
      originCenter,
      inheritedDirection,
      name,
      local,
      config,
    });
  };

  const leafMotion = (
    node: unknown,
    path: string,
    depth: number,
    originCenter: [number, number, number],
    inheritedDirection: [number, number, number] | undefined,
    name?: string,
    local?: ExplodeDirective,
  ) => {
    const directive = resolveExplodeDirective([path], name, local, config);
    if (depth > 1 && !hasExplodeOverride(directive)) {
      const center = centerForNode(node, originCenter);
      const direction = resolveExplodeLocalFanDirection(center, originCenter, inheritedDirection, path);
      return {
        direction,
        branchDirection: inheritedDirection ?? direction,
        offset: explodeMul(direction, config.amount * explodeLeafFanStage(config, depth)),
      };
    }
    return nodeMotion(node, path, depth, originCenter, inheritedDirection, name, local);
  };

  const explodeLeaf = (
    leaf: Shape | Sketch | TrackedShape,
    offset: [number, number, number],
  ): Shape | Sketch | TrackedShape => {
    if (leaf instanceof TrackedShape) return leaf.translate(offset[0], offset[1], offset[2]);
    if (leaf instanceof Shape) return leaf.translate(offset[0], offset[1], offset[2]);
    return leaf.translate(offset[0], offset[1]);
  };

  const childPath = (parentPath: string, index: number, name?: string): string => {
    const label = name && name.trim().length > 0 ? `${index + 1}:${name}` : `${index + 1}`;
    return parentPath ? `${parentPath}/${label}` : label;
  };

  const explodeGroup = (
    grp: ShapeGroup,
    path: string,
    depth: number,
    inherited: [number, number, number],
    parentCenter: [number, number, number],
    parentDirection: [number, number, number] | undefined,
  ): ShapeGroup => {
    const groupCenter = centerForNode(grp, parentCenter);
    const motion = nodeMotion(grp, path, depth, parentCenter, parentDirection);
    const total = explodeAdd(inherited, motion.offset);
    return new ShapeGroup(grp.children.map((child, i) => {
      const p = childPath(path, i, grp.childName(i));
      if (child instanceof ShapeGroup) return explodeGroup(child, p, depth + 1, total, groupCenter, motion.branchDirection);
      return explodeLeaf(child, explodeAdd(total, leafMotion(child, p, depth + 1, groupCenter, motion.branchDirection).offset));
    }), grp.childNames);
  };

  const explodeItemNode = (
    item: ExplodeItem,
    path: string,
    depth: number,
    inherited: [number, number, number],
    parentCenter: [number, number, number],
    parentDirection: [number, number, number] | undefined,
  ): ExplodeItem => {
    if (item instanceof ShapeGroup) return explodeGroup(item, path, depth, inherited, parentCenter, parentDirection);
    if (item instanceof TrackedShape || item instanceof Shape || item instanceof Sketch) {
      return explodeLeaf(item, explodeAdd(inherited, leafMotion(item, path, depth, parentCenter, parentDirection).offset));
    }
    if (!isExplodeNamedItem(item)) return item;

    const itemCenter = centerForNode(item, parentCenter);
    const motion = nodeMotion(item, path, depth, parentCenter, parentDirection, item.name, item.explode);
    const total = explodeAdd(inherited, motion.offset);
    const out: ExplodeNamedItem = { ...item };

    if (item.shape instanceof ShapeGroup) {
      out.shape = explodeGroup(item.shape, `${path}/shape`, depth + 1, total, itemCenter, motion.branchDirection);
    } else if (item.shape instanceof TrackedShape || item.shape instanceof Shape) {
      out.shape = explodeLeaf(
        item.shape,
        total,
      ) as Shape | TrackedShape;
    }

    if (item.sketch instanceof Sketch) {
      out.sketch = explodeLeaf(
        item.sketch,
        total,
      ) as Sketch;
    }

    if (Array.isArray(item.group)) {
      out.group = item.group.map((child, i) => {
        const p = childPath(`${path}/group`, i, isExplodeNamedItem(child) ? child.name : undefined);
        return explodeItemNode(child, p, depth + 1, total, itemCenter, motion.branchDirection);
      });
    }

    return out;
  };

  if (items instanceof ShapeGroup) {
    return new ShapeGroup(items.children.map((child, i) => {
      const p = childPath('root', i, items.childName(i));
      if (child instanceof ShapeGroup) return explodeGroup(child, p, 1, [0, 0, 0], rootCenter, undefined);
      return explodeLeaf(child, nodeMotion(child, p, 1, rootCenter, undefined).offset);
    }), items.childNames) as T;
  }

  return items.map((item, i) => {
    const p = childPath('root', i, isExplodeNamedItem(item) ? item.name : undefined);
    return explodeItemNode(item, p, 1, [0, 0, 0], rootCenter, undefined);
  }) as T;
}

function isExplodeNamedItem(value: unknown): value is ExplodeNamedItem {
  return !!value && typeof value === 'object' && typeof (value as { name?: unknown }).name === 'string';
}

function computeExplodeBounds(
  node: unknown,
  cache: WeakMap<object, ExplodeBounds | null>,
): ExplodeBounds | null {
  if (!node || typeof node !== 'object') return null;
  if (cache.has(node)) return cache.get(node) ?? null;

  let bounds: ExplodeBounds | null = null;

  if (node instanceof TrackedShape) {
    bounds = shapeToBounds(node.toShape());
  } else if (node instanceof Shape) {
    bounds = shapeToBounds(node);
  } else if (node instanceof Sketch) {
    const sb = node.bounds();
    bounds = {
      min: [sb.min[0], sb.min[1], 0],
      max: [sb.max[0], sb.max[1], 0],
    };
  } else if (node instanceof ShapeGroup) {
    node.children.forEach((child) => {
      bounds = explodeMergeBounds(bounds, computeExplodeBounds(child, cache));
    });
  } else if (Array.isArray(node)) {
    node.forEach((child) => {
      bounds = explodeMergeBounds(bounds, computeExplodeBounds(child, cache));
    });
  } else if (isExplodeNamedItem(node)) {
    if (node.shape) bounds = explodeMergeBounds(bounds, computeExplodeBounds(node.shape, cache));
    if (node.sketch) bounds = explodeMergeBounds(bounds, computeExplodeBounds(node.sketch, cache));
    if (Array.isArray(node.group)) {
      node.group.forEach((child) => {
        bounds = explodeMergeBounds(bounds, computeExplodeBounds(child, cache));
      });
    }
  }

  cache.set(node, bounds);
  return bounds;
}

function shapeToBounds(shape: Shape): ExplodeBounds {
  const bb = shape.boundingBox();
  return {
    min: [bb.min[0], bb.min[1], bb.min[2]],
    max: [bb.max[0], bb.max[1], bb.max[2]],
  };
}

/**
 * Route a pipe (solid or hollow) through 3D waypoints with smooth bends.
 *
 * Each interior waypoint gets a torus-section bend. Straight segments connect them.
 * Returns a single unioned Shape.
 */
export function pipeRoute(
  points: [number, number, number][],
  radius: number,
  options?: { bendRadius?: number; wall?: number; segments?: number },
): Shape {
  if (points.length < 2) throw new Error('pipeRoute needs at least 2 points');

  const bendR = options?.bendRadius ?? radius * 4;
  const wall = options?.wall;
  const segs = options?.segments ?? 32;

  // Precompute directions and bend info for each interior point
  type BendInfo = {
    axis: [number, number, number];   // rotation axis (cross of incoming/outgoing)
    center: [number, number, number]; // bend arc center
    angle: number;                    // bend angle in radians
    trimLen: number;                  // how much to shorten adjacent straights
    startPt: [number, number, number]; // where straight ends / bend starts
    endPt: [number, number, number];   // where bend ends / next straight starts
  };

  const bends: (BendInfo | null)[] = new Array(points.length).fill(null);

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1], cur = points[i], next = points[i + 1];
    // Incoming direction (toward cur)
    const dIn = normalize(sub(cur, prev));
    // Outgoing direction (away from cur)
    const dOut = normalize(sub(next, cur));

    const dotVal = clampDot(dot(dIn, dOut));
    // Angle between the two directions
    const bendAngle = Math.acos(dotVal); // 0 = straight, PI = U-turn

    if (bendAngle < 1e-6) {
      // Nearly straight — no bend needed
      continue;
    }

    const crossVec = cross(dIn, dOut);
    const crossLen = vecLen(crossVec);
    if (crossLen < 1e-10) continue; // collinear (U-turn) — skip

    const axis = normalize(crossVec) as [number, number, number];

    // The bend center is offset from the waypoint perpendicular to the bisector
    // trimLen = bendR * tan(bendAngle/2)
    const halfAngle = bendAngle / 2;
    const trimLen = bendR * Math.tan(halfAngle);

    // Start of bend: back along incoming direction by trimLen from cur
    const startPt = addVec(cur, scale(dIn, -trimLen));
    // End of bend: along outgoing direction by trimLen from cur
    const endPt = addVec(cur, scale(dOut, trimLen));

    // Bend center: from startPt, perpendicular to dIn toward the inside of the bend
    // The perpendicular direction in the bend plane pointing toward center:
    // It's the component of -dOut perpendicular to dIn, normalized, scaled by bendR
    // Simpler: center = startPt + normalize(cross(axis, dIn)) * bendR
    const perpDir = normalize(cross(axis, dIn)) as [number, number, number];
    const center = addVec(startPt, scale(perpDir, bendR));

    bends[i] = { axis, center, angle: bendAngle, trimLen, startPt, endPt };
  }

  const parts: Shape[] = [];

  // Helper: create a cylinder from point A to point B
  const makeSeg = (a: [number, number, number], b: [number, number, number]) => {
    const d = sub(b, a);
    const len = vecLen(d);
    if (len < 0.01) return null;
    const dir = normalize(d) as [number, number, number];
    // Build cylinder along Z, then orient and translate
    let seg = cylinder(len, radius, undefined, segs);
    if (wall != null && wall > 0) {
      const inner = cylinder(len + 0.1, radius - wall, undefined, segs).translate(0, 0, -0.05);
      seg = seg.subtract(inner);
    }
    // pointAlong + translate to midpoint
    seg = seg.pointAlong(dir);
    // After pointAlong, cylinder base is at origin. We need base at point a.
    // pointAlong maps [0,0,1] → dir. The base (z=0) stays at origin.
    seg = seg.translate(a[0], a[1], a[2]);
    return seg;
  };

  // Helper: create a torus bend section
  const makeBend = (info: BendInfo) => {
    const circlePts: [number, number][] = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cx = bendR + radius * Math.cos(a);
      const cy = radius * Math.sin(a);
      circlePts.push([cx, cy]);
    }

    const angleDeg = info.angle * 180 / Math.PI;
    const bendSegs = Math.max(4, Math.ceil(segs * angleDeg / 360));

    const outerPlan: import('./compilePlan').ShapeCompilePlan = {
      kind: 'revolve',
      profile: { kind: 'polygon', points: circlePts, transforms: [] },
      degrees: angleDeg,
      segments: bendSegs,
    };
    let bendShape = buildShapeFromCompilePlan(outerPlan);

    if (wall != null && wall > 0) {
      const innerPts: [number, number][] = [];
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2;
        innerPts.push([bendR + (radius - wall) * Math.cos(a), (radius - wall) * Math.sin(a)]);
      }
      const innerPlan: import('./compilePlan').ShapeCompilePlan = {
        kind: 'revolve',
        profile: { kind: 'polygon', points: innerPts, transforms: [] },
        degrees: angleDeg,
        segments: bendSegs,
      };
      const innerBend = buildShapeFromCompilePlan(innerPlan);
      bendShape = bendShape.subtract(innerBend);
    }

    // Now orient the bend into world space.
    // After revolve around Z:
    //   - At angle=0: centerline at (bendR, 0, 0). Radial dir = +X.
    //   - Tangent at angle=0 = +Y (sweeping from +X toward +Y around Z).
    //   - Revolve axis = +Z.
    //
    // We need to map:
    //   - Local +X (radial) → radialDir (center → startPt)
    //   - Local +Y (tangent) → incoming pipe direction at startPt
    //   - Local +Z (revolve axis) → info.axis

    // Direction from bend center to startPt
    const radialDir = normalize(sub(info.startPt, info.center)) as [number, number, number];

    // Tangent at start = the incoming pipe direction.
    // cross(axis, radialDir) gives a vector perpendicular to both, in the bend plane.
    // Since radialDir points outward from center and axis is the revolve axis,
    // this cross product gives the tangent direction at the start of the arc.
    const tangentDir = cross(info.axis, radialDir) as [number, number, number];

    // Build 4x4 column-major transform:
    // col0 = radialDir  (local X → world)
    // col1 = tangentDir (local Y → world)
    // col2 = axis        (local Z → world)
    // col3 = center      (translation)
    const c = info.center;
    bendShape = bendShape.transform([
      radialDir[0], radialDir[1], radialDir[2], 0,
      tangentDir[0], tangentDir[1], tangentDir[2], 0,
      info.axis[0], info.axis[1], info.axis[2], 0,
      c[0], c[1], c[2], 1,
    ] as any);

    return bendShape;
  };

  // Build segments
  for (let i = 0; i < points.length - 1; i++) {
    // Effective start/end of this straight segment, trimmed by bends
    let segStart = points[i] as [number, number, number];
    let segEnd = points[i + 1] as [number, number, number];

    if (bends[i]) segStart = bends[i]!.endPt;
    if (bends[i + 1]) segEnd = bends[i + 1]!.startPt;

    const seg = makeSeg(segStart, segEnd);
    if (seg) parts.push(seg);
  }

  // Build bends
  for (let i = 1; i < points.length - 1; i++) {
    if (bends[i]) {
      parts.push(makeBend(bends[i]!));
    }
  }

  if (parts.length === 0) throw new Error('pipeRoute produced no geometry');
  return parts.length === 1 ? parts[0] : union(...parts);
}

// --- Vector math helpers ---
function sub(a: number[], b: number[]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function addVec(a: number[], b: number[]): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}
function scale(v: number[], s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}
function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross(a: number[], b: number[]): [number, number, number] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function vecLen(v: number[]): number {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}
function normalize(v: number[]): [number, number, number] {
  const l = vecLen(v) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
function clampDot(d: number): number {
  return Math.max(-1, Math.min(1, d));
}

/**
 * Pipe elbow — a curved pipe section (torus arc) for connecting two pipe directions.
 *
 * By default creates a bend in the XZ plane: incoming along +Z, outgoing rotated by `angle`.
 * The bend starts at the origin, curving away from it.
 *
 * @param pipeRadius  - Pipe outer radius
 * @param bendRadius  - Centerline bend radius (distance from arc center to pipe center)
 * @param angle       - Bend angle in degrees (e.g. 90 for a right-angle bend)
 * @param options.wall     - Wall thickness for hollow pipe
 * @param options.segments - Circumferential segments (default 32)
 * @param options.from     - Incoming direction vector (default [0,0,1])
 * @param options.to       - Outgoing direction vector (overrides angle if both from/to given)
 */
export function elbow(
  pipeRadius: number,
  bendRadius: number,
  angle?: number | { from?: [number, number, number]; to?: [number, number, number]; wall?: number; segments?: number },
  options?: { wall?: number; segments?: number; from?: [number, number, number]; to?: [number, number, number] },
): Shape {
  // Normalize overloaded args
  let angleDeg: number;
  let wall: number | undefined;
  let segs: number;
  let fromDir: [number, number, number] | undefined;
  let toDir: [number, number, number] | undefined;

  if (typeof angle === 'object' && angle !== null) {
    // elbow(pipeRadius, bendRadius, { from, to, wall, segments })
    angleDeg = 90; // default, may be overridden by from/to
    wall = angle.wall;
    segs = angle.segments ?? 32;
    fromDir = angle.from;
    toDir = angle.to;
  } else {
    angleDeg = angle ?? 90;
    wall = options?.wall;
    segs = options?.segments ?? 32;
    fromDir = options?.from;
    toDir = options?.to;
  }

  // If from/to are given, compute angle from them
  if (fromDir && toDir) {
    const nFrom = normalize(fromDir);
    const nTo = normalize(toDir);
    const d = clampDot(dot(nFrom, nTo));
    angleDeg = Math.acos(d) * 180 / Math.PI;
  }

  if (angleDeg < 0.01) throw new Error('elbow: angle too small');

  const angleRad = angleDeg * Math.PI / 180;

  // Build torus cross-section: circle at distance bendRadius from Z axis
  const circlePts: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    circlePts.push([bendRadius + pipeRadius * Math.cos(a), pipeRadius * Math.sin(a)]);
  }

  const bendSegs = Math.max(4, Math.ceil(segs * angleDeg / 360));

  const outerPlan: import('./compilePlan').ShapeCompilePlan = {
    kind: 'revolve',
    profile: { kind: 'polygon', points: circlePts, transforms: [] },
    degrees: angleDeg,
    segments: bendSegs,
  };
  let bendShape = buildShapeFromCompilePlan(outerPlan);

  if (wall != null && wall > 0) {
    const innerPts: [number, number][] = [];
    const innerR = pipeRadius - wall;
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      innerPts.push([bendRadius + innerR * Math.cos(a), innerR * Math.sin(a)]);
    }
    const innerPlan: import('./compilePlan').ShapeCompilePlan = {
      kind: 'revolve',
      profile: { kind: 'polygon', points: innerPts, transforms: [] },
      degrees: angleDeg,
      segments: bendSegs,
    };
    const innerBend = buildShapeFromCompilePlan(innerPlan);
    bendShape = bendShape.subtract(innerBend);
  }

  // Orient if from/to directions are given
  if (fromDir && toDir) {
    const nFrom = normalize(fromDir) as [number, number, number];
    const nTo = normalize(toDir) as [number, number, number];
    const crossVec = cross(nFrom, nTo);
    const crossLen = vecLen(crossVec);
    if (crossLen < 1e-10) return bendShape; // collinear, no rotation needed

    const axis = normalize(crossVec) as [number, number, number];

    // In local space after revolve around Z:
    //   - Arc starts at +X (radial), tangent at start is +Y
    //   - Revolve axis is +Z
    // We want: local +Y → fromDir (tangent), local +Z → axis (revolve), local +X → perpendicular (radial)
    const perpDir = cross(axis, nFrom) as [number, number, number];

    bendShape = bendShape.transform([
      perpDir[0], perpDir[1], perpDir[2], 0,
      nFrom[0], nFrom[1], nFrom[2], 0,
      axis[0], axis[1], axis[2], 0,
      0, 0, 0, 1,
    ] as any);
  }

  return bendShape;
}

const GEAR_META_KEY = Symbol.for('forgecad.library.gearMeta');
const EPSILON = 1e-9;

type GearKind = 'spur' | 'ring' | 'rack' | 'bevel' | 'face';

interface GearMeta {
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

function flankAngleAtRadius(
  radius: number,
  baseRadius: number,
  halfThicknessAtPitch: number,
  pressureAngleRad: number,
): number {
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
    pressureAngleRad: pressureAngleDeg * Math.PI / 180,
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
  const toothBandRaw = difference2d(
    profile,
    circle2d(meta.rootRadius, Math.max(48, normalized.teeth * 2)),
  );
  // Use backend-level simplify for polygon cleanup (not a public Sketch API).
  const simplifiedCross = toothBandRaw.cross.simplify(1e-6);
  const toothBandProfile = setSketchCompileProfilePlan(
    new Sketch(simplifiedCross, toothBandRaw.colorHex),
    profilePlanFromCrossSection(simplifiedCross),
  );

  const teethBand = sketchExtrude(toothBandProfile, normalized.toothHeight, { center: false })
    .toShape()
    .translate(0, 0, zBands.toothMinZ);

  let shape = union(rootDisk, teethBand);
  if (normalized.boreDiameter > 0) {
    const zMin = Math.min(zBands.bodyMinZ, zBands.toothMinZ);
    const zMax = Math.max(zBands.bodyMaxZ, zBands.toothMaxZ);
    const bore = cylinder(
      (zMax - zMin) + 2,
      normalized.boreDiameter * 0.5,
      undefined,
      Math.max(48, normalized.teeth * 2),
    ).translate(0, 0, zMin - 1);
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

  const outerRadius = options.outerDiameter != null
    ? options.outerDiameter * 0.5
    : rootRadius + rimWidth;
  if (!(outerRadius > rootRadius + EPSILON)) {
    throw new Error('ringGear: outer diameter/rim width leaves no ring body');
  }

  return {
    module,
    teeth: options.teeth,
    pressureAngleDeg,
    pressureAngleRad: pressureAngleDeg * Math.PI / 180,
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
  const pressureAngleRad = pressureAngleDeg * Math.PI / 180;

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
  const shaftAngleRad = shaftAngleDeg * Math.PI / 180;
  const numerator = teeth * Math.sin(shaftAngleRad);
  const denominator = mateTeeth + teeth * Math.cos(shaftAngleRad);
  const angle = Math.atan2(numerator, denominator);
  if (!(angle > EPSILON && angle < shaftAngleRad - EPSILON)) {
    throw new Error('bevelGear: could not derive a valid pitch angle from teeth/shaft angle');
  }
  return angle * 180 / Math.PI;
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
  const pitchAngleRad = pitchAngleDeg * Math.PI / 180;
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

function resolveGearPairMember(
  value: Shape | GearPairSpec,
  label: 'pinion' | 'gear',
): { shape: Shape; meta: GearMeta } {
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
  const nominalCenterDistance = (pinion.meta.pitchRadius + gear.meta.pitchRadius);
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
  const pathLength = Math.sqrt(Math.max(0, pinion.meta.outerRadius ** 2 - pinion.meta.baseRadius ** 2))
    + Math.sqrt(Math.max(0, gear.meta.outerRadius ** 2 - gear.meta.baseRadius ** 2))
    - centerDistance * Math.sin(alphaWorking);
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
  const phaseDeg = options.phaseDeg ?? (180 / gear.meta.teeth);
  const gearShape = place
    ? gear.shape.rotate(0, 0, phaseDeg).translate(centerDistance, 0, 0)
    : gear.shape;
  const status = pairStatusFromDiagnostics(diagnostics);

  return {
    pinion: pinionShape,
    gear: gearShape,
    centerDistance,
    centerDistanceNominal: nominalCenterDistance,
    backlash: impliedBacklash,
    pressureAngleDeg,
    workingPressureAngleDeg: alphaWorking * 180 / Math.PI,
    contactRatio,
    jointRatio: -(pinion.meta.teeth / gear.meta.teeth),
    speedReduction: gear.meta.teeth / pinion.meta.teeth,
    phaseDeg,
    diagnostics,
    status,
  };
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
  const pinionTeeth = options.pinion instanceof Shape
    ? (() => {
      const meta = readGearMeta(options.pinion);
      if (!meta || meta.kind !== 'bevel') {
        throw new Error('bevelGearPair: pinion shape must come from bevelGear(...)');
      }
      return meta.teeth;
    })()
    : options.pinion.teeth;
  const gearTeeth = options.gear instanceof Shape
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
  const pinionPitchAngleRad = pinionPitchAngleDeg * Math.PI / 180;
  const gearPitchAngleRad = gearPitchAngleDeg * Math.PI / 180;

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

  const coneDistancePinion = pinion.meta.coneDistance
    ?? (pinion.meta.pitchRadius / Math.max(EPSILON, Math.sin(pinionPitchAngleRad)));
  const coneDistanceGear = gear.meta.coneDistance
    ?? (gear.meta.pitchRadius / Math.max(EPSILON, Math.sin(gearPitchAngleRad)));
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

  const shaftAngleRad = shaftAngleDeg * Math.PI / 180;
  const pinionAxis: [number, number, number] = [0, 0, 1];
  const gearAxis: [number, number, number] = [Math.sin(shaftAngleRad), 0, Math.cos(shaftAngleRad)];
  const pinionCenter: [number, number, number] = [0, 0, -pinionToApex];
  const gearCenter: [number, number, number] = [
    -gearAxis[0] * gearToApex,
    0,
    -gearAxis[2] * gearToApex,
  ];

  const place = options.place ?? true;
  const phaseDeg = options.phaseDeg ?? (180 / gear.meta.teeth);
  const pinionShape = place
    ? pinion.shape.translate(pinionCenter[0], pinionCenter[1], pinionCenter[2])
    : pinion.shape.clone();
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
  const centerDistance = options.centerDistance ?? (nominalCenterDistance + requestedBacklash * 0.5);
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
  if (side.meta.toothMinZ != null && side.meta.toothMaxZ != null
    && (meshPlaneZ < side.meta.toothMinZ - 1e-6 || meshPlaneZ > side.meta.toothMaxZ + 1e-6)) {
    diagnostics.push({
      level: 'error',
      code: 'sidegear.mesh_plane_out_of_band',
      message: `meshPlaneZ ${meshPlaneZ.toFixed(4)} is outside side tooth band [${side.meta.toothMinZ.toFixed(4)}, ${side.meta.toothMaxZ.toFixed(4)}]`,
    });
  }

  const place = options.place ?? true;
  const sideShape = place ? side.shape : side.shape.clone();
  const phaseDeg = options.phaseDeg ?? (180 / vertical.meta.teeth);
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
/** All library parts, keyed by name */
export const partLibrary = {
  boltHole,
  fastenerHole,
  counterbore,
  tube,
  pipe,
  explode,
  hexNut,
  roundedBox,
  bracket,
  holePattern,
  thread,
  bolt,
  nut,
  washer,
  fastenerSet,
  pipeRoute,
  elbow,
  tSlotProfile,
  tSlotExtrusion,
  profile2020BSlot6Profile,
  profile2020BSlot6,
  spurGear,
  bevelGear,
  faceGear,
  sideGear,
  ringGear,
  rackGear,
  gearPair,
  bevelGearPair,
  faceGearPair,
  sideGearPair,
};

// --- Thread / Fastener library ---

/**
 * External thread via twisted extrusion — no SDF grid artifacts.
 * 
 * The idea: build a cross-section that's a circle at the root diameter
 * with one trapezoidal bump out to the crest diameter. Then twist-extrude
 * it so the bump traces a helix. Manifold's extrude+twist produces clean
 * structured geometry — quads split into triangles that follow the thread.
 * 
 * Returns a threaded cylinder along +Z from z=0 to z=length.
 */
export function thread(
  diameter: number,
  pitch: number,
  length: number,
  options?: { depth?: number; segments?: number },
): Shape {
  const r = diameter / 2;
  const depth = options?.depth ?? pitch * 0.35;
  const segs = options?.segments ?? 36;
  const rRoot = r - depth;
  const rCrest = r;
  const turns = length / pitch;
  const divisions = Math.max(4, Math.ceil(turns * segs));

  // The tooth angular width at the root radius.
  // Standard metric: tooth occupies ~50% of pitch circumferentially.
  // One pitch spans (pitch / rRoot) radians at the root circle.
  const toothHalfWidth = (pitch * 0.5) / (2 * rRoot);  // half-width in radians
  const flankWidth = toothHalfWidth * 0.4;  // transition zone

  const pts: [number, number][] = [];
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * Math.PI * 2;

    // Distance from the tooth center (at angle=0), wrapped to [-π, π]
    let da = a;
    if (da > Math.PI) da -= Math.PI * 2;
    const absDA = Math.abs(da);

    let radius: number;
    if (absDA < toothHalfWidth - flankWidth) {
      // Crest flat
      radius = rCrest;
    } else if (absDA < toothHalfWidth) {
      // Flank — linear blend from crest to root
      const t = (absDA - (toothHalfWidth - flankWidth)) / flankWidth;
      radius = rCrest + (rRoot - rCrest) * t;
    } else {
      // Root
      radius = rRoot;
    }

    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }

  const plan: import('./compilePlan').ShapeCompilePlan = {
    kind: 'extrude',
    profile: { kind: 'polygon', points: pts, transforms: [] },
    height: length,
    center: false,
    twist: turns * 360,
    twistSegments: divisions,
  };
  return buildShapeFromCompilePlan(plan);
}

/**
 * Hex bolt with real helical threads.
 * Head at z=0..headHeight, shaft extends downward along -Z.
 */
export function bolt(
  diameter: number,
  length: number,
  options?: {
    pitch?: number;
    headHeight?: number;
    headAcrossFlats?: number;
    threadLength?: number;
    segments?: number;
  },
): Shape {
  const r = diameter / 2;
  const pitch = options?.pitch ?? diameter * 0.15;
  const headH = options?.headHeight ?? diameter * 0.65;
  const headAF = options?.headAcrossFlats ?? diameter * 1.6;
  const threadLen = options?.threadLength ?? length;
  const segs = options?.segments ?? 36;

  // Hex head
  const slab = box(headAF * 1.2, headAF, headH, true).translate(0, 0, headH / 2);
  const hexHead = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));

  // Smooth shaft (unthreaded portion)
  const unthreadedLen = length - threadLen;
  const parts: Shape[] = [hexHead];

  if (unthreadedLen > 0.1) {
    parts.push(
      cylinder(unthreadedLen, r, undefined, segs).translate(0, 0, -unthreadedLen),
    );
  }

  // Threaded portion
  const threaded = thread(diameter, pitch, threadLen, { segments: segs })
    .translate(0, 0, -length);
  parts.push(threaded);

  // TODO: Tip chamfer (cone at the end)
  return union(...parts);
}

/**
 * Hex nut with threaded bore.
 * Centered at origin, height along Z.
 */
export function nut(
  diameter: number,
  options?: {
    pitch?: number;
    height?: number;
    acrossFlats?: number;
    segments?: number;
  },
): Shape {
  const r = diameter / 2;
  const pitch = options?.pitch ?? diameter * 0.15;
  const nutH = options?.height ?? diameter * 0.8;
  const nutAF = options?.acrossFlats ?? diameter * 1.6;
  const segs = options?.segments ?? 36;

  // Hex body
  const slab = box(nutAF * 1.2, nutAF, nutH, true);
  let hexBody = slab
    .intersect(slab.rotate(0, 0, 60))
    .intersect(slab.rotate(0, 0, 120));

  // Threaded bore (internal thread = slightly larger bore with thread ridges)
  // For simplicity, use a clearance bore — internal threads are hard to see anyway
  const bore = cylinder(nutH + 1, r + 0.1, undefined, 48, true);
  hexBody = hexBody.subtract(bore);

  // TODO: Chamfer top and bottom edges

  return hexBody;
}

// --- Washers ---

type WasherStandard = 'din-125-a';

/** DIN 125-A flat washer dimensions (inner diameter, outer diameter, thickness) in mm */
const WASHER_TABLE: Record<MetricSize, { id: number; od: number; t: number }> = {
  M2:    { id: 2.2,  od: 5.0,  t: 0.3 },
  'M2.5': { id: 2.7, od: 6.0,  t: 0.5 },
  M3:    { id: 3.2,  od: 7.0,  t: 0.5 },
  M4:    { id: 4.3,  od: 9.0,  t: 0.8 },
  M5:    { id: 5.3,  od: 10.0, t: 1.0 },
  M6:    { id: 6.4,  od: 12.0, t: 1.6 },
  M8:    { id: 8.4,  od: 17.0, t: 1.6 },
  M10:   { id: 10.5, od: 21.0, t: 2.0 },
};

/**
 * Flat washer (DIN 125-A by default).
 * Returns a flat ring centered at the origin, thickness along Z.
 * Use `size` to select a standard metric thread size.
 */
export function washer(
  size: MetricSize,
  options?: { standard?: WasherStandard; segments?: number },
): Shape {
  const dims = WASHER_TABLE[size];
  if (!dims) throw new Error(`washer: unsupported size "${size}"`);
  const segs = options?.segments ?? 48;
  const outer = cylinder(dims.t, dims.od / 2, undefined, segs, true);
  const bore  = cylinder(dims.t + 1, dims.id / 2, undefined, segs, true);
  return outer.subtract(bore);
}

// --- Fastener Sets ---

/** Reference dimensions for a complete fastener joint. */
export interface FastenerSetDimensions {
  size: MetricSize;
  nominalDiameter: number;
  boltLength: number;
  clearanceDia: number;
  tapDia: number;
  nutAcrossFlats: number;
  nutHeight: number;
  washerOuterDia: number;
  washerInnerDia: number;
  washerThickness: number;
}

export interface FastenerSetOptions {
  /** Include a washer under the bolt head (default: true). */
  washerUnderHead?: boolean;
  /** Include a washer under the nut (default: true). */
  washerUnderNut?: boolean;
  /** Clearance hole fit (default: 'normal'). */
  fit?: FastenerFit;
  /** Thread segment count (default: 36). */
  segments?: number;
}

export interface FastenerSetResult {
  /** Hex bolt: head top at z=0, threaded shaft extends toward −Z by `boltLength`. */
  bolt: Shape;
  /** Hex nut centered at z=0. */
  nut: Shape;
  /** Flat washer centered at z=0. Null when washerUnderHead is false. */
  washerUnderHead: Shape | null;
  /** Flat washer centered at z=0. Null when washerUnderNut is false. */
  washerUnderNut: Shape | null;
  /** Clearance-hole cutter (cylinder) centered at z=0, for subtracting from a through-plate. */
  clearanceHole: Shape;
  /** Tap-drill cutter (cylinder) centered at z=0, for subtracting from a tapped plate. */
  tappedHole: Shape;
  /** Reference dimensions for BOM, placement calculations, and documentation. */
  dims: FastenerSetDimensions;
}

/**
 * Complete ISO metric fastener set — bolt, nut, optional washers, and matching hole cutters.
 *
 * All shapes are returned un-positioned (each centered on the Z-axis at z=0 or the
 * convention described in `FastenerSetResult`). Place them yourself using `.translate()`.
 *
 * @param size   - ISO metric thread size, e.g. 'M5'.
 * @param boltLength - Nominal shaft length in mm (head not included).
 * @param options - Optional configuration.
 *
 * @example
 * // Bolt two 8mm plates together with M5 hardware
 * const hw = lib.fastenerSet('M5', 20);
 * const topPlate = box(60, 40, 8).subtract(
 *   hw.clearanceHole.translate(15, 10, 0),
 * );
 * const botPlate = box(60, 40, 8).translate(0, 0, -8).subtract(
 *   hw.tappedHole.translate(15, 10, 0),
 * );
 * const boltPos = hw.bolt.translate(15, 10, 0);
 * return [
 *   { name: 'Top Plate', shape: topPlate, color: '#9ab4cc' },
 *   { name: 'Bottom Plate', shape: botPlate, color: '#b0b8c8' },
 *   { name: 'Bolt', shape: boltPos, color: '#aaaaaa' },
 * ];
 */
export function fastenerSet(
  size: MetricSize,
  boltLength: number,
  options?: FastenerSetOptions,
): FastenerSetResult {
  const sizeData = METRIC_HOLE_TABLE[size];
  if (!sizeData) throw new Error(`fastenerSet: unsupported size "${size}"`);
  if (!Number.isFinite(boltLength) || boltLength <= 0) {
    throw new Error('fastenerSet: boltLength must be > 0');
  }

  const fit = options?.fit ?? 'normal';
  const segs = options?.segments ?? 36;
  const includeHeadWasher = options?.washerUnderHead ?? true;
  const includeNutWasher  = options?.washerUnderNut  ?? true;

  const nomDia = parseFloat(size.replace('M', ''));
  const washerDims = WASHER_TABLE[size];
  const nutHeight = nomDia * 0.8;
  const nutAF     = nomDia * 1.6;

  const boltShape = bolt(nomDia, boltLength, { segments: segs });
  const nutShape  = nut(nomDia, { height: nutHeight, acrossFlats: nutAF, segments: segs });

  const headWasher = includeHeadWasher ? washer(size, { segments: segs }) : null;
  const nutWasherShape  = includeNutWasher  ? washer(size, { segments: segs }) : null;

  const clearanceDia = sizeData[fit];
  const tapDia       = sizeData.tap;
  const depth        = boltLength + 1;  // slightly deeper than bolt for clean cutter

  const clearanceHole = cylinder(depth, clearanceDia / 2, undefined, segs, true);
  const tappedHole    = cylinder(depth, tapDia / 2,       undefined, segs, true);

  const dims: FastenerSetDimensions = {
    size,
    nominalDiameter: nomDia,
    boltLength,
    clearanceDia,
    tapDia,
    nutAcrossFlats: nutAF,
    nutHeight,
    washerOuterDia:   washerDims.od,
    washerInnerDia:   washerDims.id,
    washerThickness:  washerDims.t,
  };

  return {
    bolt: boltShape,
    nut: nutShape,
    washerUnderHead: headWasher,
    washerUnderNut:  nutWasherShape,
    clearanceHole,
    tappedHole,
    dims,
  };
}

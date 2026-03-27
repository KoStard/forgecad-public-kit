/**
 * Shared gear infrastructure: GearMeta, GearKind, constants, and utility functions.
 */

import { Shape } from '../../kernel';

export const GEAR_META_KEY = Symbol.for('forgecad.library.gearMeta');
export const EPSILON = 1e-9;

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

export function clamp01(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

export function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

export function involuteFn(angleRad: number): number {
  return Math.tan(angleRad) - angleRad;
}

export function addArcPoints(
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

export function flankAngleAtRadius(radius: number, baseRadius: number, halfThicknessAtPitch: number, pressureAngleRad: number): number {
  const alphaAtRadius = Math.acos(clamp01(baseRadius / Math.max(radius, baseRadius)));
  return halfThicknessAtPitch + involuteFn(pressureAngleRad) - involuteFn(alphaAtRadius);
}

export function attachGearMeta(shape: Shape, meta: GearMeta): Shape {
  (shape as Shape & { [GEAR_META_KEY]?: GearMeta })[GEAR_META_KEY] = meta;
  return shape;
}

export function readGearMeta(shape: Shape): GearMeta | null {
  const meta = (shape as Shape & { [GEAR_META_KEY]?: GearMeta })[GEAR_META_KEY];
  return meta ?? null;
}

export function remapErrorPrefix(error: unknown, sourcePrefix: string, targetPrefix: string): never {
  if (error instanceof Error) {
    if (error.message.startsWith(`${sourcePrefix}:`)) {
      throw new Error(`${targetPrefix}:${error.message.slice(sourcePrefix.length + 1)}`);
    }
    throw error;
  }
  throw error;
}

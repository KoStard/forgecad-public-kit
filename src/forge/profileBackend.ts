/**
 * Backend-agnostic 2D profile representation.
 *
 * Manifold backend: implemented by ManifoldProfileBackend (wraps CrossSection).
 * OCCT backend: could wrap TopoDS_Wire/Face (future).
 *
 * Code outside `backends/` should program against this interface,
 * never against backend-specific types like CrossSection.
 */

import type { ShapeBackend } from './shapeBackend';

export const PROFILE_BACKEND_MARKER = Symbol.for('forgecad.profileBackend');

export interface ProfileBounds {
  min: [number, number];
  max: [number, number];
}

export interface ProfileBackend {
  readonly [PROFILE_BACKEND_MARKER]: true;

  // ── Queries ──────────────────────────────────────────────────────
  area(): number;
  bounds(): ProfileBounds;
  isEmpty(): boolean;
  numVert(): number;
  toPolygons(): number[][][];

  // ── Transforms ───────────────────────────────────────────────────
  translate(x: number, y: number): ProfileBackend;
  rotate(degrees: number): ProfileBackend;
  scale(v: number | [number, number]): ProfileBackend;
  mirror(ax: [number, number]): ProfileBackend;

  // ── 2D Operations ───────────────────────────────────────────────
  offset(delta: number, join: 'Square' | 'Round' | 'Miter'): ProfileBackend;
  simplify(epsilon: number): ProfileBackend;
  warp(fn: (vert: [number, number]) => void): ProfileBackend;
  subtract(other: ProfileBackend): ProfileBackend;

  // ── 3D Conversions ──────────────────────────────────────────────
  extrude(
    height: number,
    divisions: number,
    twist: number,
    scaleTop?: [number, number],
    center?: boolean,
  ): ShapeBackend;
  revolve(segments: number, degrees: number): ShapeBackend;
}

export function isProfileBackend(value: unknown): value is ProfileBackend {
  return Boolean(
    value
    && typeof value === 'object'
    && (value as Record<PropertyKey, unknown>)[PROFILE_BACKEND_MARKER] === true,
  );
}

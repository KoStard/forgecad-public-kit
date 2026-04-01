/**
 * Manifold implementation of ProfileBackend.
 *
 * Wraps a manifold-3d CrossSection and delegates all operations to it.
 * This is the only place outside of `lower.ts` that should touch CrossSection.
 */
import type { CrossSection } from 'manifold-3d';
import { PROFILE_BACKEND_MARKER, type ProfileBackend, type ProfileBounds } from '../../profileBackend';
import type { ShapeBackend } from '../../shapeBackend';
import { wrapManifoldShapeBackend } from './shapeBackend';

export class ManifoldProfileBackend implements ProfileBackend {
  readonly [PROFILE_BACKEND_MARKER] = true as const;

  constructor(private readonly cs: CrossSection) {}

  // ── Queries ──────────────────────────────────────────────────────

  area(): number {
    return this.cs.area();
  }

  bounds(): ProfileBounds {
    return this.cs.bounds() as unknown as ProfileBounds;
  }

  isEmpty(): boolean {
    return this.cs.isEmpty();
  }

  numVert(): number {
    return this.cs.numVert();
  }

  toPolygons(): number[][][] {
    return this.cs.toPolygons() as number[][][];
  }

  // ── Transforms ───────────────────────────────────────────────────

  translate(x: number, y: number): ProfileBackend {
    return new ManifoldProfileBackend(this.cs.translate(x, y));
  }

  rotate(degrees: number): ProfileBackend {
    return new ManifoldProfileBackend(this.cs.rotate(degrees));
  }

  scale(v: number | [number, number]): ProfileBackend {
    return new ManifoldProfileBackend(this.cs.scale(v as any));
  }

  mirror(ax: [number, number]): ProfileBackend {
    return new ManifoldProfileBackend(this.cs.mirror(ax));
  }

  // ── 2D Operations ───────────────────────────────────────────────

  offset(delta: number, join: 'Square' | 'Round' | 'Miter'): ProfileBackend {
    return new ManifoldProfileBackend(this.cs.offset(delta, join));
  }

  simplify(epsilon: number): ProfileBackend {
    return new ManifoldProfileBackend(this.cs.simplify(epsilon));
  }

  warp(fn: (vert: [number, number]) => void): ProfileBackend {
    return new ManifoldProfileBackend(this.cs.warp(fn as any));
  }

  subtract(other: ProfileBackend): ProfileBackend {
    return new ManifoldProfileBackend(this.cs.subtract(requireManifoldCrossSection(other)));
  }

  // ── 3D Conversions ──────────────────────────────────────────────

  extrude(height: number, divisions: number, twist: number, scaleTop?: [number, number], center?: boolean): ShapeBackend {
    return wrapManifoldShapeBackend(this.cs.extrude(height, divisions, twist, scaleTop as any, center ?? false));
  }

  revolve(segments: number, degrees: number): ShapeBackend {
    return wrapManifoldShapeBackend(this.cs.revolve(segments, degrees));
  }

  /** Access the underlying CrossSection for Manifold-specific lowering code. */
  requireCrossSection(): CrossSection {
    return this.cs;
  }
}

/** Wrap a raw CrossSection as a ProfileBackend. */
export function wrapManifoldProfileBackend(cs: CrossSection): ProfileBackend {
  return new ManifoldProfileBackend(cs);
}

/** Unwrap a ProfileBackend to a CrossSection, asserting it's Manifold-backed. */
export function requireManifoldCrossSection(profile: ProfileBackend): CrossSection {
  if (profile instanceof ManifoldProfileBackend) {
    return profile.requireCrossSection();
  }
  throw new Error('requireManifoldCrossSection(): expected a ManifoldProfileBackend');
}

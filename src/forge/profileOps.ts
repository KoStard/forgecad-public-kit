/**
 * Backend-dispatched profile factory and batch operations.
 *
 * These functions create or combine ProfileBackend instances without
 * exposing any backend-specific types.  Sketch-layer code should use
 * these instead of reaching into `backends/manifold/` directly.
 */

import type { ProfileBackend } from './profileBackend';
import type { ProfileCompilePlan } from './compilePlan';
import { getWasm } from './backends/manifold/wasm';
import { wrapManifoldProfileBackend, requireManifoldCrossSection } from './backends/manifold/profileBackend';
import { lowerProfileCompilePlanToCrossSection } from './backends/manifold/lower';

// ── Factories ─────────────────────────────────────────────────────

export function createCircleProfile(radius: number, segments = 0): ProfileBackend {
  return wrapManifoldProfileBackend(getWasm().CrossSection.circle(radius, segments));
}

export function createSquareProfile(size: [number, number], center: boolean): ProfileBackend {
  return wrapManifoldProfileBackend(getWasm().CrossSection.square(size, center));
}

export function createPolygonProfile(loops: number[][][]): ProfileBackend {
  return wrapManifoldProfileBackend(new (getWasm().CrossSection)(loops as any));
}

export function createEmptyProfile(): ProfileBackend {
  const wasm = getWasm();
  const unit = wasm.CrossSection.square([1, 1], false);
  return wrapManifoldProfileBackend(wasm.CrossSection.difference([unit, unit]));
}

// ── Batch booleans / hull ─────────────────────────────────────────

export function profileUnion(profiles: ProfileBackend[]): ProfileBackend {
  return wrapManifoldProfileBackend(
    getWasm().CrossSection.union(profiles.map(requireManifoldCrossSection)),
  );
}

export function profileDifference(profiles: ProfileBackend[]): ProfileBackend {
  return wrapManifoldProfileBackend(
    getWasm().CrossSection.difference(profiles.map(requireManifoldCrossSection)),
  );
}

export function profileIntersection(profiles: ProfileBackend[]): ProfileBackend {
  return wrapManifoldProfileBackend(
    getWasm().CrossSection.intersection(profiles.map(requireManifoldCrossSection)),
  );
}

export function profileHull(profiles: ProfileBackend[]): ProfileBackend {
  return wrapManifoldProfileBackend(
    getWasm().CrossSection.hull(profiles.map(requireManifoldCrossSection)),
  );
}

// ── Compile plan lowering ─────────────────────────────────────────

export function lowerProfileCompilePlan(plan: ProfileCompilePlan): ProfileBackend {
  return wrapManifoldProfileBackend(
    lowerProfileCompilePlanToCrossSection(plan, getWasm()),
  );
}

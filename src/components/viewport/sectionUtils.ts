import type { CutPlaneDef } from '@forge/cutPlane';
import type { SceneObject } from '@forge/index';
import * as THREE from 'three';
import {
  SECTION_HATCH_MAX_LINE_WIDTH,
  SECTION_HATCH_MAX_SPACING,
  SECTION_HATCH_MIN_LINE_WIDTH,
  SECTION_HATCH_MIN_SPACING,
  SECTION_HATCH_SPACING_SCALE,
  SECTION_SURFACE_LIFT_MAX,
  SECTION_SURFACE_LIFT_MIN,
  SECTION_SURFACE_LIFT_SCALE,
} from './types';

/** Sentinel name for the interactive section-explorer plane (not script-defined). */
export const SECTION_EXPLORER_PLANE_NAME = '__section_explorer__';

// ---------------------------------------------------------------------------
// Section plane utility functions
// ---------------------------------------------------------------------------

/**
 * Resolve the surface lift distance based on the bounding box diagonal of a shape.
 * This prevents Z-fighting between the cut surface and the clipped geometry.
 */
export function resolveSectionSurfaceLift(shape: SceneObject['shape'] | undefined): number {
  if (!shape) return SECTION_SURFACE_LIFT_MIN;
  try {
    const bb = shape.boundingBox();
    const dx = bb.max[0] - bb.min[0];
    const dy = bb.max[1] - bb.min[1];
    const dz = bb.max[2] - bb.min[2];
    const diagonal = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return THREE.MathUtils.clamp(diagonal * SECTION_SURFACE_LIFT_SCALE, SECTION_SURFACE_LIFT_MIN, SECTION_SURFACE_LIFT_MAX);
  } catch {
    return SECTION_SURFACE_LIFT_MIN;
  }
}

/**
 * Compute hatch spacing and line width from the bounding box of a cut surface geometry.
 */
export function resolveSectionHatchMetrics(geometry: THREE.BufferGeometry): { spacing: number; lineWidth: number } {
  geometry.computeBoundingBox();
  const bounds = geometry.boundingBox;
  if (!bounds) {
    return {
      spacing: SECTION_HATCH_MIN_SPACING,
      lineWidth: SECTION_HATCH_MIN_LINE_WIDTH,
    };
  }
  const size = new THREE.Vector3();
  bounds.getSize(size);
  const span = Math.max(1, size.x, size.y);
  const spacing = THREE.MathUtils.clamp(span * SECTION_HATCH_SPACING_SCALE, SECTION_HATCH_MIN_SPACING, SECTION_HATCH_MAX_SPACING);
  return {
    spacing,
    lineWidth: THREE.MathUtils.clamp(spacing * 0.18, SECTION_HATCH_MIN_LINE_WIDTH, SECTION_HATCH_MAX_LINE_WIDTH),
  };
}

/**
 * Check whether a scene object is excluded from a given cut plane by name.
 */
export const isObjectExcludedFromCutPlane = (obj: SceneObject, cutPlane: CutPlaneDef): boolean => {
  const excludedNames = cutPlane.excludeObjectNames;
  if (!excludedNames || excludedNames.length === 0) return false;
  const objectName = obj.name.trim();
  if (!objectName) return false;
  return excludedNames.includes(objectName);
};

/**
 * Convert a CutPlaneDef to a THREE.Plane for use as a clipping plane.
 * The normal is negated so that geometry on the normal side is removed.
 */
export const toClippingPlane = (cp: CutPlaneDef): THREE.Plane => {
  const n = new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).normalize();
  // THREE.Plane convention: clips geometry on the positive side of the plane.
  // We negate the normal so that geometry on the normal side is removed.
  return new THREE.Plane(n.negate(), cp.offset);
};

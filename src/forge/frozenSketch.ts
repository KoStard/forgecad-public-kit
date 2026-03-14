/**
 * ForgeCAD — FrozenSketch / FrozenConstraintSketch
 *
 * Sketch subclasses that use pre-extracted polygon data transferred from the
 * eval worker. Extend real Sketch/ConstraintSketch so instanceof checks pass
 * and updateSketchConstraint continues to work on the main thread (via the
 * main-thread kernel that's also initialized for the loading screen).
 */

import type { CrossSection } from 'manifold-3d';
import { Sketch, setSketchPlacement3D } from './sketch/core';
import { ConstraintSketch } from './sketch/constraints';
import type { SketchConstraintMeta, ConstraintDefinition } from './sketch/constraints';
import type { SerializedSketchData } from '../workers/evalWorkerProtocol';

/**
 * Build a fake CrossSection that satisfies the Sketch constructor
 * using pre-computed polygon/bounds data.
 */
function makeFakeCrossSection(
  polygons: [number, number][][],
  bounds: { min: [number, number]; max: [number, number] },
): CrossSection {
  return {
    toPolygons: () => polygons,
    bounds: () => ({
      min: bounds.min,
      max: bounds.max,
    }),
    area: () => 0,
    isEmpty: () => polygons.length === 0,
    numVert: () => polygons.reduce((sum, poly) => sum + poly.length, 0),
  } as unknown as CrossSection;
}

/** A read-only Sketch backed by pre-extracted polygon data. */
export class FrozenSketch extends Sketch {
  constructor(data: SerializedSketchData) {
    super(makeFakeCrossSection(data.polygons, data.bounds), data.colorHex);
    if (data.worldMatrix) {
      setSketchPlacement3D(this, data.worldMatrix as Parameters<typeof setSketchPlacement3D>[1]);
    }
  }
}

/**
 * A ConstraintSketch backed by pre-extracted polygon + constraint data.
 * `updateSketchConstraint` in the store calls `updateConstraintValue(this, ...)`
 * which reads `this.definition` (pure data) and re-solves using the main-thread
 * kernel — producing a fresh live ConstraintSketch.
 */
export class FrozenConstraintSketch extends ConstraintSketch {
  constructor(data: SerializedSketchData & { constraintMeta: SketchConstraintMeta; constraintDefinition: ConstraintDefinition }) {
    super(
      makeFakeCrossSection(data.polygons, data.bounds),
      data.constraintMeta,
      data.constraintDefinition,
    );
    if (data.worldMatrix) {
      setSketchPlacement3D(this, data.worldMatrix as Parameters<typeof setSketchPlacement3D>[1]);
    }
  }
}

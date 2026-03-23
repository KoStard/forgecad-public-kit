/**
 * ForgeCAD — FrozenSketch / FrozenConstraintSketch
 *
 * Sketch subclasses that use pre-extracted polygon data transferred from the
 * eval worker. Extend real Sketch/ConstraintSketch so instanceof checks pass
 * and updateSketchConstraint continues to work on the main thread (via the
 * main-thread kernel that's also initialized for the loading screen).
 */

import { PROFILE_BACKEND_MARKER, type ProfileBackend, type ProfileBounds } from './profileBackend';
import type { ShapeBackend } from './shapeBackend';
import { Sketch, setSketchPlacement3D } from './sketch/core';
import { ConstraintSketch } from './sketch/constraints';
import type { SketchConstraintMeta, ConstraintDefinition } from './sketch/constraints';
import type { SerializedSketchData } from '../workers/evalWorkerProtocol';

function frozenError(method: string): never {
  throw new Error(`FrozenProfileBackend.${method}(): frozen sketches are read-only`);
}

/**
 * A read-only ProfileBackend backed by pre-computed polygon/bounds data.
 * Transform and operation methods throw — frozen sketches are for display only.
 */
class FrozenProfileBackend implements ProfileBackend {
  readonly [PROFILE_BACKEND_MARKER] = true as const;

  constructor(
    private readonly polygons: [number, number][][],
    private readonly _bounds: { min: [number, number]; max: [number, number] },
  ) {}

  toPolygons(): number[][][] { return this.polygons; }
  bounds(): ProfileBounds { return { min: this._bounds.min, max: this._bounds.max }; }
  area(): number { return 0; }
  isEmpty(): boolean { return this.polygons.length === 0; }
  numVert(): number { return this.polygons.reduce((sum, poly) => sum + poly.length, 0); }

  translate(): ProfileBackend { return frozenError('translate'); }
  rotate(): ProfileBackend { return frozenError('rotate'); }
  scale(): ProfileBackend { return frozenError('scale'); }
  mirror(): ProfileBackend { return frozenError('mirror'); }
  offset(): ProfileBackend { return frozenError('offset'); }
  simplify(): ProfileBackend { return frozenError('simplify'); }
  warp(): ProfileBackend { return frozenError('warp'); }
  subtract(): ProfileBackend { return frozenError('subtract'); }
  extrude(): ShapeBackend { return frozenError('extrude'); }
  revolve(): ShapeBackend { return frozenError('revolve'); }
}

function makeFrozenProfileBackend(
  polygons: [number, number][][],
  bounds: { min: [number, number]; max: [number, number] },
): ProfileBackend {
  return new FrozenProfileBackend(polygons, bounds);
}

/** A read-only Sketch backed by pre-extracted polygon data. */
export class FrozenSketch extends Sketch {
  constructor(data: SerializedSketchData) {
    super(makeFrozenProfileBackend(data.polygons, data.bounds), data.colorHex);
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
      makeFrozenProfileBackend(data.polygons, data.bounds),
      data.constraintMeta,
      data.constraintDefinition,
    );
    if (data.worldMatrix) {
      setSketchPlacement3D(this, data.worldMatrix as Parameters<typeof setSketchPlacement3D>[1]);
    }
  }
}

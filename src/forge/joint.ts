/**
 * ForgeCAD Joint System
 *
 * Declarative joints that auto-create parameters and apply rotation/translation.
 * A joint wraps the common pattern of "rotate this part around an axis at a pivot".
 */

import { Shape } from './kernel';
import { param } from './params';

export interface RevoluteJointOpts {
  axis?: [number, number, number];
  min?: number;
  max?: number;
  default?: number;
  unit?: string;
  reverse?: boolean;
}

/**
 * Create a revolute (hinge) joint. Auto-creates a param slider and rotates the shape.
 *
 * @param name - Display name for the angle parameter
 * @param shape - The shape to rotate
 * @param pivot - The pivot point [x, y, z]
 * @param opts - Joint options (axis, min/max angle, default)
 * @returns The rotated shape
 */
export function joint(
  name: string,
  shape: Shape,
  pivot: [number, number, number],
  opts: RevoluteJointOpts = {},
): Shape {
  const axis = opts.axis ?? [0, 0, 1];
  const min = opts.min ?? 0;
  const max = opts.max ?? 180;
  const def = opts.default ?? 0;
  const angle = param(name, def, { min, max, unit: opts.unit ?? '°', reverse: opts.reverse });
  return shape.rotateAround(axis, angle, pivot);
}

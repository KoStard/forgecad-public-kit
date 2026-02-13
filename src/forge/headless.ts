/**
 * ForgeCAD Headless Entry Point — Single Source of Truth
 *
 * This module re-exports the complete forge API and works in both
 * Node.js (CLI tools) and browser contexts.
 *
 * Browser: imports via src/forge/index.ts which re-exports from here.
 * CLI:     imports directly from this file.
 *
 * Usage:
 *   import { init, runScript, Sketch, Shape, ... } from '../src/forge/headless';
 *   await init();
 *   const result = runScript(code, fileName, allFiles);
 *   // result.objects contains Shape/Sketch results
 */

import { initKernel } from './kernel';

// Re-export everything from the public API
export { Shape, box, cylinder, sphere, union, difference, intersection, hull3d, levelSet, getWasm } from './kernel';
export type { Anchor3D } from './kernel';
export { intersectWithPlane, projectToPlane } from './section';
export type { PlaneSpec } from './section';
export * from './sketch';
export { param, resetParams, getCollectedParams, setParamOverrides } from './params';
export type { ParamDef } from './params';
export { joint } from './joint';
export type { RevoluteJointOpts } from './joint';
export { runScript } from './runner';
export type { RunResult, SceneObject, LogEntry } from './runner';
export { partLibrary } from './library';
export { shapeToGeometry } from './meshToGeometry';
export { buildScene, CAD_MATERIAL_PROPS, EDGE_MATERIAL_PROPS } from './sceneBuilder';
export type { ForgeGeometry } from './meshToGeometry';
export { ShapeGroup, group } from './group';
export { cutPlane, resetCutPlanes, getCollectedCutPlanes } from './cutPlane';
export type { CutPlaneDef } from './cutPlane';

/**
 * Initialize the geometry kernel. Must be called once before using any forge API.
 * Safe to call multiple times (idempotent).
 */
export async function init() {
  await initKernel();
}

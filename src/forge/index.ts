/**
 * ForgeCAD — Browser Entry Point
 *
 * Re-exports everything from the headless module (the single source of truth)
 * plus the browser-specific initKernel for the App bootstrap.
 */

export { initKernel } from './kernel';
export {
  Shape, box, cylinder, sphere, union, difference, intersection, hull3d, levelSet, getWasm,
  intersectWithPlane, projectToPlane,
  param, resetParams, getCollectedParams, setParamOverrides,
  runScript,
  partLibrary,
  shapeToGeometry,
  buildScene,
  init,
} from './headless';
export type { PlaneSpec } from './headless';
export type { ParamDef } from './headless';
export type { RunResult, SceneObject } from './headless';
export type { ForgeGeometry } from './headless';
export * from './sketch';

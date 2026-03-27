import {
  assemblyExample,
  type ExampleManifestEntry,
  type NonPartValidationExpectations,
  notebookExample,
  runtimeSceneExample,
  sketchExample,
} from './types';

type NonPartEntry = {
  path: string;
  note: string;
  expect?: NonPartValidationExpectations;
};

const ASSEMBLY_ENTRIES: readonly NonPartEntry[] = [
  {
    path: 'examples/api/assembly-gear-coupling.forge.js',
    note: 'Assemblies are in the architecture-phase gate through runtime solve and scene emission, not exact part-routing parity.',
  },
  {
    path: 'examples/api/assembly-mechanism.forge.js',
    note: 'Assemblies are in the architecture-phase gate through runtime solve and scene emission, not exact part-routing parity.',
    expect: { minUniqueGroups: 1 },
  },
  {
    path: 'examples/api/import-assembly.forge.js',
    note: 'Assemblies are in the architecture-phase gate through runtime solve and scene emission, not exact part-routing parity.',
  },
  {
    path: 'examples/api/import-assembly-merge.forge.js',
    note: 'Assemblies are in the architecture-phase gate through runtime solve and scene emission, not exact part-routing parity.',
  },
  {
    path: 'examples/api/import-assembly-placed.forge.js',
    note: 'Assemblies are in the architecture-phase gate through runtime solve and scene emission, not exact part-routing parity.',
  },
  {
    path: 'examples/api/runtime-joints-view.forge.js',
    note: 'Assemblies are in the architecture-phase gate through runtime solve and scene emission, not exact part-routing parity.',
    expect: { minJoints: 3, minAnimations: 1 },
  },
  {
    path: 'examples/api/sdf-rover-demo.forge.js',
    note: 'Assemblies are in the architecture-phase gate through runtime solve and scene emission, not exact part-routing parity.',
    expect: {
      minUniqueGroups: 1,
      requireRobotExport: true,
      minRobotParts: 5,
      minRobotJoints: 4,
    },
  },
] as const;

const RUNTIME_SCENE_ENTRIES: readonly NonPartEntry[] = [
  {
    path: 'examples/api/scene-basics.forge.js',
    note: 'Scene API demo — judged by runtime scene behavior (camera, lights, post-processing).',
  },
  {
    path: 'examples/generative-art/crystal-growth.forge.js',
    note: 'Generative art — judged by runtime scene behavior and multi-object output.',
  },
  {
    path: 'examples/generative-art/frost-spires.forge.js',
    note: 'Generative art — demonstrates per-object material properties (opacity, clearcoat, emissive).',
  },
  {
    path: 'examples/generative-art/golden-spiral-tower.forge.js',
    note: 'Generative art — golden ratio spiral with scene control.',
  },
  {
    path: 'examples/generative-art/molten-forge.forge.js',
    note: 'Generative art — demonstrates per-object material properties (metalness, emissive glow).',
  },
  {
    path: 'examples/generative-art/neon-coral.forge.js',
    note: 'Generative art — multi-object coral colony with dramatic lighting.',
  },
  {
    path: 'examples/api/bill-of-materials.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
    expect: { minBomEntries: 3 },
  },
  {
    path: 'examples/api/bounding-box-visualizer.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
  },
  {
    path: 'examples/api/exploded-view.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
    expect: { minUniqueGroups: 2, minCutPlanes: 1 },
  },
  {
    path: 'examples/api/gears-bevel-face-joints.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
    expect: { minJoints: 4, minAnimations: 1 },
  },
  {
    path: 'examples/api/highlight-debug.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
  },
  {
    path: 'examples/api/geometry-info.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
  },
  {
    path: 'examples/api/group-test.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
    expect: { minUniqueGroups: 3 },
  },
  {
    path: 'examples/api/section-plane-visualization.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
    expect: { minCutPlanes: 2 },
  },
  {
    path: 'examples/cut-plane-demo.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
    expect: { minCutPlanes: 2 },
  },
  {
    path: 'examples/fillet-curved-edges.forge.js',
    note: 'Fillet showcase — mixed exact/faceted objects, no export parity assertion.',
  },
  {
    path: 'examples/fillet-enclosure.forge.js',
    note: 'Fillet showcase — mixed exact/faceted objects, no export parity assertion.',
  },
  {
    path: 'examples/fillet-showcase.forge.js',
    note: 'Fillet showcase — mixed exact/faceted objects, no export parity assertion.',
  },
  {
    path: 'examples/door-with-hinges.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
  },
  {
    path: 'examples/robot_hand_2.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
    expect: { minUniqueGroups: 5 },
  },
  {
    path: 'examples/shoe-rack-doors.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
  },
  {
    path: 'examples/sketch-regions.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
  },
  {
    path: 'examples/toolbox/bolted-joint.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
  },
] as const;

const SKETCH_ENTRIES: readonly NonPartEntry[] = [
  {
    path: 'examples/api/sketch-rounding-strategies.forge.js',
    note: 'Sketch-only examples validate through the sketch export path instead of scene routing.',
    expect: { minSketchObjects: 5 },
  },
  {
    path: 'examples/lamp-shade.forge.js',
    note: 'Sketch-only examples validate through the sketch export path instead of scene routing.',
  },
] as const;

const NOTEBOOK_ENTRIES: readonly NonPartEntry[] = [
  {
    path: 'examples/api/notebook-assembly-debug.forge-notebook.json',
    note: 'Notebook examples validate through the preview-cell path used by the CLI entrypoints.',
  },
  {
    path: 'examples/api/notebook-iteration.forge-notebook.json',
    note: 'Notebook examples validate through the preview-cell path used by the CLI entrypoints.',
    expect: { minCutPlanes: 1 },
  },
] as const;

export const NON_PART_EXAMPLE_MANIFEST: ExampleManifestEntry[] = [
  ...ASSEMBLY_ENTRIES.map((entry) => assemblyExample(entry.path, entry.note, entry.expect)),
  ...RUNTIME_SCENE_ENTRIES.map((entry) => runtimeSceneExample(entry.path, entry.note, entry.expect)),
  ...SKETCH_ENTRIES.map((entry) => sketchExample(entry.path, entry.note, entry.expect)),
  ...NOTEBOOK_ENTRIES.map((entry) => notebookExample(entry.path, entry.note, entry.expect)),
];

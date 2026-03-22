import {
  assemblyExample,
  notebookExample,
  runtimeSceneExample,
  sketchExample,
  type ExampleManifestEntry,
  type NonPartValidationExpectations,
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
    path: 'examples/api/geometry-info.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
  },
  {
    path: 'examples/api/group-test.forge.js',
    note: 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.',
    expect: { minUniqueGroups: 3 },
  },
  {
    path: 'examples/api/import-group-assembly.forge.js',
    note: 'Multipart importGroup() demo: validates group import, child access, and param overrides at runtime.',
    expect: { minUniqueGroups: 1 },
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
] as const;

const SKETCH_ENTRIES: readonly NonPartEntry[] = [
  {
    path: 'examples/frame.forge.js',
    note: 'Sketch-only examples validate through the sketch export path instead of scene routing.',
  },
  {
    path: 'examples/api/sketch-rounding-strategies.forge.js',
    note: 'Sketch-only examples validate through the sketch export path instead of scene routing.',
    expect: { minSketchObjects: 5 },
  },
  {
    path: 'examples/headphone-hanger-profile.forge.js',
    note: 'Sketch-only examples validate through the sketch export path instead of scene routing.',
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

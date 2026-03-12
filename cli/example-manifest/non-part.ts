import {
  assemblyExample,
  notebookExample,
  runtimeSceneExample,
  sketchExample,
  type ExampleManifestEntry,
} from './types';

const ASSEMBLY_PATHS = [
  'examples/api/assembly-gear-coupling.forge.js',
  'examples/api/assembly-mechanism.forge.js',
  'examples/api/runtime-joints-view.forge.js',
  'examples/api/sdf-rover-demo.forge.js',
] as const;

const RUNTIME_SCENE_PATHS = [
  'examples/api/bill-of-materials.forge.js',
  'examples/api/bounding-box-visualizer.forge.js',
  'examples/api/exploded-view.forge.js',
  'examples/api/gears-bevel-face-joints.forge.js',
  'examples/api/geometry-info.forge.js',
  'examples/api/group-test.forge.js',
  'examples/api/section-plane-visualization.forge.js',
  'examples/cut-plane-demo.forge.js',
  'examples/door-with-hinges.forge.js',
  'examples/robot_hand_2.forge.js',
  'examples/shoe-rack-doors.forge.js',
] as const;

const SKETCH_PATHS = [
  'examples/frame.sketch.js',
  'examples/api/sketch-rounding-strategies.forge.js',
  'examples/headphone-hanger-profile.sketch.js',
  'examples/lamp-shade.sketch.js',
] as const;

const NOTEBOOK_PATHS = [
  'examples/api/notebook-assembly-debug.forge-notebook.json',
  'examples/api/notebook-iteration.forge-notebook.json',
] as const;

export const NON_PART_EXAMPLE_MANIFEST: ExampleManifestEntry[] = [
  ...ASSEMBLY_PATHS.map((path) =>
    assemblyExample(path, 'Assemblies are in the architecture-phase gate through runtime solve and scene emission, not exact part-routing parity.'),
  ),
  ...RUNTIME_SCENE_PATHS.map((path) =>
    runtimeSceneExample(path, 'This example is judged by runtime scene behavior rather than by exact part-lowering parity.'),
  ),
  ...SKETCH_PATHS.map((path) =>
    sketchExample(path, 'Sketch-only examples validate through the sketch export path instead of scene routing.'),
  ),
  ...NOTEBOOK_PATHS.map((path) =>
    notebookExample(path, 'Notebook examples validate through the preview-cell path used by the CLI entrypoints.'),
  ),
];

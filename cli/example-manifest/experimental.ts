import { type ExampleManifestEntry, experimentalExample } from './types';

export const EXPERIMENTAL_EXAMPLE_MANIFEST: ExampleManifestEntry[] = [
  experimentalExample(
    'examples/sandbox.forge.js',
    'The sandbox file is intentionally fenced off from architecture claims until we decide whether it remains part of the maintained example surface.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/test-colors.forge.js',
    'This file is a color-behavior probe rather than a maintained architecture-phase example, so it stays behind the temporary experimental fence.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/api/curves-surfacing-basics.forge.js',
    'Uses loft/sweep geometry outside the current API surface. Needs rewrite to use supported methods.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/api/elbow-test.forge.js',
    'Uses .transform() with a non-rigid matrix from the elbow helper, which now throws at runtime.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/api/import-assembly-source.forge.js',
    'Source file for assembly import demos — not runnable standalone, only used as an import target.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/api/constrained-sketch-basics.forge.js',
    'Returns a ConstraintSketch (not a Sketch/Shape), needs a dedicated constraint-sketch validator.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/api/constrained-sketch-mechanical.forge.js',
    'Returns a ConstraintSketch (not a Sketch/Shape), needs a dedicated constraint-sketch validator.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/api/import-group-assembly.forge.js',
    'Has a duplicate variable declaration at runtime. Needs fix before re-entering the maintained surface.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/mesh-import-slats.forge.js',
    'Mesh import example depends on external STL asset and is not part of the maintained architecture-phase surface.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/gcode/parametric-vase.forge.js',
    'G-code toolpath demo: returns GCodeBuilder, needs dedicated gcode validator.',
    'gcode-export-mvp',
  ),
  experimentalExample(
    'examples/gcode/spiral-tower.forge.js',
    'G-code toolpath demo: returns GCodeBuilder, needs dedicated gcode validator.',
    'gcode-export-mvp',
  ),
  experimentalExample(
    'examples/gcode/math-surface.forge.js',
    'G-code toolpath demo: returns GCodeBuilder, needs dedicated gcode validator.',
    'gcode-export-mvp',
  ),
  experimentalExample(
    'examples/gcode/lissajous-vase.forge.js',
    'G-code toolpath demo: returns GCodeBuilder, needs dedicated gcode validator.',
    'gcode-export-mvp',
  ),
  experimentalExample(
    'examples/api/benchy-style-hull.forge.js',
    'Uses loft/sweep hull geometry outside the current exact-export subset. Needs validation once loft is in the exact route.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/api/sketch-on-face-demo.forge.js',
    'Demo of .onFace() workflow; needs manifest classification once onFace API is part of the maintained surface.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/face-ops-test.forge.js',
    'Integration test for pocket/boss/faceProfile — temporary test model, not a maintained architecture example.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  experimentalExample(
    'examples/face-query-test.forge.js',
    'Integration test for FaceQuery API — query-based face selection on complex models.',
    'tasks/280-example-gap-recovery-and-legacy-fence.md',
  ),
  ...Array.from({ length: 13 }, (_, i) => {
    const num = String(i + 1).padStart(2, '0');
    const names = [
      'fully-constrained-rect',
      'underconstrained-triangle',
      'redundant-constraints',
      'conflicting-constraints',
      'parallel-with-linedistance',
      'complex-spectrogram',
      'perpendicular-chain',
      'symmetric-bracket',
      'stress-spiral',
      'stress-honeycomb',
      'surface-grid',
      'surface-nested',
      'surface-complex',
    ];
    return experimentalExample(
      `examples/constraints/${num}-${names[i]}.forge.js`,
      'Constraint sketch example returns a ConstraintSketch, needs a dedicated validator.',
      'tasks/280-example-gap-recovery-and-legacy-fence.md',
    );
  }),
];

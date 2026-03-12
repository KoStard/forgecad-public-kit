import {
  exactRoute,
  facetedRoute,
  holdoutRoute,
  partExample,
  type ExampleManifestEntry,
} from './types';

const API_PART_HOLDOUT = holdoutRoute(
  'API part examples are inventory-covered now, but their route expectations are deferred to the focused migration wave.',
  'tasks/250-api-and-corpus-example-migration.md',
  'Runtime execution is guarded here; exact versus faceted route commitments land in task 250.',
);

const API_PART_PATHS = [
  'examples/api/attachTo-basics.forge.js',
  'examples/api/boolean-operations.forge.js',
  'examples/api/center-true-vs-false.forge.js',
  'examples/api/clone-duplicate.forge.js',
  'examples/api/colors-union-vs-array.forge.js',
  'examples/api/coordinate-system.forge.js',
  'examples/api/curves-surfacing-basics.forge.js',
  'examples/api/dimensioned-bracket.forge.js',
  'examples/api/elbow-test.forge.js',
  'examples/api/extrude-options.forge.js',
  'examples/api/face-gears.forge.js',
  'examples/api/feature-created-faces.forge.js',
  'examples/api/gears-tier1.forge.js',
  'examples/api/group-vs-union.forge.js',
  'examples/api/import-args-unit.forge.js',
  'examples/api/import-args.forge.js',
  'examples/api/import-dimensions-follow.forge.js',
  'examples/api/import-placement-references.forge.js',
  'examples/api/import-placement-widget-source.forge.js',
  'examples/api/import-relative-paths.forge.js',
  'examples/api/import-svg-sketch.forge.js',
  'examples/api/js-module-imports.forge.js',
  'examples/api/patterns.forge.js',
  'examples/api/pointAlong-orientation.forge.js',
  'examples/api/profile-2020-b-slot6.forge.js',
  'examples/api/rotate-around-to.forge.js',
  'examples/api/sketch-basics.forge.js',
  'examples/api/sketch-on-face.forge.js',
  'examples/api/spatial-recipes.forge.js',
] as const;

const COMPILER_CORPUS_PATHS = [
  'examples/compiler-corpus/edge-finished-mount.forge.js',
  'examples/compiler-corpus/enclosure-shell-cuts.forge.js',
  'examples/compiler-corpus/fastener-plate-variants.forge.js',
  'examples/compiler-corpus/motor-mount-plate.forge.js',
  'examples/compiler-corpus/projection-relay-cover.forge.js',
  'examples/compiler-corpus/sensor-bracket.forge.js',
  'examples/compiler-corpus/service-panel-cover.forge.js',
  'examples/compiler-corpus/trimmed-access-cover.forge.js',
] as const;

export const API_AND_CORPUS_EXAMPLE_MANIFEST: ExampleManifestEntry[] = [
  ...API_PART_PATHS.map((path) => partExample('api-parts', path, API_PART_HOLDOUT)),
  partExample(
    'api-parts',
    'examples/api/benchy-style-hull.forge.js',
    facetedRoute(
      'Hull-heavy geometry still falls outside the exact CadQuery/OCCT subset, so this example is expected to require allow-faceted export.',
      'The runtime path stays valid; the architecture gate only expects the faceted route here.',
    ),
    undefined,
    ['Hull'],
  ),
  partExample(
    'api-parts',
    'examples/api/brep-exportable.forge.js',
    exactRoute('This is the public exact-exportable demo and should stay inside the exact route.'),
  ),
  ...COMPILER_CORPUS_PATHS.map((path) =>
    partExample(
      'compiler-corpus',
      path,
      exactRoute('The compiler corpus is the defended ordinary-part exact subset and must stay exact.'),
    ),
  ),
];

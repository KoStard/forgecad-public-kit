import {
  exactRoute,
  facetedRoute,
  partExample,
  type ExampleManifestEntry,
} from './types';

const API_EXACT_PART_PATHS = [
  'examples/api/attachTo-basics.forge.js',
  'examples/api/boolean-operations.forge.js',
  'examples/api/center-true-vs-false.forge.js',
  'examples/api/clone-duplicate.forge.js',
  'examples/api/colors-union-vs-array.forge.js',
  'examples/api/coordinate-system.forge.js',
  'examples/api/dimensioned-bracket.forge.js',
  'examples/api/face-transformation-history.forge.js',
  'examples/api/feature-created-faces.forge.js',
  'examples/api/folded-service-panel-cover.forge.js',
  'examples/api/group-vs-union.forge.js',
  'examples/api/import-args-unit.forge.js',
  'examples/api/import-args.forge.js',
  'examples/api/import-dimensions-follow.forge.js',
  'examples/api/import-group-source.forge.js',
  'examples/api/import-placement-references.forge.js',
  'examples/api/import-placement-widget-source.forge.js',
  'examples/api/import-relative-paths.forge.js',
  'examples/api/import-svg-sketch.forge.js',
  'examples/api/js-module-imports.forge.js',
  'examples/api/patterns.forge.js',
  'examples/api/pointAlong-orientation.forge.js',
  'examples/api/rotate-around-to.forge.js',
  'examples/api/sketch-basics.forge.js',
  'examples/api/sketch-on-face.forge.js',
  'examples/api/text2d-basics.forge.js',
  'examples/api/text2d-font.forge.js',
  'examples/api/extrude-options.forge.js',
  'examples/api/verification-demo.forge.js',
] as const;

const API_FACETED_PARTS = [
  {
    path: 'examples/api/face-gears.forge.js',
    blocker: 'Face-gear and perpendicular gear helpers still rely on sampled tooth/profile geometry outside the exact export subset.',
    note: 'The example should keep succeeding through the faceted route with explicit diagnostics.',
  },
  {
    path: 'examples/api/profile-2020-b-slot6.forge.js',
    blocker: 'The direct 3D profile helper still lowers through segmented profile geometry, so the extrusion must stay on the faceted route for now.',
    note: 'The sketch half of the example remains exact-capable; the 3D helper is the intentional blocker.',
  },
] as const;

const API_RECOVERED_FACETED_PARTS = [
  {
    path: 'examples/api/gears-tier1.forge.js',
    blocker: 'The spur and ring gear helpers still lower through segmented circle profile geometry outside the exact CadQuery/OCCT subset, so those gears intentionally stay on the faceted route.',
    note: 'The rack gear already stays exact; this contract scopes the route claim to the three gear solids that still require faceted fallback.',
    primaryShapes: ['Spur Pinion', 'Spur Gear', 'Ring Gear'],
  },
] as const;

const COMPILER_CORPUS_PATHS = [
  'examples/compiler-corpus/edge-finished-mount.forge.js',
  'examples/compiler-corpus/enclosure-shell-cuts.forge.js',
  'examples/compiler-corpus/fastener-plate-variants.forge.js',
  'examples/compiler-corpus/folded-service-panel-cover.forge.js',
  'examples/compiler-corpus/motor-mount-plate.forge.js',
  'examples/compiler-corpus/post-rewrite-edge-finish.forge.js',
  'examples/compiler-corpus/projection-face-target.forge.js',
  'examples/compiler-corpus/projection-relay-cover.forge.js',
  'examples/compiler-corpus/sensor-bracket.forge.js',
  'examples/compiler-corpus/service-panel-cover.forge.js',
  'examples/compiler-corpus/shell-box-side-opening.forge.js',
  'examples/compiler-corpus/trimmed-access-cover.forge.js',
] as const;

export const API_AND_CORPUS_EXAMPLE_MANIFEST: ExampleManifestEntry[] = [
  ...API_EXACT_PART_PATHS.map((path) =>
    partExample('api-parts', path, exactRoute('This API example now stays inside the defended exact-route subset.')),
  ),
  ...API_FACETED_PARTS.map((entry) =>
    partExample('api-parts', entry.path, facetedRoute(entry.blocker, entry.note), undefined, entry.primaryShapes),
  ),
  ...API_RECOVERED_FACETED_PARTS.map((entry) =>
    partExample('api-parts', entry.path, facetedRoute(entry.blocker, entry.note), undefined, entry.primaryShapes),
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
  partExample(
    'compiler-corpus',
    'examples/compiler-corpus/edge-query-demo.forge.js',
    facetedRoute(
      'The chamfered-union and pipe shapes use hull/runtime geometry outside the exact subset.',
      'Most shapes stay exact; this contract scopes the faceted claim to the hull-dependent solids.',
    ),
    undefined,
    ['Chamfered Union', 'Pipe (16 edges)'],
  ),
];

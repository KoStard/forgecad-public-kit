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
  'examples/api/feature-created-faces.forge.js',
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
  'examples/api/rotate-around-to.forge.js',
  'examples/api/sketch-basics.forge.js',
  'examples/api/sketch-on-face.forge.js',
  'examples/api/spatial-recipes.forge.js',
] as const;

const API_FACETED_PARTS = [
  {
    path: 'examples/api/benchy-style-hull.forge.js',
    blocker: 'The lofted/smoothed hull still lacks an exact compile plan, so the primary hull solid intentionally relies on allow-faceted export.',
    note: 'The cabin and chimney stay exact; the route contract focuses on the hull body.',
    primaryShapes: ['Hull'],
  },
  {
    path: 'examples/api/curves-surfacing-basics.forge.js',
    blocker: 'This surfacing demo still depends on loft/sweep geometry outside the exact CadQuery/OCCT subset, so the bottle scene is intentionally faceted.',
    note: 'The example remains part of the maintained API surface, but only through the faceted route today.',
  },
  {
    path: 'examples/api/elbow-test.forge.js',
    blocker: 'The shared elbow helper still emits runtime geometry without an exact compile plan, so these elbow variants must use allow-faceted export.',
    note: 'Keep the helper runtime-covered here while its exact replay story catches up.',
  },
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
    path: 'examples/api/extrude-options.forge.js',
    blocker: 'Twisted extrude replay still lacks exact compile intent, so the twist-driven variants intentionally stay on the faceted route.',
    note: 'The plain, tapered, and centered variants still stay exact; this contract scopes the route claim to the two twist-owned solids in the gallery.',
    primaryShapes: ['Twisted', 'Twist + Taper'],
  },
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
  'examples/compiler-corpus/motor-mount-plate.forge.js',
  'examples/compiler-corpus/projection-relay-cover.forge.js',
  'examples/compiler-corpus/sensor-bracket.forge.js',
  'examples/compiler-corpus/service-panel-cover.forge.js',
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
];

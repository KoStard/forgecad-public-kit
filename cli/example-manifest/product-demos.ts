import {
  exactRoute,
  facetedRoute,
  holdoutRoute,
  partExample,
  type ExampleManifestEntry,
} from './types';

const PRODUCT_DEMO_HOLDOUT_TASK = 'tasks/280-example-gap-recovery-and-legacy-fence.md';
const DEFAULT_EXACT_NOTE = 'This product demo now stays inside the defended exact-route subset.';

const FIVE_FIGEN_FINGER_COMPONENTS = [
  'Prox',
  'Mid',
  'Tip',
  'Pad 1',
  'Pad 2',
  'Pad 3',
  'Tendon 1',
  'Tendon 2',
  'Tendon 3',
  'Pin Base',
  'Pin Mid',
  'Pin Tip',
  'Yoke',
] as const;

const FIVE_FIGEN_PRIMARY_SHAPES = [
  'Palm',
  'Palm Grip',
  'Knuckle Bar',
  'Wrist',
  'Motor',
  'Spool',
  ...['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].flatMap((finger) =>
    FIVE_FIGEN_FINGER_COMPONENTS.map((component) => `${finger} ${component}`),
  ),
] as const;

const THREE_D_PRINTER_PRIMARY_SHAPES = [
  'Frame',
  'Spool Supports',
  'PSU',
  'Control Board',
  'Display',
  'Z Rails',
  'Lead Screws',
  'Z Motors',
  'Z Bearings',
  'Lead Nuts',
  'Bed Plate',
  'Glass Surface',
  'Bed Carriage',
  'Leveling Springs',
  'Y Rails',
  'Y Carriages',
  'X Rail',
  'X Beam',
  'XY Belts',
  'XY Motors',
  'XY Idlers',
  'Nozzle',
  'Heater Block',
  'Heatbreak',
  'Heatsink',
  'Extruder Carriage',
  'Part Fan',
  'Extruder Motor',
  'Spool Rod',
  'Filament Roll',
  'Spool Hub',
  'Spool Shell',
  'Build Volume',
] as const;

const PRODUCT_DEMO_EXACT_PARTS = [
  {
    path: 'examples/3d-printer.forge.js',
    note: 'The defended contract covers the printer hardware and spool assembly; the Bowden guide tube remains runtime-covered helper geometry until pipeRoute records exact compile intent.',
    primaryShapes: THREE_D_PRINTER_PRIMARY_SHAPES,
  },
  {
    path: 'examples/5-figen-robot-hand.forge.js',
    note: 'The structural hand solids stay exact; the stylized tendon cable routes remain runtime-covered helper geometry until pipeRoute records exact compile intent.',
    primaryShapes: FIVE_FIGEN_PRIMARY_SHAPES,
  },
  'examples/ac-unit-glm47.forge.js',
  'examples/ac-unit-glm5.forge.js',
  'examples/ac-unit-kimi25.forge.js',
  'examples/ac-unit-minimax.forge.js',
  'examples/ac-unit.forge.js',
  'examples/adjustable-table.forge.js',
  'examples/bathroom.forge.js',
  'examples/bolt-pattern.forge.js',
  'examples/bottle.forge.js',
  'examples/chair.forge.js',
  'examples/classical-piano.forge.js',
  'examples/clock.forge.js',
  'examples/cup.forge.js',
  'examples/headphone-hanger-v2.forge.js',
  'examples/headphone-hanger.forge.js',
  'examples/iphone-stand.forge.js',
  'examples/kitchen.forge.js',
  'examples/laptop.forge.js',
  'examples/liquid-soap-dispenser.forge.js',
  'examples/modern-tv.forge.js',
  'examples/picture-frame.forge.js',
  'examples/robot_hand.forge.js',
  'examples/shelf/container.forge.js',
  'examples/shelf/shelf-unit.forge.js',
  'examples/shoe-rack.forge.js',
  'examples/spiderman-cake.forge.js',
  'examples/table-lamp.forge.js',
  'examples/table.forge.js',
  'examples/tv-stand.forge.js',
] as const;

const PRODUCT_DEMO_FACETED_PARTS = [
  {
    path: 'examples/bolt-and-nut.forge.js',
    blocker: 'The threaded fastener helpers still rely on helical/twist runtime geometry and segmented thread authoring outside the current exact subset, so the fastener pair intentionally stays on the faceted route.',
    note: 'Keep the public fastener demo maintained through allow-faceted while exact replay for those thread helpers catches up.',
  },
  {
    path: 'examples/iphone.forge.js',
    blocker: 'The rounded-body workflow still depends on smoothOut/refine runtime geometry without defended exact compile intent, so the phone model must stay on the faceted route today.',
    note: 'The example remains active, but its polished runtime smoothing is not yet an exact-exportable contract.',
  },
] as const;

const PRODUCT_DEMO_HOLDOUT_PARTS = [
  {
    path: 'examples/chess-set.forge.js',
    blocker: 'The knight pieces still depend on shape-hull construction while the board and the rest of the set stay exact, so one exact or faceted contract would misrepresent this mixed-route scene.',
    note: 'Keep the set runtime-covered until the knight body can move inside the exact subset or the scene is split by route intent.',
  },
] as const;

export const PRODUCT_DEMO_EXAMPLE_MANIFEST: ExampleManifestEntry[] = [
  ...PRODUCT_DEMO_EXACT_PARTS.map((entry) => {
    if (typeof entry === 'string') {
      return partExample('product-demos', entry, exactRoute(DEFAULT_EXACT_NOTE));
    }
    return partExample('product-demos', entry.path, exactRoute(entry.note), undefined, entry.primaryShapes);
  }),
  ...PRODUCT_DEMO_FACETED_PARTS.map((entry) =>
    partExample('product-demos', entry.path, facetedRoute(entry.blocker, entry.note)),
  ),
  ...PRODUCT_DEMO_HOLDOUT_PARTS.map((entry) =>
    partExample('product-demos', entry.path, holdoutRoute(entry.blocker, PRODUCT_DEMO_HOLDOUT_TASK, entry.note)),
  ),
];

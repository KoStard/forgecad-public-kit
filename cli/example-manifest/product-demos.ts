import {
  exactRoute,
  facetedRoute,
  partExample,
  type ExampleManifestEntry,
} from './types';

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
  'examples/adjustable-table.forge.js',
  'examples/airplane-propeller.forge.js',
  'examples/bathroom.forge.js',
  'examples/bolt-pattern.forge.js',
  'examples/bottle.forge.js',
  'examples/chair.forge.js',
  'examples/chess-set.forge.js',
  'examples/classical-piano.forge.js',
  'examples/clock.forge.js',
  'examples/cup.forge.js',
  'examples/headphone-hanger-v2.forge.js',
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
] as const;

const PRODUCT_DEMO_FACETED_PARTS = [] as const;

const PRODUCT_DEMO_RECOVERED_FACETED_PARTS = [
  {
    path: 'examples/bolt-and-nut.forge.js',
    blocker: 'The nut shape still depends on thread geometry outside the exact subset.',
    note: 'The bolt now stays exact; this contract scopes the faceted claim to the nut.',
    primaryShapes: ['Nut'],
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
  ...PRODUCT_DEMO_RECOVERED_FACETED_PARTS.map((entry) =>
    partExample('product-demos', entry.path, facetedRoute(entry.blocker, entry.note), undefined, entry.primaryShapes),
  ),
];

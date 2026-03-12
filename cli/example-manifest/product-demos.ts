import {
  holdoutRoute,
  partExample,
  type ExampleManifestEntry,
} from './types';

const PRODUCT_DEMO_HOLDOUT = holdoutRoute(
  'Product-demo route expectations are intentionally fenced until the dedicated migration wave reviews them example by example.',
  'tasks/260-product-demo-example-migration.md',
  'These demos still have to execute successfully now; exact versus faceted commitments are deferred to task 260.',
);

const PRODUCT_DEMO_PART_PATHS = [
  'examples/3d-printer.forge.js',
  'examples/5-figen-robot-hand.forge.js',
  'examples/ac-unit-glm47.forge.js',
  'examples/ac-unit-glm5.forge.js',
  'examples/ac-unit-kimi25.forge.js',
  'examples/ac-unit-minimax.forge.js',
  'examples/ac-unit.forge.js',
  'examples/adjustable-table.forge.js',
  'examples/bathroom.forge.js',
  'examples/bolt-and-nut.forge.js',
  'examples/bolt-pattern.forge.js',
  'examples/bottle.forge.js',
  'examples/chair.forge.js',
  'examples/chess-set.forge.js',
  'examples/classical-piano.forge.js',
  'examples/clock.forge.js',
  'examples/cup.forge.js',
  'examples/headphone-hanger-v2.forge.js',
  'examples/headphone-hanger.forge.js',
  'examples/iphone-stand.forge.js',
  'examples/iphone.forge.js',
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

export const PRODUCT_DEMO_EXAMPLE_MANIFEST: ExampleManifestEntry[] = PRODUCT_DEMO_PART_PATHS.map((path) =>
  partExample('product-demos', path, PRODUCT_DEMO_HOLDOUT),
);

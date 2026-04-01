/**
 * All files from examples/ baked into the bundle at build time via Vite glob.
 * Used as the default project in web/playground mode.
 *
 * Vite resolves the glob at build time — new example files are picked up
 * automatically without any manual changes here.
 */
const rawExamples = import.meta.glob('/examples/**/*.{forge.js,sketch.js,js,svg,forge-notebook.json}', {
  eager: true,
  query: '?raw',
  import: 'default',
});

export const EXAMPLE_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(rawExamples)
    // Strip leading '/' → 'examples/foo.forge.js'
    .map(([vitePath, content]) => [vitePath.slice(1), content as string]),
);

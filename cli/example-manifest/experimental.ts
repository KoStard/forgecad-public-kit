import { experimentalExample, type ExampleManifestEntry } from './types';

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
];

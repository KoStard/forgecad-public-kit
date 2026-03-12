export type ExampleManifestFamily =
  | 'api-parts'
  | 'compiler-corpus'
  | 'product-demos'
  | 'non-part'
  | 'experimental';

export type ExampleValidationClass =
  | 'part'
  | 'assembly'
  | 'runtime-scene'
  | 'sketch'
  | 'notebook'
  | 'experimental';

export type ExampleValidationPath =
  | 'part-runtime'
  | 'assembly-runtime'
  | 'runtime-scene'
  | 'sketch-svg'
  | 'notebook-preview'
  | 'experimental-runtime';

export type PartRouteExpectation =
  | {
      kind: 'exact';
      note?: string;
    }
  | {
      kind: 'faceted';
      blocker: string;
      note?: string;
    }
  | {
      kind: 'holdout';
      blocker: string;
      taskRef: string;
      note?: string;
    };

interface ExampleManifestEntryBase {
  path: string;
  family: ExampleManifestFamily;
  class: ExampleValidationClass;
  validation: ExampleValidationPath;
  note?: string;
}

export interface PartExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'part';
  validation: 'part-runtime';
  route: PartRouteExpectation;
  primaryShapes?: readonly string[];
}

export interface AssemblyExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'assembly';
  validation: 'assembly-runtime';
}

export interface RuntimeSceneExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'runtime-scene';
  validation: 'runtime-scene';
}

export interface SketchExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'sketch';
  validation: 'sketch-svg';
}

export interface NotebookExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'notebook';
  validation: 'notebook-preview';
}

export interface ExperimentalExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'experimental';
  validation: 'experimental-runtime';
  blocker: string;
  taskRef: string;
}

export type ExampleManifestEntry =
  | PartExampleManifestEntry
  | AssemblyExampleManifestEntry
  | RuntimeSceneExampleManifestEntry
  | SketchExampleManifestEntry
  | NotebookExampleManifestEntry
  | ExperimentalExampleManifestEntry;

export function exactRoute(note?: string): PartRouteExpectation {
  return { kind: 'exact', note };
}

export function facetedRoute(blocker: string, note?: string): PartRouteExpectation {
  return { kind: 'faceted', blocker, note };
}

export function holdoutRoute(blocker: string, taskRef: string, note?: string): PartRouteExpectation {
  return { kind: 'holdout', blocker, taskRef, note };
}

export function partExample(
  family: Extract<ExampleManifestFamily, 'api-parts' | 'compiler-corpus' | 'product-demos'>,
  path: string,
  route: PartRouteExpectation,
  note?: string,
  primaryShapes?: readonly string[],
): PartExampleManifestEntry {
  return {
    path,
    family,
    class: 'part',
    validation: 'part-runtime',
    route,
    primaryShapes,
    note,
  };
}

export function assemblyExample(path: string, note?: string): AssemblyExampleManifestEntry {
  return {
    path,
    family: 'non-part',
    class: 'assembly',
    validation: 'assembly-runtime',
    note,
  };
}

export function runtimeSceneExample(path: string, note?: string): RuntimeSceneExampleManifestEntry {
  return {
    path,
    family: 'non-part',
    class: 'runtime-scene',
    validation: 'runtime-scene',
    note,
  };
}

export function sketchExample(path: string, note?: string): SketchExampleManifestEntry {
  return {
    path,
    family: 'non-part',
    class: 'sketch',
    validation: 'sketch-svg',
    note,
  };
}

export function notebookExample(path: string, note?: string): NotebookExampleManifestEntry {
  return {
    path,
    family: 'non-part',
    class: 'notebook',
    validation: 'notebook-preview',
    note,
  };
}

export function experimentalExample(
  path: string,
  blocker: string,
  taskRef: string,
  note?: string,
): ExperimentalExampleManifestEntry {
  return {
    path,
    family: 'experimental',
    class: 'experimental',
    validation: 'experimental-runtime',
    blocker,
    taskRef,
    note,
  };
}

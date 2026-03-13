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

export interface NonPartValidationExpectations {
  minObjectCount?: number;
  minShapeObjects?: number;
  minSketchObjects?: number;
  minUniqueGroups?: number;
  minBomEntries?: number;
  minCutPlanes?: number;
  minJoints?: number;
  minAnimations?: number;
  requireRobotExport?: boolean;
  minRobotParts?: number;
  minRobotJoints?: number;
}

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
  expect?: NonPartValidationExpectations;
}

export interface RuntimeSceneExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'runtime-scene';
  validation: 'runtime-scene';
  expect?: NonPartValidationExpectations;
}

export interface SketchExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'sketch';
  validation: 'sketch-svg';
  expect?: NonPartValidationExpectations;
}

export interface NotebookExampleManifestEntry extends ExampleManifestEntryBase {
  class: 'notebook';
  validation: 'notebook-preview';
  expect?: NonPartValidationExpectations;
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

export function assemblyExample(
  path: string,
  note?: string,
  expect?: NonPartValidationExpectations,
): AssemblyExampleManifestEntry {
  return {
    path,
    family: 'non-part',
    class: 'assembly',
    validation: 'assembly-runtime',
    note,
    expect,
  };
}

export function runtimeSceneExample(
  path: string,
  note?: string,
  expect?: NonPartValidationExpectations,
): RuntimeSceneExampleManifestEntry {
  return {
    path,
    family: 'non-part',
    class: 'runtime-scene',
    validation: 'runtime-scene',
    note,
    expect,
  };
}

export function sketchExample(
  path: string,
  note?: string,
  expect?: NonPartValidationExpectations,
): SketchExampleManifestEntry {
  return {
    path,
    family: 'non-part',
    class: 'sketch',
    validation: 'sketch-svg',
    note,
    expect,
  };
}

export function notebookExample(
  path: string,
  note?: string,
  expect?: NonPartValidationExpectations,
): NotebookExampleManifestEntry {
  return {
    path,
    family: 'non-part',
    class: 'notebook',
    validation: 'notebook-preview',
    note,
    expect,
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

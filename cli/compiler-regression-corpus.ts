import { resolvePackagePath } from './package-runtime';

export interface CompilerRegressionCorpusPart {
  id: string;
  name: string;
  description: string;
  guards: string[];
  scriptPath: string;
  objectName: string;
  expectedObjectCount?: number;
}

function corpusScriptPath(fileName: string): string {
  return resolvePackagePath(import.meta.url, 'examples', 'compiler-corpus', fileName);
}

export const COMPILER_REGRESSION_CORPUS: CompilerRegressionCorpusPart[] = [
  {
    id: 'corpus-enclosure-shell-cuts',
    name: 'Enclosure Shell Cuts',
    description:
      'An enclosure-style part keeps shell, semantic workplane cuts, mirrored feet, and boolean routing aligned across both lowerers.',
    guards: [
      'shell() exact lowering stays reviewable inside a normal enclosure workflow',
      'workplane-driven cuts preserve compiler-owned placement provenance',
      'mirrored repeated feet remain exact-exportable after later booleans',
    ],
    scriptPath: corpusScriptPath('enclosure-shell-cuts.forge.js'),
    objectName: 'Enclosure Shell Cuts',
  },
  {
    id: 'corpus-motor-mount-plate',
    name: 'Motor Mount Plate',
    description:
      'A motor mount plate keeps circular-pattern counterbored holes, mirrored ears, and multi-stage boolean cuts exact-exportable as an ordinary mechanical part.',
    guards: [
      'circularPattern() stays aligned with exact export instead of degrading into ad hoc transforms',
      'analytic counterbore cutters remain replayable through the compiler-owned exact subset',
      'mirrored tabs and center pockets keep boolean lowering deterministic',
    ],
    scriptPath: corpusScriptPath('motor-mount-plate.forge.js'),
    objectName: 'Motor Mount Plate',
  },
  {
    id: 'corpus-edge-finished-mount',
    name: 'Edge Finished Mount',
    description:
      'A finished mounting block keeps propagated edge-finish queries, mirrored add-ons, and downstream face-driven edits aligned across both lowerers.',
    guards: [
      'a preserved propagated edge can drive a later chamfer after an ordinary union instead of dropping back to mesh-only behavior',
      'mirrored additive features stay exact-exportable while the selected propagated edge remains one defended lineage',
      'downstream hole/cutout features can still target the original tracked body owner after edge finishing',
      'ordinary additive/subtractive edits remain exact-exportable after the broadened edge-finish subset lands',
    ],
    scriptPath: corpusScriptPath('edge-finished-mount.forge.js'),
    objectName: 'Edge Finished Mount',
  },
  {
    id: 'corpus-fastener-plate-variants',
    name: 'Fastener Plate Variants',
    description:
      'A service plate keeps compiler-owned counterbores, countersinks, and up-to-face pockets aligned across both lowerers.',
    guards: [
      'counterbore and countersink holes stay compiler-owned instead of falling back to manual cutter booleans',
      'upToFace hole/cut extents remain exact-exportable through the shared semantic feature family',
      'ordinary mechanical fastener layouts keep defended created-face/query semantics visible after multiple feature rewrites',
    ],
    scriptPath: corpusScriptPath('fastener-plate-variants.forge.js'),
    objectName: 'Fastener Plate Variants',
  },
  {
    id: 'corpus-sensor-bracket',
    name: 'Sensor Bracket',
    description:
      'A bracket with mirrored ribs, face-mounted cuts, and repeated indicator holes keeps downstream feature chains stable through both lowerers.',
    guards: [
      'mirrorCopy() reinforcements preserve exact transform intent inside a larger boolean tree',
      'onFace() cuts on an upright wall keep workplane placement semantics visible to exact export',
      'repeated front-face detail cuts stay deterministic after counterbored base-hole booleans',
    ],
    scriptPath: corpusScriptPath('sensor-bracket.forge.js'),
    objectName: 'Sensor Bracket',
  },
  {
    id: 'corpus-projection-relay-cover',
    name: 'Projection Relay Cover',
    description:
      'A relay-cover style plate projects a repeated top-edge boss chain back into a downstream lip feature, keeping projection replay and boolean target queries aligned across both lowerers.',
    guards: [
      'projectToPlane() can replay a compatible union-of-patterned descendants instead of only a single placed extrusion',
      'projection-driven downstream lips keep exact/export parity after the projected source body already went through supported union and repetition flows',
      'the downstream workplane target can still use defended face-query lineage instead of anonymous placement heuristics',
    ],
    scriptPath: corpusScriptPath('projection-relay-cover.forge.js'),
    objectName: 'Projection Relay Cover',
  },
  {
    id: 'corpus-service-panel-cover',
    name: 'Service Panel Cover',
    description:
      'A service-panel cover keeps repeated bosses, richer hole/cut details, and projection-driven gasket geometry aligned across both lowerers.',
    guards: [
      'patterned additive bosses remain compiler-owned before later richer hole/cut rewrites land on the same part',
      'counterbores, countersinks, and a face-driven service pocket stay exact-exportable in one ordinary cover workflow',
      'projection replay stays exact on a hole/cut/union source instead of only on a toy badge or single-body silhouette',
    ],
    scriptPath: corpusScriptPath('service-panel-cover.forge.js'),
    objectName: 'Service Panel Cover',
  },
  {
    id: 'corpus-folded-service-panel-cover',
    name: 'Folded Service Panel Cover',
    description:
      'A compiler-owned sheet-metal cover keeps panel/flange/bend semantics aligned while one model lowers to both folded and flat exact outputs.',
    guards: [
      'sheetMetal() stays compiler-owned instead of becoming a backend-local export trick',
      'panel and flange cutouts preserve named descendant-region semantics after the downstream cut rewrites land',
      'folded bends stay explicit face sets while the flat pattern keeps the same semantic regions reviewable from the shared model',
    ],
    scriptPath: corpusScriptPath('folded-service-panel-cover.forge.js'),
    objectName: 'Folded Service Panel Cover',
    expectedObjectCount: 2,
  },
  {
    id: 'corpus-trimmed-access-cover',
    name: 'Trimmed Access Cover',
    description:
      'A trimmed access cover keeps plane-cap trim ownership, upstream hole/cut rewrites, and later union edits reviewable across both lowerers.',
    guards: [
      'trimByPlane() exact lowering stays reviewable inside a normal access-cover workflow',
      'upstream hole/cut created faces still surface explicit rewrite semantics before the trim boundary lands',
      'later latch-union edits remain deterministic after the trim-created plane cap enters the part history',
    ],
    scriptPath: corpusScriptPath('trimmed-access-cover.forge.js'),
    objectName: 'Trimmed Access Cover',
  },
  {
    id: 'corpus-projection-face-target',
    name: 'Projection Face Target',
    description:
      'A shelled body keeps face-to-plane projection provenance when the target plane is a defended descendant region instead of a hardcoded coordinate plane.',
    guards: [
      'projectToPlane(shape, { face: shape.face(name) }) keeps targetFaceQuery provenance in the compile plan so downstream features can explain which surface they originated from',
      'projection onto a defended inner-bottom shell descendant stays exact-capable under the same parallel-plane replay rules as coordinate-plane targets',
      'downstream gasket and mount-pad features placed on the same defended descendant face remain exact-exportable after the face-to-plane projection step',
    ],
    scriptPath: corpusScriptPath('projection-face-target.forge.js'),
    objectName: 'Projection Face Target',
  },
];

export function getCompilerRegressionCorpusPart(id: string): CompilerRegressionCorpusPart {
  const part = COMPILER_REGRESSION_CORPUS.find((entry) => entry.id === id);
  if (!part) {
    throw new Error(`Unknown compiler regression corpus part: ${id}`);
  }
  return part;
}

import { resolvePackagePath } from './package-runtime';

export interface CompilerRegressionCorpusPart {
  id: string;
  name: string;
  description: string;
  guards: string[];
  scriptPath: string;
  objectName: string;
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
];

export function getCompilerRegressionCorpusPart(id: string): CompilerRegressionCorpusPart {
  const part = COMPILER_REGRESSION_CORPUS.find((entry) => entry.id === id);
  if (!part) {
    throw new Error(`Unknown compiler regression corpus part: ${id}`);
  }
  return part;
}

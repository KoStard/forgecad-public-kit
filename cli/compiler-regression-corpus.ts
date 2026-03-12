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
      'A filleted mounting block keeps tracked-edge finishing, downstream face-driven edits, and a normal boolean cut chain aligned across both lowerers.',
    guards: [
      'tracked-edge fillet intent stays visible to both lowerers instead of collapsing back to mesh-only geometry',
      'downstream hole/cutout features can still target the original tracked body owner after edge finishing',
      'ordinary additive/subtractive edits remain exact-exportable after the edge-finish feature lands',
    ],
    scriptPath: corpusScriptPath('edge-finished-mount.forge.js'),
    objectName: 'Edge Finished Mount',
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

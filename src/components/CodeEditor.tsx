import { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { useForgeStore } from '../store/forgeStore';

const FORGE_TYPES = `
declare function box(x: number, y: number, z: number, center?: boolean): Shape;
declare function cylinder(height: number, radius: number, radiusTop?: number, segments?: number, center?: boolean): Shape;
declare function sphere(radius: number, segments?: number): Shape;
declare function union(...shapes: Shape[]): Shape;
declare function difference(...shapes: Shape[]): Shape;
declare function intersection(...shapes: Shape[]): Shape;
declare function param(name: string, defaultValue: number, opts?: { min?: number; max?: number; step?: number; unit?: string }): number;

// --- Cross-file imports ---
/** Import a 2D sketch from another file. The file must return a Sketch. */
declare function importSketch(fileName: string): Sketch;
/** Import a 3D part from another file. The file must return a Shape. */
declare function importPart(fileName: string): Shape;

// --- 2D Sketch Primitives ---
declare function rect(width: number, height: number, center?: boolean): Sketch;
declare function circle2d(radius: number, segments?: number): Sketch;
declare function roundedRect(width: number, height: number, radius: number, center?: boolean): Sketch;
declare function polygon(points: [number, number][]): Sketch;
declare function ngon(sides: number, radius: number): Sketch;
declare function ellipse(rx: number, ry: number, segments?: number): Sketch;
declare function slot(length: number, width: number): Sketch;
declare function star(points: number, outerR: number, innerR: number): Sketch;
declare function union2d(...sketches: Sketch[]): Sketch;
declare function difference2d(...sketches: Sketch[]): Sketch;
declare function intersection2d(...sketches: Sketch[]): Sketch;
declare function hull2d(...sketches: Sketch[]): Sketch;
declare function constrainedSketch(): ConstrainedSketchBuilder;

declare class Shape {
  translate(x: number, y: number, z: number): Shape;
  rotate(x: number, y: number, z: number): Shape;
  scale(v: number | [number, number, number]): Shape;
  mirror(normal: [number, number, number]): Shape;
  add(other: Shape): Shape;
  subtract(other: Shape): Shape;
  intersect(other: Shape): Shape;
}

declare class Sketch {
  translate(x: number, y?: number): Sketch;
  rotate(degrees: number): Sketch;
  scale(v: number | [number, number]): Sketch;
  mirror(ax: [number, number]): Sketch;
  add(other: Sketch): Sketch;
  subtract(other: Sketch): Sketch;
  intersect(other: Sketch): Sketch;
  offset(delta: number, join?: 'Square' | 'Round' | 'Miter'): Sketch;
  hull(): Sketch;
  simplify(epsilon?: number): Sketch;
  warp(fn: (vert: [number, number]) => void): Sketch;
  extrude(height: number, opts?: { twist?: number; divisions?: number; scaleTop?: number | [number, number]; center?: boolean }): Shape;
  revolve(degrees?: number, segments?: number): Shape;
  area(): number;
  bounds(): { min: [number, number]; max: [number, number] };
  isEmpty(): boolean;
  numVert(): number;
}

declare class ConstraintSketch extends Sketch {
  constraintMeta: {
    status: 'under' | 'fully' | 'over';
  };
}

declare class ConstrainedSketchBuilder {
  moveTo(x: number, y: number): ConstrainedSketchBuilder;
  lineTo(x: number, y: number): ConstrainedSketchBuilder;
  lineH(dx: number): ConstrainedSketchBuilder;
  lineV(dy: number): ConstrainedSketchBuilder;
  lineAngled(length: number, degrees: number): ConstrainedSketchBuilder;
  close(): ConstrainedSketchBuilder;
  point(x: number, y: number, fixed?: boolean): string;
  pointAt(index: number): string;
  line(a: string, b: string, construction?: boolean): string;
  lineAt(index: number): string;
  circle(center: string, radius: number, construction?: boolean, segments?: number): string;
  circleAt(index: number): string;
  addLoopCircle(center: string, radius: number, segments?: number): ConstrainedSketchBuilder;
  constrain(constraint: { type: string; [key: string]: unknown }): ConstrainedSketchBuilder;
  solve(options?: { iterations?: number; tolerance?: number }): ConstraintSketch;
}

declare const lib: {
  boltHole(diameter: number, depth: number): Shape;
  counterbore(holeDia: number, boreDia: number, boreDepth: number, totalDepth: number): Shape;
  tube(outerX: number, outerY: number, outerZ: number, wall: number): Shape;
  pipe(height: number, outerRadius: number, wall: number, segments?: number): Shape;
  hexNut(acrossFlats: number, height: number, holeDia: number): Shape;
  roundedBox(x: number, y: number, z: number, radius: number): Shape;
  bracket(width: number, height: number, depth: number, thick: number, holeDia?: number): Shape;
  holePattern(rows: number, cols: number, spacingX: number, spacingY: number, holeDia: number, depth: number): Shape;
};
`;

export function CodeEditor() {
  const files = useForgeStore((s) => s.files);
  const activeFile = useForgeStore((s) => s.activeFile);
  const updateFileCode = useForgeStore((s) => s.updateFileCode);
  const execute = useForgeStore((s) => s.execute);
  const result = useForgeStore((s) => s.result);
  const loadFromText = useForgeStore((s) => s.loadFromText);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const code = files[activeFile] ?? '';

  const handleMount: OnMount = (editor, monaco) => {
    monaco.languages.typescript.javascriptDefaults.addExtraLib(FORGE_TYPES, 'forge.d.ts');
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      useForgeStore.getState().saveFile();
    });
  };

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!value) return;
      updateFileCode(activeFile, value);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => execute(), 400);
    },
    [activeFile, updateFileCode, execute],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      file.text().then((text) => loadFromText(text, file.name));
    },
    [loadFromText],
  );

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          key={activeFile}
          defaultLanguage="javascript"
          theme="vs-dark"
          value={code}
          onChange={handleChange}
          onMount={handleMount}
          options={{
            fontSize: 14,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            wordWrap: 'on',
          }}
        />
      </div>
      {result?.error && (
        <div style={{ padding: '8px 12px', background: '#3a1d1d', color: '#f48771', fontSize: 13, fontFamily: 'monospace', maxHeight: 80, overflow: 'auto' }}>
          {result.error}
        </div>
      )}
      {result && !result.error && (
        <div style={{ padding: '4px 12px', background: '#1a2a1a', color: '#6a9955', fontSize: 12, fontFamily: 'monospace' }}>
          ✓ {result.timeMs.toFixed(1)}ms
        </div>
      )}
    </div>
  );
}

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

declare class Shape {
  translate(x: number, y: number, z: number): Shape;
  rotate(x: number, y: number, z: number): Shape;
  scale(v: number | [number, number, number]): Shape;
  mirror(normal: [number, number, number]): Shape;
  add(other: Shape): Shape;
  subtract(other: Shape): Shape;
  intersect(other: Shape): Shape;
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
  const code = useForgeStore((s) => s.code);
  const setCode = useForgeStore((s) => s.setCode);
  const execute = useForgeStore((s) => s.execute);
  const result = useForgeStore((s) => s.result);
  const fileName = useForgeStore((s) => s.fileName);
  const dirty = useForgeStore((s) => s.dirty);
  const loadFromText = useForgeStore((s) => s.loadFromText);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleMount: OnMount = (editor, monaco) => {
    monaco.languages.typescript.javascriptDefaults.addExtraLib(FORGE_TYPES, 'forge.d.ts');
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    // Ctrl+S / Cmd+S to save
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      useForgeStore.getState().saveFile();
    });
  };

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!value) return;
      setCode(value);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => execute(), 400);
    },
    [setCode, execute],
  );

  // Drag-and-drop file loading
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file) return;
      file.text().then((text) => loadFromText(text, file.name));
    },
    [loadFromText],
  );

  useEffect(() => { execute(); }, [execute]);

  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
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

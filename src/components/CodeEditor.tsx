import { useRef, useCallback, useEffect } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import type * as Monaco from 'monaco-editor';
import { useForgeStore } from '../store/forgeStore';
import FORGE_TYPES from '../forge/forge-api.d.ts?raw';

export function CodeEditor() {
  const files = useForgeStore((s) => s.files);
  const activeFile = useForgeStore((s) => s.activeFile);
  const updateFileCode = useForgeStore((s) => s.updateFileCode);
  const execute = useForgeStore((s) => s.execute);
  const result = useForgeStore((s) => s.result);
  const isEvaluating = useForgeStore((s) => s.isEvaluating);
  const loadFromText = useForgeStore((s) => s.loadFromText);
  const theme = useForgeStore((s) => s.theme);
  const saveFile = useForgeStore((s) => s.saveFile);
  const pauseAutoEval = useForgeStore((s) => s.pauseAutoEval);
  const editorNavigate = useForgeStore((s) => s.editorNavigate);
  const clearEditorNavigate = useForgeStore((s) => s.clearEditorNavigate);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const code = files[activeFile] ?? '';

  // Clear pending save timer when switching files so we don't auto-save stale content
  useEffect(() => () => clearTimeout(saveTimerRef.current), [activeFile]);

  // Navigate to a source line when requested (e.g. clicking a failing verify check)
  useEffect(() => {
    if (!editorNavigate || !editorRef.current) return;
    const editor = editorRef.current;
    const { line } = editorNavigate;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
    clearEditorNavigate();
  }, [editorNavigate, clearEditorNavigate]);

  const handleMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.languages.typescript.javascriptDefaults.addExtraLib(FORGE_TYPES, 'forge.d.ts');
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });

    // Register custom themes so editor colors match the app theme
    monaco.editor.defineTheme('forge-gruvbox', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '928374', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'fb4934' },
        { token: 'string', foreground: 'b8bb26' },
        { token: 'number', foreground: 'd3869b' },
        { token: 'type', foreground: '83a598' },
        { token: 'identifier', foreground: 'ebdbb2' },
      ],
      colors: {
        'editor.background': '#282828',
        'editor.foreground': '#ebdbb2',
        'editor.lineHighlightBackground': '#32302f',
        'editorCursor.foreground': '#fe8019',
        'editor.selectionBackground': '#504945',
        'editor.inactiveSelectionBackground': '#3c3836',
        'editorLineNumber.foreground': '#665c54',
        'editorLineNumber.activeForeground': '#a89984',
        'editorIndentGuide.background1': '#3c3836',
        'editorWidget.background': '#1d2021',
        'editorWidget.border': '#504945',
        'input.background': '#1d2021',
        'input.foreground': '#ebdbb2',
        'input.border': '#504945',
        'scrollbarSlider.background': '#504945aa',
        'scrollbarSlider.hoverBackground': '#665c54aa',
      },
    });

    monaco.editor.defineTheme('forge-tokyo-night', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'bb9af7' },
        { token: 'string', foreground: '9ece6a' },
        { token: 'number', foreground: 'ff9e64' },
        { token: 'type', foreground: '7aa2f7' },
        { token: 'identifier', foreground: 'c0caf5' },
      ],
      colors: {
        'editor.background': '#1a1b26',
        'editor.foreground': '#c0caf5',
        'editor.lineHighlightBackground': '#1f2335',
        'editorCursor.foreground': '#7aa2f7',
        'editor.selectionBackground': '#33467c',
        'editor.inactiveSelectionBackground': '#292e42',
        'editorLineNumber.foreground': '#3b4261',
        'editorLineNumber.activeForeground': '#737aa2',
        'editorIndentGuide.background1': '#292e42',
        'editorWidget.background': '#16161e',
        'editorWidget.border': '#292e42',
        'input.background': '#16161e',
        'input.foreground': '#c0caf5',
        'input.border': '#292e42',
        'scrollbarSlider.background': '#292e42aa',
        'scrollbarSlider.hoverBackground': '#33467caa',
      },
    });

    monaco.editor.defineTheme('forge-kanagawa-lotus', {
      base: 'vs',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '8a8980', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'c84053' },
        { token: 'string', foreground: '6f894e' },
        { token: 'number', foreground: 'd27e99' },
        { token: 'type', foreground: '4d699b' },
        { token: 'identifier', foreground: '545464' },
      ],
      colors: {
        'editor.background': '#f2ecbc',
        'editor.foreground': '#545464',
        'editor.lineHighlightBackground': '#e7dba0',
        'editorCursor.foreground': '#c84053',
        'editor.selectionBackground': '#c9b97a',
        'editor.inactiveSelectionBackground': '#d9d08e',
        'editorLineNumber.foreground': '#a8a070',
        'editorLineNumber.activeForeground': '#766b6b',
        'editorIndentGuide.background1': '#e0daa0',
        'editorWidget.background': '#f7f3d7',
        'editorWidget.border': '#d7d194',
        'input.background': '#f7f3d7',
        'input.foreground': '#545464',
        'input.border': '#d7d194',
        'scrollbarSlider.background': '#d7d194aa',
        'scrollbarSlider.hoverBackground': '#c9b97aaa',
      },
    });

    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      useForgeStore.getState().saveFile();
    });

    // Free Cmd+K so it reaches the window-level FileSwitcher handler
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      useForgeStore.getState().openFileSwitcher();
    });

    // Cmd+Enter — always trigger a build (useful in manual mode)
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => {
      useForgeStore.getState().execute();
    });
  };

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (!value) return;
      updateFileCode(activeFile, value);
      clearTimeout(timerRef.current);
      if (!pauseAutoEval) {
        timerRef.current = setTimeout(() => execute(), 400);
      }
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => saveFile(), 1500);
    },
    [activeFile, updateFileCode, execute, saveFile, pauseAutoEval],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length === 0) return;
      droppedFiles.forEach((file) => {
        file.text().then((text) => loadFromText(text, file.name));
      });
    },
    [loadFromText],
  );

  return (
    <div
      data-fc-editor-surface="monaco"
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div style={{ flex: 1, minHeight: 0 }}>
        <Editor
          key={activeFile}
          defaultLanguage="javascript"
          theme={
            theme === 'gruvbox' ? 'forge-gruvbox'
            : theme === 'tokyo-night' ? 'forge-tokyo-night'
            : theme === 'kanagawa-lotus' ? 'forge-kanagawa-lotus'
            : theme === 'light' ? 'light'
            : 'vs-dark'
          }
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
        <div style={{ padding: '8px 12px', background: 'var(--fc-errorBg)', color: 'var(--fc-error)', fontSize: 13, fontFamily: 'monospace', maxHeight: 80, overflow: 'auto' }}>
          {result.error}
        </div>
      )}
      {result && !result.error && !isEvaluating && (() => {
        const failCount = result.verifications?.filter((v) => v.status === 'fail').length ?? 0;
        return (
          <div style={{
            padding: '4px 12px',
            background: failCount > 0 ? 'var(--fc-warningBg, rgba(230,168,23,0.12))' : 'var(--fc-successBg)',
            color: failCount > 0 ? 'var(--fc-warning, #e6a817)' : 'var(--fc-success)',
            fontSize: 12,
            fontFamily: 'monospace',
            display: 'flex',
            gap: 10,
            alignItems: 'center',
          }}>
            <span>✓ {result.timeMs.toFixed(1)}ms</span>
            {failCount > 0 && (
              <span>⚠ {failCount} check{failCount !== 1 ? 's' : ''} failed</span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

/**
 * Lightweight mobile code editor — plain textarea with monospace font.
 * No Monaco, no syntax highlighting. Sufficient for viewing/tweaking params.
 */
import { useCallback } from 'react';
import { useForgeStore } from '../store/forgeStore';

export function MobileCodeEditor() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const files = useForgeStore((s) => s.files);
  const updateFileCode = useForgeStore((s) => s.updateFileCode);
  const code = files[activeFile] ?? '';

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (activeFile) {
        updateFileCode(activeFile, e.target.value);
      }
    },
    [activeFile, updateFileCode],
  );

  return (
    <textarea
      className="fc-mobile-editor"
      value={code}
      onChange={handleChange}
      spellCheck={false}
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      placeholder="// No file selected"
      data-gramm="false"
    />
  );
}

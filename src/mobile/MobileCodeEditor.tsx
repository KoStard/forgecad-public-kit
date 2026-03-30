/**
 * Mobile code editor with syntax highlighting.
 *
 * Uses a transparent <textarea> overlaid on a highlight.js-rendered <pre>.
 * The user types into the textarea; the pre behind it shows coloured tokens.
 */
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import { useCallback, useMemo, useRef } from 'react';
import { useForgeStore } from '../store/forgeStore';

hljs.registerLanguage('javascript', javascript);

export function MobileCodeEditor() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const files = useForgeStore((s) => s.files);
  const updateFileCode = useForgeStore((s) => s.updateFileCode);
  const code = files[activeFile] ?? '';
  const preRef = useRef<HTMLPreElement>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (activeFile) {
        updateFileCode(activeFile, e.target.value);
      }
    },
    [activeFile, updateFileCode],
  );

  const handleScroll = useCallback((e: React.UIEvent<HTMLTextAreaElement>) => {
    if (preRef.current) {
      preRef.current.scrollTop = e.currentTarget.scrollTop;
      preRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  const highlighted = useMemo(() => {
    if (!code) return '';
    return hljs.highlight(code, { language: 'javascript' }).value;
  }, [code]);

  return (
    <div className="fc-mobile-editor-wrap">
      <pre
        ref={preRef}
        className="fc-mobile-editor-highlight"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: renders trusted syntax-highlighted code
        dangerouslySetInnerHTML={{ __html: highlighted + '\n' }}
      />
      <textarea
        className="fc-mobile-editor"
        value={code}
        onChange={handleChange}
        onScroll={handleScroll}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        placeholder="// No file selected"
        data-gramm="false"
      />
    </div>
  );
}

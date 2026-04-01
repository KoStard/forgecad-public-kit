/**
 * Mobile file picker — bottom sheet with flat file list.
 * No drag-drop, no multi-select, no folder creation. Just tap to open.
 */
import { useForgeStore } from '../store/forgeStore';

interface Props {
  onClose: () => void;
}

export function MobileFilePicker({ onClose }: Props) {
  const files = useForgeStore((s) => s.files);
  const activeFile = useForgeStore((s) => s.activeFile);
  const setActiveFile = useForgeStore((s) => s.setActiveFile);

  const fileNames = Object.keys(files).sort((a, b) => a.localeCompare(b));

  const handleSelect = (name: string) => {
    setActiveFile(name);
    onClose();
  };

  return (
    <div className="fc-mobile-filepicker-overlay" onClick={onClose}>
      <div className="fc-mobile-filepicker-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="fc-mobile-filepicker-header">
          <span>Files</span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--fc-accent)', fontSize: 14, cursor: 'pointer', padding: '4px 8px' }}
          >
            Done
          </button>
        </div>
        {fileNames.map((name) => (
          <button
            key={name}
            className="fc-mobile-filepicker-item"
            data-active={name === activeFile ? 'true' : undefined}
            onClick={() => handleSelect(name)}
          >
            <span style={{ opacity: 0.6, fontSize: 16 }}>
              {name.endsWith('.forge.js') || name.endsWith('.sketch.js') ? '\u{1F4C4}' : '\u{1F4C3}'}
            </span>
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
          </button>
        ))}
        {fileNames.length === 0 && (
          <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--fc-textMuted)', fontSize: 13 }}>No files</div>
        )}
      </div>
    </div>
  );
}

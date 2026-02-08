import { useState } from 'react';
import { useForgeStore } from '../store/forgeStore';

export function FileExplorer() {
  const files = useForgeStore((s) => s.files);
  const activeFile = useForgeStore((s) => s.activeFile);
  const setActiveFile = useForgeStore((s) => s.setActiveFile);
  const createFile = useForgeStore((s) => s.createFile);
  const deleteFile = useForgeStore((s) => s.deleteFile);
  const renameFile = useForgeStore((s) => s.renameFile);
  const loadFromText = useForgeStore((s) => s.loadFromText);

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [renamingFile, setRenamingFile] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const fileNames = Object.keys(files).sort((a, b) => {
    // sketches first, then 3d files
    const aSketch = a.includes('.sketch.') ? 0 : 1;
    const bSketch = b.includes('.sketch.') ? 0 : 1;
    return aSketch - bSketch || a.localeCompare(b);
  });

  const sketchFiles = fileNames.filter((n) => n.includes('.sketch.'));
  const partFiles = fileNames.filter((n) => !n.includes('.sketch.'));

  const handleCreate = () => {
    const name = newName.trim();
    if (!name || files[name]) return;
    createFile(name);
    setNewName('');
    setCreating(false);
  };

  const handleRename = (oldName: string) => {
    const name = renameValue.trim();
    if (!name || (name !== oldName && files[name])) return;
    if (name !== oldName) renameFile(oldName, name);
    setRenamingFile(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    file.text().then((text) => loadFromText(text, file.name));
  };

  const renderSection = (label: string, icon: string, names: string[]) => (
    <>
      <div style={{ padding: '6px 12px', fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 1, borderBottom: '1px solid #2a2a2a' }}>
        {icon} {label}
      </div>
      {names.map((name) => (
        <div
          key={name}
          onClick={() => setActiveFile(name)}
          onDoubleClick={() => { setRenamingFile(name); setRenameValue(name); }}
          style={{
            padding: '5px 12px',
            cursor: 'pointer',
            color: name === activeFile ? '#fff' : '#aaa',
            background: name === activeFile ? '#37373d' : 'transparent',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onMouseEnter={(e) => { if (name !== activeFile) e.currentTarget.style.background = '#2d2d2d'; }}
          onMouseLeave={(e) => { if (name !== activeFile) e.currentTarget.style.background = 'transparent'; }}
        >
          {renamingFile === name ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRename(name)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(name); if (e.key === 'Escape') setRenamingFile(null); }}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, background: '#1e1e1e', border: '1px solid #4a9eff', color: '#fff', fontSize: 12, padding: '1px 4px', outline: 'none' }}
            />
          ) : (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
              <span
                onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${name}"?`)) deleteFile(name); }}
                style={{ color: '#666', fontSize: 10, visibility: fileNames.length > 1 ? 'visible' : 'hidden' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#f44')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
              >✕</span>
            </>
          )}
        </div>
      ))}
    </>
  );

  return (
    <div
      style={{ width: 220, background: '#252525', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', fontSize: 13 }}
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, color: '#aaa', fontSize: 12 }}>Project Files</span>
        <span
          onClick={() => setCreating(true)}
          style={{ cursor: 'pointer', color: '#4a9eff', fontSize: 16, lineHeight: 1 }}
          title="New file"
        >+</span>
      </div>

      {creating && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid #2a2a2a' }}>
          <input
            autoFocus
            placeholder="name.forge.js or name.sketch.js"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            onBlur={() => { if (!newName.trim()) setCreating(false); }}
            style={{ width: '100%', background: '#1e1e1e', border: '1px solid #4a9eff', color: '#fff', fontSize: 11, padding: '3px 6px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {sketchFiles.length > 0 && renderSection('Sketches', '✏️', sketchFiles)}
        {partFiles.length > 0 && renderSection('Parts', '🧊', partFiles)}
      </div>
    </div>
  );
}

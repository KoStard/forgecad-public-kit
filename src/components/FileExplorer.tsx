import { useMemo, useState, DragEvent, useEffect } from 'react';
import { useForgeStore } from '../store/forgeStore';

export function FileExplorer() {
  const files = useForgeStore((s) => s.files);
  const savedFiles = useForgeStore((s) => s.savedFiles);
  const folders = useForgeStore((s) => s.folders);
  const activeFile = useForgeStore((s) => s.activeFile);
  const setActiveFile = useForgeStore((s) => s.setActiveFile);
  const createFile = useForgeStore((s) => s.createFile);
  const createFolder = useForgeStore((s) => s.createFolder);
  const deleteFile = useForgeStore((s) => s.deleteFile);
  const deleteFolder = useForgeStore((s) => s.deleteFolder);
  const renameFile = useForgeStore((s) => s.renameFile);
  const renameFolder = useForgeStore((s) => s.renameFolder);
  const moveEntry = useForgeStore((s) => s.moveEntry);
  const loadFromText = useForgeStore((s) => s.loadFromText);

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [focusedFolder, setFocusedFolder] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);

  const normalizePath = (value: string): string => value
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+|\/+$/g, '');

  const getBaseName = (value: string): string => {
    const normalized = normalizePath(value);
    const idx = normalized.lastIndexOf('/');
    return idx === -1 ? normalized : normalized.slice(idx + 1);
  };

  const getParentPath = (value: string): string => {
    const normalized = normalizePath(value);
    const idx = normalized.lastIndexOf('/');
    return idx === -1 ? '' : normalized.slice(0, idx);
  };

  const collectParentPaths = (value: string): string[] => {
    const normalized = normalizePath(value);
    const parts = normalized.split('/');
    if (parts.length <= 1) return [];
    const parents: string[] = [];
    let current = '';
    for (let i = 0; i < parts.length - 1; i += 1) {
      current = current ? `${current}/${parts[i]}` : parts[i];
      parents.push(current);
    }
    return parents;
  };

  type TreeNode = {
    type: 'file' | 'folder';
    name: string;
    path: string;
    children?: TreeNode[];
  };

  const tree = useMemo(() => {
    const allFolders = new Set<string>();
    folders.forEach((folder) => allFolders.add(normalizePath(folder)));
    Object.keys(files).forEach((name) => {
      collectParentPaths(name).forEach((folder) => allFolders.add(folder));
    });
    const root: TreeNode = { type: 'folder', name: '', path: '', children: [] };

    const ensureFolder = (parent: TreeNode, name: string, path: string): TreeNode => {
      const children = parent.children ?? [];
      const existing = children.find((child) => child.type === 'folder' && child.name === name);
      if (existing) return existing;
      const node: TreeNode = { type: 'folder', name, path, children: [] };
      parent.children = [...children, node];
      return node;
    };

    allFolders.forEach((folder) => {
      const normalized = normalizePath(folder);
      if (!normalized) return;
      const parts = normalized.split('/');
      let current = root;
      let currentPath = '';
      parts.forEach((part) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        current = ensureFolder(current, part, currentPath);
      });
    });

    Object.keys(files).forEach((name) => {
      const normalized = normalizePath(name);
      const parts = normalized.split('/');
      let current = root;
      let currentPath = '';
      parts.forEach((part, index) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const isFile = index === parts.length - 1;
        if (isFile) {
          const children = current.children ?? [];
          if (!children.some((child) => child.type === 'file' && child.name === part)) {
            current.children = [...children, { type: 'file', name: part, path: currentPath }];
          }
        } else {
          current = ensureFolder(current, part, currentPath);
        }
      });
    });

    const sortNode = (node: TreeNode): TreeNode => {
      if (!node.children) return node;
      const sorted = [...node.children].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return { ...node, children: sorted.map(sortNode) };
    };

    return sortNode(root).children ?? [];
  }, [files, folders]);

  useEffect(() => {
    if (!activeFile) return;
    const parents = collectParentPaths(activeFile);
    if (parents.length === 0) return;
    setExpandedFolders((prev) => Array.from(new Set([...prev, ...parents])));
  }, [activeFile]);

  const handleCreate = () => {
    const name = normalizePath(newName.trim());
    if (!name) return;
    const parent = focusedFolder ? normalizePath(focusedFolder) : '';
    const fullPath = parent ? normalizePath(`${parent}/${name}`) : name;
    if (files[fullPath]) return;
    if (creating === 'folder') {
      createFolder(fullPath);
      setFocusedFolder(fullPath);
      setExpandedFolders((prev) => Array.from(new Set([...prev, fullPath, ...collectParentPaths(fullPath)])));
    } else {
      createFile(fullPath);
      if (parent) setFocusedFolder(parent);
    }
    setNewName('');
    setCreating(null);
  };

  const handleRename = (oldPath: string) => {
    const base = normalizePath(renameValue.trim());
    if (!base) return;
    const parent = getParentPath(oldPath);
    const nextPath = parent ? normalizePath(`${parent}/${base}`) : base;
    if (nextPath === oldPath) {
      setRenamingPath(null);
      return;
    }
    if (files[oldPath]) {
      if (files[nextPath]) return;
      renameFile(oldPath, nextPath);
    } else {
      renameFolder(oldPath, nextPath);
    }
    setRenamingPath(null);
  };

  const handleFileDrop = (e: DragEvent, targetFolder: string) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const targetName = targetFolder ? `${targetFolder}/${file.name}` : file.name;
    file.text().then((text) => loadFromText(text, targetName));
  };

  const handleDropToFolder = (e: DragEvent, targetFolder: string) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFileDrop(e, targetFolder);
      return;
    }
    const fromPath = e.dataTransfer.getData('application/x-forge-path') || e.dataTransfer.getData('text/plain');
    if (!fromPath) return;
    const base = getBaseName(fromPath);
    const destination = targetFolder ? normalizePath(`${targetFolder}/${base}`) : base;
    if (destination === fromPath) return;
    moveEntry(fromPath, destination);
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => (
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    ));
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isFolder = node.type === 'folder';
    const isExpanded = !isFolder || expandedFolders.includes(node.path);
    const isActive = node.type === 'file' && node.path === activeFile;
    const isModified = node.type === 'file' && files[node.path] !== savedFiles[node.path];
    const isRenaming = renamingPath === node.path;
    const isFocused = isFolder && focusedFolder === node.path;
    const canDeleteFolder = isFolder && (!node.children || node.children.length === 0);
    const paddingLeft = 8 + depth * 12;

    return (
      <div key={node.path}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData('application/x-forge-path', node.path);
            e.dataTransfer.setData('text/plain', node.path);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onDragOver={(e) => { if (isFolder) e.preventDefault(); }}
          onDrop={(e) => { if (isFolder) handleDropToFolder(e, node.path); }}
          onClick={() => {
            if (isFolder) setFocusedFolder(node.path);
            if (node.type === 'file') setActiveFile(node.path);
          }}
          onDoubleClick={() => {
            setRenamingPath(node.path);
            setRenameValue(getBaseName(node.path));
          }}
          style={{
            padding: '5px 8px',
            paddingLeft,
            cursor: 'pointer',
            color: isActive ? '#fff' : '#aaa',
            background: isActive ? '#37373d' : (isFocused ? '#2a2a2a' : 'transparent'),
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onMouseEnter={(e) => { if (!isActive && !isFocused) e.currentTarget.style.background = '#2d2d2d'; }}
          onMouseLeave={(e) => { if (!isActive && !isFocused) e.currentTarget.style.background = 'transparent'; }}
        >
          {isFolder && (
            <span
              onClick={(e) => { e.stopPropagation(); toggleFolder(node.path); }}
              style={{ width: 14, textAlign: 'center', color: '#888' }}
            >
              {isExpanded ? '▾' : '▸'}
            </span>
          )}
          <span style={{ width: 16 }}>{isFolder ? '📁' : '📄'}</span>
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRename(node.path)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleRename(node.path); if (e.key === 'Escape') setRenamingPath(null); }}
              onClick={(e) => e.stopPropagation()}
              style={{ flex: 1, background: '#1e1e1e', border: '1px solid #4a9eff', color: '#fff', fontSize: 12, padding: '1px 4px', outline: 'none' }}
            />
          ) : (
            <>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
              {isModified && (
                <div
                  title="Unsaved changes"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: '#888',
                    flexShrink: 0,
                  }}
                />
              )}
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (node.type === 'file') {
                    if (confirm(`Delete "${node.name}"?`)) deleteFile(node.path);
                  } else if (canDeleteFolder) {
                    if (confirm(`Delete folder "${node.name}"?`)) deleteFolder(node.path);
                  }
                }}
                style={{
                  color: '#666',
                  fontSize: 10,
                  visibility: node.type === 'file' || canDeleteFolder ? 'visible' : 'hidden',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#f44')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#666')}
              >✕</span>
            </>
          )}
        </div>
        {isFolder && isExpanded && node.children && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <div
      style={{ width: 220, background: '#252525', borderRight: '1px solid #333', display: 'flex', flexDirection: 'column', fontSize: 13 }}
      onDrop={(e) => handleDropToFolder(e, '')}
      onDragOver={(e) => e.preventDefault()}
    >
      <div style={{ padding: '8px 12px', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontWeight: 600, color: '#aaa', fontSize: 12 }}>Project Files</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span
            onClick={() => setCreating('file')}
            style={{ cursor: 'pointer', color: '#4a9eff', fontSize: 12 }}
            title="New file"
          >+ File</span>
          <span
            onClick={() => setCreating('folder')}
            style={{ cursor: 'pointer', color: '#4a9eff', fontSize: 12 }}
            title="New folder"
          >+ Folder</span>
        </div>
      </div>

      {creating && (
        <div style={{ padding: '4px 12px', borderBottom: '1px solid #2a2a2a' }}>
          <input
            autoFocus
            placeholder={creating === 'folder' ? 'Folder name' : 'name.forge.js or name.sketch.js'}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(null); }}
            onBlur={() => { if (!newName.trim()) setCreating(null); }}
            style={{ width: '100%', background: '#1e1e1e', border: '1px solid #4a9eff', color: '#fff', fontSize: 11, padding: '3px 6px', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
      )}

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tree.length === 0 && (
          <div style={{ padding: '10px 12px', color: '#777', fontSize: 12 }}>
            No files yet. Create a file or drop one here.
          </div>
        )}
        {tree.map((node) => renderNode(node, 0))}
      </div>
    </div>
  );
}

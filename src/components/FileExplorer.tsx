import { DragEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useForgeStore } from '../store/forgeStore';

const MESH_EXTS = ['.stl', '.obj', '.3mf'];
function isMeshFile(name: string): boolean {
  const lower = name.toLowerCase();
  return MESH_EXTS.some((ext) => lower.endsWith(ext));
}

function isSvgFile(name: string): boolean {
  return name.toLowerCase().endsWith('.svg');
}

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
  const setMeshPreview = useForgeStore((s) => s.setMeshPreview);
  const meshPreviewFile = useForgeStore((s) => s.meshPreviewFile);

  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState<'file' | 'folder' | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [focusedFolder, setFocusedFolder] = useState<string>('');
  const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; path: string; type: 'file' | 'folder' } | null>(null);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const lastClickedPath = useRef<string | null>(null);
  const treeContainerRef = useRef<HTMLDivElement>(null);

  const normalizePath = (value: string): string =>
    value
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
    const target = meshPreviewFile || activeFile;
    if (!target) return;
    const parents = collectParentPaths(target);
    if (parents.length === 0) return;
    setExpandedFolders((prev) => Array.from(new Set([...prev, ...parents])));
  }, [activeFile, meshPreviewFile]);

  // Scroll the keyboard-focused item into view when selection changes via keyboard
  useEffect(() => {
    if (selection.size !== 1) return;
    const path = lastClickedPath.current;
    if (!path) return;
    const el = treeContainerRef.current?.querySelector<HTMLElement>(`[data-path="${CSS.escape(path)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [selection]);

  const handleCreate = () => {
    let name = normalizePath(newName.trim());
    if (!name) return;
    // Auto-append .forge.js for bare names (no extension) when creating files
    if (creating === 'file' && !name.includes('.')) {
      name = `${name}.forge.js`;
    }
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
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length === 0) return;
    droppedFiles.forEach((file) => {
      const targetName = targetFolder ? `${targetFolder}/${file.name}` : file.name;
      file.text().then((text) => loadFromText(text, targetName));
    });
  };

  const handleDropToFolder = (e: DragEvent, targetFolder: string) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
      handleFileDrop(e, targetFolder);
      return;
    }
    // Try multi-path first, fall back to single path
    const multiRaw = e.dataTransfer.getData('application/x-forge-paths');
    const paths: string[] = multiRaw
      ? JSON.parse(multiRaw)
      : [e.dataTransfer.getData('application/x-forge-path') || e.dataTransfer.getData('text/plain')].filter(Boolean);
    if (paths.length === 0) return;
    for (const fromPath of paths) {
      // Prevent dropping a folder into itself or any of its descendants
      if (targetFolder === fromPath || targetFolder.startsWith(fromPath + '/')) continue;
      // Prevent no-op when already in the target folder
      if (getParentPath(fromPath) === targetFolder) continue;
      const base = getBaseName(fromPath);
      const destination = targetFolder ? normalizePath(`${targetFolder}/${base}`) : base;
      if (destination === fromPath) continue;
      moveEntry(fromPath, destination);
    }
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  };

  // Flat list of visible nodes (DFS order) — used for keyboard nav and shift-click range selection
  const flatVisibleNodes = useMemo(() => {
    const result: { path: string; type: 'file' | 'folder'; hasChildren: boolean }[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        result.push({ path: node.path, type: node.type, hasChildren: (node.children?.length ?? 0) > 0 });
        if (node.type === 'folder' && expandedFolders.includes(node.path) && node.children) {
          walk(node.children);
        }
      }
    };
    walk(tree);
    return result;
  }, [tree, expandedFolders]);

  const flatVisiblePaths = useMemo(() => flatVisibleNodes.map((n) => n.path), [flatVisibleNodes]);

  const handleDeleteSelection = useCallback(() => {
    if (selection.size === 0) return;
    const paths = Array.from(selection);
    const label = paths.length === 1 ? `"${getBaseName(paths[0])}"` : `${paths.length} items`;
    if (!confirm(`Delete ${label}?`)) return;
    // Delete files first, then folders (folders may already be emptied by file deletes)
    const filePaths = paths.filter((p) => files[p]);
    const folderPaths = paths.filter((p) => !files[p]);
    for (const f of filePaths) deleteFile(f);
    for (const f of folderPaths) deleteFolder(f);
    setSelection(new Set());
  }, [selection, files, deleteFile, deleteFolder]);

  const handleNodeClick = useCallback(
    (e: React.MouseEvent, node: TreeNode) => {
      const metaKey = e.metaKey || e.ctrlKey;
      const { shiftKey } = e;

      if (metaKey) {
        // Toggle this item in selection
        setSelection((prev) => {
          const next = new Set(prev);
          if (next.has(node.path)) next.delete(node.path);
          else next.add(node.path);
          return next;
        });
        lastClickedPath.current = node.path;
      } else if (shiftKey && lastClickedPath.current) {
        // Range select between last clicked and this node
        const startIdx = flatVisiblePaths.indexOf(lastClickedPath.current);
        const endIdx = flatVisiblePaths.indexOf(node.path);
        if (startIdx !== -1 && endIdx !== -1) {
          const lo = Math.min(startIdx, endIdx);
          const hi = Math.max(startIdx, endIdx);
          setSelection(new Set(flatVisiblePaths.slice(lo, hi + 1)));
        }
      } else {
        // Single click — select only this item
        setSelection(new Set([node.path]));
        lastClickedPath.current = node.path;
      }

      if (node.type === 'folder') setFocusedFolder(node.path);
      if (node.type === 'file' && !metaKey && !shiftKey) {
        if (isMeshFile(node.path)) {
          // Mesh file clicked — preview it in the viewport without changing active file
          setMeshPreview(node.path);
        } else {
          setActiveFile(node.path);
        }
      }
    },
    [flatVisiblePaths, setActiveFile, setMeshPreview],
  );

  const renderCreationInput = (depth: number) => {
    const paddingLeft = 8 + depth * 12 + 14 + 6; // match file item indent (base + depth + chevron + gap)
    return (
      <div key="__creating__" style={{ padding: '2px 8px', paddingLeft }}>
        <input
          autoFocus
          placeholder={creating === 'folder' ? 'Folder name' : 'gear, utils.js, or asset.svg'}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCreate();
            if (e.key === 'Escape') {
              setCreating(null);
              setNewName('');
            }
          }}
          onBlur={() => {
            if (!newName.trim()) {
              setCreating(null);
              setNewName('');
            }
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            background: 'var(--fc-bg)',
            border: '1px solid var(--fc-accent)',
            color: 'var(--fc-text)',
            fontSize: 11,
            padding: '3px 6px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  };

  const renderNode = (node: TreeNode, depth: number) => {
    const isFolder = node.type === 'folder';
    const isExpanded = !isFolder || expandedFolders.includes(node.path);
    const isActive = node.type === 'file' && (node.path === activeFile || node.path === meshPreviewFile);
    const isMesh = node.type === 'file' && isMeshFile(node.path);
    const isModified = node.type === 'file' && !isMesh && files[node.path] !== savedFiles[node.path];
    const isRenaming = renamingPath === node.path;
    const isSelected = selection.has(node.path);
    const paddingLeft = 8 + depth * 12;

    return (
      <div
        key={node.path}
        onDragOver={
          isFolder
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
              }
            : undefined
        }
        onDrop={
          isFolder
            ? (e) => {
                e.stopPropagation();
                handleDropToFolder(e, node.path);
              }
            : undefined
        }
      >
        <div
          data-path={node.path}
          draggable
          onDragStart={(e) => {
            // If dragging a selected item, drag all selected; otherwise drag just this one
            const paths = selection.has(node.path) && selection.size > 1 ? Array.from(selection) : [node.path];
            e.dataTransfer.setData('application/x-forge-paths', JSON.stringify(paths));
            e.dataTransfer.setData('application/x-forge-path', node.path);
            e.dataTransfer.setData('text/plain', node.path);
            e.dataTransfer.effectAllowed = 'move';
          }}
          onClick={(e) => handleNodeClick(e, node)}
          onDoubleClick={() => {
            if (isFolder) toggleFolder(node.path);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            // If right-clicking a non-selected item, select just that item
            if (!selection.has(node.path)) {
              setSelection(new Set([node.path]));
              lastClickedPath.current = node.path;
            }
            setContextMenu({ x: e.clientX, y: e.clientY, path: node.path, type: node.type });
          }}
          style={{
            padding: '5px 8px',
            paddingLeft,
            cursor: 'pointer',
            color: isActive ? 'var(--fc-accentText)' : 'var(--fc-textMuted)',
            background: isSelected ? 'var(--fc-bgActive)' : 'transparent',
            fontSize: 12,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
          onMouseEnter={(e) => {
            if (!isSelected) e.currentTarget.style.background = 'var(--fc-bgHover)';
          }}
          onMouseLeave={(e) => {
            if (!isSelected) e.currentTarget.style.background = 'transparent';
          }}
        >
          {isFolder ? (
            <span
              onClick={(e) => {
                e.stopPropagation();
                toggleFolder(node.path);
              }}
              style={{ width: 14, textAlign: 'center', color: 'var(--fc-textDim)', flexShrink: 0 }}
            >
              {isExpanded ? '▾' : '▸'}
            </span>
          ) : (
            <span style={{ width: 14, flexShrink: 0 }} />
          )}
          <span style={{ width: 16 }}>{isFolder ? '📁' : isMeshFile(node.path) ? '🔶' : isSvgFile(node.path) ? '🖼' : '📄'}</span>
          {isRenaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => handleRename(node.path)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRename(node.path);
                if (e.key === 'Escape') setRenamingPath(null);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1,
                background: 'var(--fc-bg)',
                border: '1px solid var(--fc-accent)',
                color: 'var(--fc-text)',
                fontSize: 12,
                padding: '1px 4px',
                outline: 'none',
              }}
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
                    background: 'var(--fc-textDim)',
                    flexShrink: 0,
                  }}
                />
              )}
            </>
          )}
        </div>
        {isFolder && isExpanded && (
          <>
            {creating && focusedFolder === node.path && renderCreationInput(depth + 1)}
            {node.children?.map((child) => renderNode(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <div
      ref={treeContainerRef}
      tabIndex={0}
      style={{
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        flex: 1,
        background: 'var(--fc-bgSurface)',
        borderRight: '1px solid var(--fc-border)',
        display: 'flex',
        flexDirection: 'column',
        fontSize: 13,
        outline: 'none',
      }}
      onDrop={(e) => handleDropToFolder(e, '')}
      onDragOver={(e) => e.preventDefault()}
      onClick={(e) => {
        setContextMenu(null);
        // Click on background clears selection
        if (e.target === e.currentTarget || (e.target as HTMLElement).dataset?.fcEditorSurface) {
          setSelection(new Set());
        }
      }}
      onKeyDown={(e) => {
        if (renamingPath || creating) return;

        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (selection.size > 0) {
            e.preventDefault();
            handleDeleteSelection();
          }
          return;
        }

        const currentPath = selection.size >= 1 ? (lastClickedPath.current ?? Array.from(selection)[0]) : null;
        const idx = currentPath ? flatVisibleNodes.findIndex((n) => n.path === currentPath) : -1;

        const moveTo = (path: string) => {
          setSelection(new Set([path]));
          lastClickedPath.current = path;
        };

        switch (e.key) {
          case 'ArrowDown': {
            e.preventDefault();
            const next = flatVisibleNodes[idx >= 0 ? idx + 1 : 0];
            if (next) moveTo(next.path);
            break;
          }
          case 'ArrowUp': {
            e.preventDefault();
            if (idx > 0) moveTo(flatVisibleNodes[idx - 1].path);
            break;
          }
          case 'ArrowRight': {
            e.preventDefault();
            if (idx < 0) break;
            const node = flatVisibleNodes[idx];
            if (node.type === 'folder' && node.hasChildren) {
              if (!expandedFolders.includes(currentPath!)) {
                setExpandedFolders((prev) => [...prev, currentPath!]);
              } else {
                const firstChild = flatVisibleNodes[idx + 1];
                if (firstChild) moveTo(firstChild.path);
              }
            }
            break;
          }
          case 'ArrowLeft': {
            e.preventDefault();
            if (idx < 0) break;
            const node = flatVisibleNodes[idx];
            if (node.type === 'folder' && expandedFolders.includes(currentPath!)) {
              setExpandedFolders((prev) => prev.filter((p) => p !== currentPath));
            } else {
              const parentPath = getParentPath(currentPath!);
              if (parentPath) moveTo(parentPath);
            }
            break;
          }
          case 'Enter': {
            e.preventDefault();
            if (idx < 0) break;
            const node = flatVisibleNodes[idx];
            if (node.type === 'file') {
              if (isMeshFile(currentPath!)) {
                setMeshPreview(currentPath!);
              } else {
                setActiveFile(currentPath!);
              }
              // Restore focus so arrow navigation can continue immediately
              treeContainerRef.current?.focus();
            } else {
              toggleFolder(currentPath!);
            }
            break;
          }
          default:
            break;
        }
      }}
    >
      {contextMenu && (
        <div
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            background: 'var(--fc-bgSurface)',
            border: '1px solid var(--fc-border)',
            borderRadius: 4,
            padding: '4px 0',
            zIndex: 1000,
            minWidth: 120,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.type === 'folder' && (
            <>
              <div
                style={{ padding: '5px 12px', cursor: 'pointer', color: 'var(--fc-text)', fontSize: 12 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--fc-bgHover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => {
                  setFocusedFolder(contextMenu.path);
                  setExpandedFolders((prev) => Array.from(new Set([...prev, contextMenu.path])));
                  setCreating('file');
                  setContextMenu(null);
                }}
              >
                New File
              </div>
              <div
                style={{ padding: '5px 12px', cursor: 'pointer', color: 'var(--fc-text)', fontSize: 12 }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--fc-bgHover)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                onClick={() => {
                  setFocusedFolder(contextMenu.path);
                  setExpandedFolders((prev) => Array.from(new Set([...prev, contextMenu.path])));
                  setCreating('folder');
                  setContextMenu(null);
                }}
              >
                New Folder
              </div>
              <div style={{ borderTop: '1px solid var(--fc-border)', margin: '4px 0' }} />
            </>
          )}
          <div
            style={{ padding: '5px 12px', cursor: 'pointer', color: 'var(--fc-text)', fontSize: 12 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--fc-bgHover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              setRenamingPath(contextMenu.path);
              setRenameValue(getBaseName(contextMenu.path));
              setContextMenu(null);
            }}
          >
            Rename
          </div>
          <div
            style={{ padding: '5px 12px', cursor: 'pointer', color: 'var(--fc-error)', fontSize: 12 }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--fc-bgHover)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
            onClick={() => {
              setContextMenu(null);
              handleDeleteSelection();
            }}
          >
            Delete{selection.size > 1 ? ` (${selection.size})` : ''}
          </div>
        </div>
      )}
      <div
        style={{
          padding: '8px 12px',
          borderBottom: '1px solid var(--fc-border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontWeight: 600, color: 'var(--fc-textMuted)', fontSize: 12 }}>Project Files</span>
        <div style={{ display: 'flex', gap: 6 }}>
          <span onClick={() => { setFocusedFolder(''); setCreating('file'); }} style={{ cursor: 'pointer', color: 'var(--fc-accent)', fontSize: 12 }} title="New file">
            + File
          </span>
          <span
            onClick={() => { setFocusedFolder(''); setCreating('folder'); }}
            style={{ cursor: 'pointer', color: 'var(--fc-accent)', fontSize: 12 }}
            title="New folder"
          >
            + Folder
          </span>
        </div>
      </div>

      <div style={{ flex: 1, overflow: 'auto' }}>
        {tree.length === 0 && !creating && (
          <div style={{ padding: '10px 12px', color: 'var(--fc-textDim)', fontSize: 12 }}>
            No files yet. Create a file or drop one here.
          </div>
        )}
        {creating && !focusedFolder && renderCreationInput(0)}
        {tree.map((node) => renderNode(node, 0))}
      </div>
    </div>
  );
}

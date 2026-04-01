import type { SceneObject } from '@forge/index';
import { type MouseEvent, type ReactElement, useEffect, useMemo, useRef } from 'react';
import { useForgeStore } from '../../store/forgeStore';

const DEFAULT_OBJECT_SETTINGS = { visible: true, opacity: 1, color: '#5b9bd5' } as const;

type ObjectVisibilityState = 'none' | 'mixed' | 'all';

interface ObjectTreeLeafNode {
  kind: 'object';
  key: string;
  label: string;
  object: SceneObject;
  objectIds: string[];
}

interface ObjectTreeGroupNode {
  kind: 'group';
  key: string;
  label: string;
  path: string[];
  children: ObjectTreeNode[];
  objectIds: string[];
}

type ObjectTreeNode = ObjectTreeLeafNode | ObjectTreeGroupNode;

interface MutableObjectTreeGroupNode {
  kind: 'group';
  key: string;
  label: string;
  path: string[];
  children: Array<MutableObjectTreeGroupNode | ObjectTreeLeafNode>;
  groups: Map<string, MutableObjectTreeGroupNode>;
}

const cleanTreeSegments = (segments: string[] | undefined): string[] =>
  (segments ?? []).map((segment) => segment.trim()).filter((segment) => segment.length > 0);

const getObjectTreePath = (object: SceneObject): string[] => {
  const explicitTreePath = cleanTreeSegments(object.treePath);
  if (explicitTreePath.length > 0) return explicitTreePath;

  const name = object.name.trim() || object.id;
  const groupName = object.groupName?.trim();
  if (!groupName) return [name];

  const groupPath = groupName
    .split('.')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const prefixedLeaf = `${groupName}.`;
  if (name.startsWith(prefixedLeaf)) {
    const leafName = name.slice(prefixedLeaf.length).trim();
    return [...groupPath, leafName || name];
  }
  return [...groupPath, name];
};

const createMutableObjectGroup = (label: string, path: string[]): MutableObjectTreeGroupNode => ({
  kind: 'group',
  key: `group:${path.join(' > ')}`,
  label,
  path,
  children: [],
  groups: new Map(),
});

const finalizeObjectGroup = (node: MutableObjectTreeGroupNode): ObjectTreeGroupNode => {
  const children = node.children.map((child) => (child.kind === 'object' ? child : finalizeObjectGroup(child)));
  return {
    kind: 'group',
    key: node.key,
    label: node.label,
    path: node.path,
    children,
    objectIds: children.flatMap((child) => child.objectIds),
  };
};

const buildObjectTree = (objects: SceneObject[]): ObjectTreeNode[] => {
  const root = createMutableObjectGroup('', []);

  objects.forEach((object) => {
    const objectPath = getObjectTreePath(object);
    const leafLabel = objectPath[objectPath.length - 1] ?? object.name ?? object.id;
    let parent = root;

    objectPath.slice(0, -1).forEach((segment) => {
      let group = parent.groups.get(segment);
      if (!group) {
        const groupPath = [...parent.path, segment];
        group = createMutableObjectGroup(segment, groupPath);
        parent.groups.set(segment, group);
        parent.children.push(group);
      }
      parent = group;
    });

    parent.children.push({
      kind: 'object',
      key: object.id,
      label: leafLabel,
      object,
      objectIds: [object.id],
    });
  });

  return root.children.map((child) => (child.kind === 'object' ? child : finalizeObjectGroup(child)));
};

function VisibilityCheckbox({
  checked,
  indeterminate = false,
  onChange,
  onClick,
  onDoubleClick,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  onClick?: (event: MouseEvent<HTMLInputElement>) => void;
  onDoubleClick?: (event: MouseEvent<HTMLInputElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <input
      ref={inputRef}
      type="checkbox"
      checked={checked}
      aria-checked={indeterminate ? 'mixed' : checked}
      onChange={(event) => onChange(event.target.checked)}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
    />
  );
}

interface ObjectTreeProps {
  objects: SceneObject[];
  objectItemRefs: React.RefObject<Record<string, HTMLDivElement | null>>;
  focusedObjectIdSet: Set<string>;
  selectedObjectId: string | null;
  objectSettings: Record<string, { visible: boolean; opacity: number; color: string }>;
  setObjectVisibility: (id: string, visible: boolean) => void;
  setObjectsVisibility: (ids: string[], visible: boolean) => void;
  setObjectOpacity: (id: string, opacity: number) => void;
  setObjectColor: (id: string, color: string) => void;
  selectObject: (id: string) => void;
  focusObject: (id: string, opts?: { additive?: boolean }) => void;
  clearFocusedObject: () => void;
  setHoveredObjectId: (id: string | null) => void;
  setConstructionGhost: (ghost: null) => void;
}

export function ObjectTree({
  objects,
  objectItemRefs,
  focusedObjectIdSet,
  selectedObjectId,
  objectSettings,
  setObjectVisibility,
  setObjectsVisibility,
  setObjectOpacity,
  setObjectColor,
  selectObject,
  focusObject,
  clearFocusedObject,
  setHoveredObjectId,
  setConstructionGhost,
}: ObjectTreeProps) {
  const objectTree = useMemo(() => buildObjectTree(objects), [objects]);

  const getObjectVisibilityState = (ids: string[]): ObjectVisibilityState => {
    let visibleCount = 0;
    ids.forEach((id) => {
      if ((objectSettings[id] ?? DEFAULT_OBJECT_SETTINGS).visible) visibleCount += 1;
    });
    if (visibleCount === 0) return 'none';
    if (visibleCount === ids.length) return 'all';
    return 'mixed';
  };

  const renderObjectTreeNode = (node: ObjectTreeNode): ReactElement => {
    if (node.kind === 'group') {
      const visibilityState = getObjectVisibilityState(node.objectIds);
      const isDimmedByFocus = focusedObjectIdSet.size > 0 && !node.objectIds.some((id) => focusedObjectIdSet.has(id));
      return (
        <div key={node.key} style={{ marginBottom: 8, opacity: isDimmedByFocus ? 0.65 : 1 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 8px',
              border: '1px solid var(--fc-borderLight)',
              borderRadius: 6,
              background: 'var(--fc-bgInput)',
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 10, textAlign: 'center' }}>▾</span>
            <VisibilityCheckbox
              checked={visibilityState === 'all'}
              indeterminate={visibilityState === 'mixed'}
              onChange={(visible) => setObjectsVisibility(node.objectIds, visible)}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
            />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--fc-text)', flex: 1 }}>{node.label}</span>
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>
              {node.objectIds.length} {node.objectIds.length === 1 ? 'part' : 'parts'}
            </span>
          </div>
          <div
            style={{
              marginTop: 6,
              marginLeft: 12,
              paddingLeft: 12,
              borderLeft: '1px solid var(--fc-borderLight)',
            }}
          >
            {node.children.map(renderObjectTreeNode)}
          </div>
        </div>
      );
    }

    const obj = node.object;
    const settings = objectSettings[obj.id] ?? DEFAULT_OBJECT_SETTINGS;
    const isSelected = selectedObjectId === obj.id;
    const isFocused = focusedObjectIdSet.has(obj.id);
    const isDimmedByFocus = focusedObjectIdSet.size > 0 && !isFocused;

    return (
      <div
        key={node.key}
        ref={(element) => {
          objectItemRefs.current[obj.id] = element;
        }}
        tabIndex={-1}
        onClick={() => selectObject(obj.id)}
        onDoubleClick={(event) => {
          event.stopPropagation();
          const additive = event.shiftKey || event.metaKey || event.ctrlKey;
          focusObject(obj.id, { additive });
        }}
        onMouseEnter={() => setHoveredObjectId(obj.id)}
        onMouseLeave={() => setHoveredObjectId(null)}
        style={{
          padding: '8px 8px',
          border: '1px solid var(--fc-borderLight)',
          borderRadius: 6,
          marginBottom: 8,
          background: isSelected ? 'var(--fc-bgActive)' : 'var(--fc-bgOverlay)',
          cursor: 'pointer',
          opacity: isDimmedByFocus ? 0.65 : 1,
          boxShadow: isFocused ? '0 0 0 1px var(--fc-accent) inset' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 10, textAlign: 'center' }}>•</span>
          <VisibilityCheckbox
            checked={settings.visible}
            onChange={(visible) => setObjectVisibility(obj.id, visible)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
          />
          <span style={{ fontSize: 12, color: 'var(--fc-text)', flex: 1 }}>{node.label}</span>
          <input
            type="color"
            value={settings.color}
            onChange={(event) => setObjectColor(obj.id, event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            style={{ width: 26, height: 18, border: 'none', background: 'transparent', cursor: 'pointer' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={settings.opacity}
            onChange={(event) => setObjectOpacity(obj.id, Number(event.target.value))}
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            style={{ flex: 1 }}
          />
          <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 32, textAlign: 'right' }}>
            {Math.round(settings.opacity * 100)}%
          </span>
        </div>
      </div>
    );
  };

  return (
    <>
      {focusedObjectIdSet.size > 0 && (
        <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 8 }}>
          Focus mode on. Shift/Cmd/Ctrl + double-click toggles objects.
        </div>
      )}
      <div
        style={{ flex: 1, minHeight: 180, overflowY: 'auto', padding: '0 12px 12px' }}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) return;
          setConstructionGhost(null);
          clearFocusedObject();
        }}
      >
        {objects.length === 0 && <div style={{ fontSize: 12, color: 'var(--fc-textDim)', padding: '6px 0' }}>No objects loaded</div>}
        {objectTree.map(renderObjectTreeNode)}
      </div>
    </>
  );
}

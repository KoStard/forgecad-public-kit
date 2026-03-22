import { useForgeStore } from '../store/forgeStore';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import type { SceneObject } from '@forge/index';
import type { CutPlaneDef } from '@forge/cutPlane';
import { findJointAnimationClip, resolveJointAnimation } from '@forge/jointAnimation';
import { resolveJointViewValues } from '@forge/jointsView';
import { animationSpeedToSlider, formatAnimationSpeed, sliderToAnimationSpeed } from '../animationSpeed';
import { getCameraForwardVector, type ViewportCameraState } from '../capture/cameraState';
import { formatRenderSceneCliSpec, type ViewportRenderSceneState } from '../capture/renderSceneState';
import { ConstructionTreePanel } from './ConstructionTreePanel';
import { formatArea } from '@forge/units';

function CollapsibleSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          fontSize: 10,
          color: 'var(--fc-textDim)',
          marginBottom: open ? 2 : 0,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          cursor: 'pointer',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 4,
        }}
      >
        <span style={{ fontSize: 8 }}>{open ? '\u25BE' : '\u25B8'}</span>
        {title} ({count})
      </div>
      {open && children}
    </div>
  );
}

const btn = (active = false) => `fc-btn${active ? ' active' : ''}`;

const sectionStyle: CSSProperties = {
  borderTop: '1px solid var(--fc-borderLight)',
  padding: '10px 12px',
};

const labelStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: 'var(--fc-textDim)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: 0.6,
};

const inputStyle: CSSProperties = {
  flex: 1,
  background: 'var(--fc-bgInput)',
  border: '1px solid var(--fc-border)',
  borderRadius: 4,
  padding: '4px 6px',
  color: 'var(--fc-text)',
  fontSize: 12,
};

const resolveJointRange = (type: 'revolute' | 'prismatic', min?: number, max?: number): { min: number; max: number } => ({
  min: min ?? (type === 'prismatic' ? -100 : 0),
  max: max ?? (type === 'prismatic' ? 100 : 360),
});

const formatVector = (value: [number, number, number]): string => (
  value.map((entry) => entry.toFixed(3)).join(', ')
);

const DEFAULT_OBJECT_SETTINGS = { visible: true, opacity: 1, color: '#5b9bd5' } as const;

const shellQuoteArg = (value: string): string => `'${value.replace(/'/g, `'\"'\"'`)}'`;

const buildViewportRenderSceneState = (
  camera: ViewportCameraState,
  objects: SceneObject[],
  objectSettings: Record<string, { visible: boolean; opacity: number; color: string }>,
): ViewportRenderSceneState => {
  const objectOverrides: NonNullable<ViewportRenderSceneState['objects']> = {};

  objects.forEach((object) => {
    const settings = objectSettings[object.id] ?? DEFAULT_OBJECT_SETTINGS;
    const baseColor = object.color || DEFAULT_OBJECT_SETTINGS.color;
    const override: NonNullable<ViewportRenderSceneState['objects']>[string] = {};

    if (!settings.visible) override.visible = false;
    if (Math.abs(settings.opacity - 1) > 1e-6) override.opacity = settings.opacity;
    if (settings.color !== baseColor) override.color = settings.color;

    if (Object.keys(override).length > 0) {
      objectOverrides[object.id] = override;
    }
  });

  return Object.keys(objectOverrides).length > 0
    ? { camera, objects: objectOverrides }
    : { camera };
};

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

const cleanTreeSegments = (segments: string[] | undefined): string[] => (
  (segments ?? [])
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
);

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
  const children = node.children.map((child) => (
    child.kind === 'object' ? child : finalizeObjectGroup(child)
  ));
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

  return root.children.map((child) => (
    child.kind === 'object' ? child : finalizeObjectGroup(child)
  ));
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

export function ViewPanel() {
  const activeBackend = useForgeStore((s) => s.activeBackend);
  const setActiveBackend = useForgeStore((s) => s.setActiveBackend);
  const renderMode = useForgeStore((s) => s.renderMode);
  const setRenderMode = useForgeStore((s) => s.setRenderMode);
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const gridEnabled = useForgeStore((s) => s.gridEnabled);
  const gridSize = useForgeStore((s) => s.gridSize);
  const setGridEnabled = useForgeStore((s) => s.setGridEnabled);
  const setGridSize = useForgeStore((s) => s.setGridSize);
  const showPerformanceInfo = useForgeStore((s) => s.showPerformanceInfo);
  const setShowPerformanceInfo = useForgeStore((s) => s.setShowPerformanceInfo);
  const disableRunCache = useForgeStore((s) => s.disableRunCache);
  const setDisableRunCache = useForgeStore((s) => s.setDisableRunCache);
  const result = useForgeStore((s) => s.lastValidResult);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const setObjectVisibility = useForgeStore((s) => s.setObjectVisibility);
  const setObjectsVisibility = useForgeStore((s) => s.setObjectsVisibility);
  const setObjectOpacity = useForgeStore((s) => s.setObjectOpacity);
  const setObjectColor = useForgeStore((s) => s.setObjectColor);
  const selectedObjectId = useForgeStore((s) => s.selectedObjectId);
  const selectObject = useForgeStore((s) => s.selectObject);
  const focusedObjectIds = useForgeStore((s) => s.focusedObjectIds);
  const focusObject = useForgeStore((s) => s.focusObject);
  const clearFocusedObject = useForgeStore((s) => s.clearFocusedObject);
  const setConstructionGhost = useForgeStore((s) => s.setConstructionGhost);
  const setHoveredObjectId = useForgeStore((s) => s.setHoveredObjectId);
  const objectPickSyncEnabled = useForgeStore((s) => s.objectPickSyncEnabled);
  const setObjectPickSyncEnabled = useForgeStore((s) => s.setObjectPickSyncEnabled);
  const selectedConstraintId = useForgeStore((s) => s.selectedConstraintId);
  const setSelectedConstraintId = useForgeStore((s) => s.setSelectedConstraintId);
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const measureSnapPx = useForgeStore((s) => s.measureSnapPx);
  const setMeasureSnapPx = useForgeStore((s) => s.setMeasureSnapPx);
  const viewportCameraState = useForgeStore((s) => s.viewportCameraState);
  const lengthUnit = useForgeStore((s) => s.lengthUnit);
  const dimensionsVisible = useForgeStore((s) => s.dimensionsVisible);
  const toggleDimensions = useForgeStore((s) => s.toggleDimensions);
  const explodeAmount = useForgeStore((s) => s.explodeAmount);
  const setExplodeAmount = useForgeStore((s) => s.setExplodeAmount);
  const jointValues = useForgeStore((s) => s.jointValues);
  const setJointValue = useForgeStore((s) => s.setJointValue);
  const jointAnimationClip = useForgeStore((s) => s.jointAnimationClip);
  const jointAnimationProgress = useForgeStore((s) => s.jointAnimationProgress);
  const jointAnimationPlaying = useForgeStore((s) => s.jointAnimationPlaying);
  const jointAnimationSpeed = useForgeStore((s) => s.jointAnimationSpeed);
  const setJointAnimationClip = useForgeStore((s) => s.setJointAnimationClip);
  const setJointAnimationProgress = useForgeStore((s) => s.setJointAnimationProgress);
  const setJointAnimationSpeed = useForgeStore((s) => s.setJointAnimationSpeed);
  const toggleJointAnimationPlayback = useForgeStore((s) => s.toggleJointAnimationPlayback);
  const hoveredJointName = useForgeStore((s) => s.hoveredJointName);
  const setHoveredJointName = useForgeStore((s) => s.setHoveredJointName);
  const updateSketchConstraint = useForgeStore((s) => s.updateSketchConstraint);
  const selectedSurfaceIndex = useForgeStore((s) => s.selectedSurfaceIndex);
  const setSelectedSurfaceIndex = useForgeStore((s) => s.setSelectedSurfaceIndex);
  const hoveredSurfaceIndex = useForgeStore((s) => s.hoveredSurfaceIndex);
  const setHoveredSurfaceIndex = useForgeStore((s) => s.setHoveredSurfaceIndex);
  const selectedSketchEntityId = useForgeStore((s) => s.selectedSketchEntityId);
  const setSelectedSketchEntityId = useForgeStore((s) => s.setSelectedSketchEntityId);
  const surfacesVisible = useForgeStore((s) => s.surfacesVisible);
  const cutPlaneEnabled = useForgeStore((s) => s.cutPlaneEnabled);
  const setCutPlaneEnabled = useForgeStore((s) => s.setCutPlaneEnabled);
  const sectionPlaneGuidesEnabled = useForgeStore((s) => s.sectionPlaneGuidesEnabled);
  const setSectionPlaneGuidesEnabled = useForgeStore((s) => s.setSectionPlaneGuidesEnabled);
  const sectionPlaneFillEnabled = useForgeStore((s) => s.sectionPlaneFillEnabled);
  const setSectionPlaneFillEnabled = useForgeStore((s) => s.setSectionPlaneFillEnabled);
  const sectionPlaneFillOpacity = useForgeStore((s) => s.sectionPlaneFillOpacity);
  const setSectionPlaneFillOpacity = useForgeStore((s) => s.setSectionPlaneFillOpacity);
  const sectionPlaneBorderEnabled = useForgeStore((s) => s.sectionPlaneBorderEnabled);
  const setSectionPlaneBorderEnabled = useForgeStore((s) => s.setSectionPlaneBorderEnabled);
  const sectionPlaneAxisEnabled = useForgeStore((s) => s.sectionPlaneAxisEnabled);
  const setSectionPlaneAxisEnabled = useForgeStore((s) => s.setSectionPlaneAxisEnabled);
  const cutPlanes: CutPlaneDef[] = result?.cutPlanes ?? [];
  const joints = result?.jointsView?.enabled === false ? [] : (result?.jointsView?.joints ?? []);
  const jointCouplings = result?.jointsView?.enabled === false ? [] : (result?.jointsView?.couplings ?? []);
  const animationClips = result?.jointsView?.enabled === false ? [] : (result?.jointsView?.animations ?? []);
  const activeAnimationClip = useMemo(
    () => findJointAnimationClip(animationClips, jointAnimationClip),
    [animationClips, jointAnimationClip],
  );
  const animatedJointValues = useMemo(
    () => resolveJointAnimation(activeAnimationClip, jointAnimationProgress, jointValues),
    [activeAnimationClip, jointAnimationProgress, jointValues],
  );
  const displayedJointValues = useMemo(
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues, { clamp: true }),
    [animatedJointValues, jointCouplings, joints],
  );
  const displayedRawJointValues = useMemo(
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues),
    [animatedJointValues, jointCouplings, joints],
  );
  const coupledJointNames = useMemo(
    () => new Set(jointCouplings.map((coupling) => coupling.joint)),
    [jointCouplings],
  );
  const focusedObjectIdSet = useMemo(() => new Set(focusedObjectIds), [focusedObjectIds]);
  const [sceneCopyStatus, setSceneCopyStatus] = useState<string | null>(null);
  const [constraintsSectionOpen, setConstraintsSectionOpen] = useState(true);
  const sceneCopyTimeoutRef = useRef<number | null>(null);
  const cameraForward = useMemo(
    () => (viewportCameraState ? getCameraForwardVector(viewportCameraState) : null),
    [viewportCameraState],
  );
  const displayedAnimationProgress = activeAnimationClip?.loop && activeAnimationClip.continuous
    ? jointAnimationProgress - Math.floor(jointAnimationProgress)
    : Math.max(0, Math.min(1, jointAnimationProgress));

  useEffect(() => {
    if (!hoveredJointName) return;
    if (joints.some((joint) => joint.name === hoveredJointName)) return;
    setHoveredJointName(null);
  }, [hoveredJointName, joints, setHoveredJointName]);

  const objects = result?.objects ?? [];
  const cliSceneState = useMemo(
    () => (viewportCameraState ? buildViewportRenderSceneState(viewportCameraState, objects, objectSettings) : null),
    [objectSettings, objects, viewportCameraState],
  );
  const sceneObjectOverrideCount = useMemo(
    () => Object.keys(cliSceneState?.objects ?? {}).length,
    [cliSceneState],
  );
  const objectTree = useMemo(() => buildObjectTree(objects), [objects]);
  const selectedObject = objects.find((obj) => obj.id === selectedObjectId) ?? null;
  const objectItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const constraintMeta = selectedObject?.sketchMeta ?? null;
  const constraintStatusColor = constraintMeta?.status === 'over'
    ? 'var(--fc-sketchOverConstrained)'
    : constraintMeta?.status === 'over-redundant'
      ? 'var(--fc-sketchRedundant)'
      : constraintMeta?.status === 'fully'
        ? 'var(--fc-sketchFullyConstrained)'
        : constraintMeta?.status === 'under'
          ? 'var(--fc-sketchUnderConstrained)'
          : 'var(--fc-textDim)';

  useEffect(() => {
    if (!objectPickSyncEnabled || !selectedObjectId) return;
    const target = objectItemRefs.current[selectedObjectId];
    if (!target) return;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [objectPickSyncEnabled, selectedObjectId]);

  useEffect(() => {
    return () => {
      if (sceneCopyTimeoutRef.current !== null) {
        window.clearTimeout(sceneCopyTimeoutRef.current);
      }
    };
  }, []);

  const setSceneCopyFeedback = (message: string): void => {
    setSceneCopyStatus(message);
    if (sceneCopyTimeoutRef.current !== null) {
      window.clearTimeout(sceneCopyTimeoutRef.current);
    }
    sceneCopyTimeoutRef.current = window.setTimeout(() => {
      sceneCopyTimeoutRef.current = null;
      setSceneCopyStatus(null);
    }, 1800);
  };

  const copySceneCliArg = async (): Promise<void> => {
    if (!cliSceneState) return;
    const text = `--scene ${shellQuoteArg(formatRenderSceneCliSpec(cliSceneState))}`;
    try {
      await navigator.clipboard.writeText(text);
      setSceneCopyFeedback('CLI scene copied');
    } catch (err) {
      console.error('Failed to copy scene spec:', err);
      setSceneCopyFeedback('Clipboard failed');
    }
  };

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
      const isDimmedByFocus = focusedObjectIdSet.size > 0
        && !node.objectIds.some((id) => focusedObjectIdSet.has(id));
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
        ref={(element) => { objectItemRefs.current[obj.id] = element; }}
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
    <div
      style={{
        width: '100%',
        minWidth: 0,
        minHeight: 0,
        flex: 1,
        background: 'var(--fc-bgPanel)',
        borderLeft: '1px solid var(--fc-border)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--fc-borderLight)' }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--fc-text)' }}>View Panel</div>
        <div style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>Viewport control center</div>
      </div>

      <div style={{ ...sectionStyle, borderTop: 'none' }}>
        <div style={labelStyle}>Backend</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={btn(activeBackend === 'manifold')} onClick={() => setActiveBackend('manifold')}>Manifold (fast)</button>
          <button className={btn(activeBackend === 'occt')} onClick={() => setActiveBackend('occt')}>OCCT (exact)</button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Render Mode</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className={btn(renderMode === 'solid')} onClick={() => setRenderMode('solid')}>Solid</button>
          <button className={btn(renderMode === 'wireframe')} onClick={() => setRenderMode('wireframe')}>Wireframe</button>
          <button className={btn(renderMode === 'overlay')} onClick={() => setRenderMode('overlay')}>Overlay</button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Projection</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={btn(projectionMode === 'perspective')} onClick={() => setProjectionMode('perspective')}>Perspective</button>
          <button className={btn(projectionMode === 'orthographic')} onClick={() => setProjectionMode('orthographic')}>Orthographic</button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Units</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {(['mm', 'cm', 'm', 'in', 'ft'] as const).map((u) => (
            <button key={u} className={btn(lengthUnit === u)} onClick={() => useForgeStore.getState().setLengthUnit(u)}>
              {u}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Views</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button className={btn()} onClick={() => requestViewCommand({ type: 'snap', view: 'iso' })}>⌂ Home</button>
          <button className={btn()} onClick={() => requestViewCommand({ type: 'fit' })}>Fit</button>
          <button
            className={btn()}
            onClick={() => requestViewCommand({ type: 'zoom', targetId: selectedObjectId })}
            disabled={!selectedObjectId}
          >
            Zoom Sel
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {(['front', 'back', 'left', 'right', 'top', 'bottom'] as const).map((v) => (
            <button key={v} className={btn()} onClick={() => requestViewCommand({ type: 'snap', view: v })}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Camera</div>
        {viewportCameraState ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 8 }}>
              Copy this scene into the CLI to reproduce the current viewport framing and object overrides.
            </div>
            <div
              style={{
                border: '1px solid var(--fc-borderLight)',
                borderRadius: 6,
                padding: '8px 9px',
                background: 'var(--fc-bgOverlay)',
                fontFamily: 'monospace',
                fontSize: 11,
                lineHeight: 1.5,
                color: 'var(--fc-text)',
                wordBreak: 'break-word',
              }}
            >
              <div>Projection: {viewportCameraState.projectionMode}</div>
              <div>Position: {formatVector(viewportCameraState.position)}</div>
              <div>Target: {formatVector(viewportCameraState.target)}</div>
              {cameraForward && <div>Forward: {formatVector(cameraForward)}</div>}
              <div>Up: {formatVector(viewportCameraState.up)}</div>
            </div>
            <button
              className={btn()}
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => { void copySceneCliArg(); }}
            >
              Copy CLI `--scene`
            </button>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fc-textDim)' }}>
              {sceneCopyStatus ?? (
                sceneObjectOverrideCount > 0
                  ? `Includes camera + ${sceneObjectOverrideCount} object override${sceneObjectOverrideCount === 1 ? '' : 's'}.`
                  : 'Includes the live viewport camera only.'
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>
            Move the viewport once to populate the CLI camera export.
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Explode</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="range"
            min={0}
            max={120}
            step={0.5}
            value={explodeAmount}
            onChange={(e) => setExplodeAmount(Number(e.target.value))}
            style={{ flex: 1 }}
          />
          <input
            type="number"
            min={0}
            max={500}
            step={0.5}
            value={Number(explodeAmount.toFixed(2))}
            onChange={(e) => setExplodeAmount(Number(e.target.value))}
            style={{ ...inputStyle, width: 70, flex: '0 0 70px' }}
          />
        </div>
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fc-textDim)' }}>
          Uses scene hierarchy when available. Set to 0 for assembled view.
        </div>
      </div>

      {animationClips.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Animation</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select
              value={jointAnimationClip ?? ''}
              onChange={(event) => setJointAnimationClip(event.target.value || null)}
              style={inputStyle}
            >
              <option value="">Manual</option>
              {animationClips.map((clip) => (
                <option key={clip.name} value={clip.name}>{clip.name}</option>
              ))}
            </select>
            <button
              className={btn(jointAnimationPlaying)}
              onClick={toggleJointAnimationPlayback}
              disabled={!activeAnimationClip}
              title={activeAnimationClip ? 'Play or pause clip playback' : 'Select a clip first'}
            >
              {jointAnimationPlaying ? 'Pause' : 'Play'}
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={displayedAnimationProgress}
              disabled={!activeAnimationClip}
              onChange={(event) => setJointAnimationProgress(Number(event.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 36, textAlign: 'right' }}>
              {Math.round(displayedAnimationProgress * 100)}%
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <input
              type="range"
              min={0}
              max={1}
              step={0.001}
              value={animationSpeedToSlider(jointAnimationSpeed)}
              onChange={(event) => setJointAnimationSpeed(sliderToAnimationSpeed(Number(event.target.value)))}
              style={{ flex: 1 }}
              title="Playback speed multiplier (log scale: 0.01x to 4x)"
            />
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 42, textAlign: 'right' }}>
              {formatAnimationSpeed(jointAnimationSpeed)}x
            </span>
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fc-textDim)' }}>
            {activeAnimationClip
              ? `Duration ${activeAnimationClip.duration.toFixed(2)}s${activeAnimationClip.loop ? ' • Loop' : ''}${activeAnimationClip.continuous ? ' • Continuous' : ''}`
              : 'Select a clip for coordinated joint motion.'}
          </div>
        </div>
      )}

      {joints.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Joints</div>
          {joints.map((joint) => {
            const { min, max } = resolveJointRange(joint.type, joint.min, joint.max);
            const rawValue = displayedRawJointValues[joint.name] ?? joint.defaultValue;
            const clampedValue = displayedJointValues[joint.name] ?? joint.defaultValue;
            const value = Math.max(min, Math.min(max, clampedValue));
            const step = joint.type === 'prismatic' ? 0.1 : 1;
            const isCoupled = coupledJointNames.has(joint.name);

            return (
              <div
                key={joint.name}
                style={{ marginBottom: 8 }}
                onMouseEnter={() => setHoveredJointName(joint.name)}
                onMouseLeave={() => {
                  if (hoveredJointName === joint.name) setHoveredJointName(null);
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
                  <span style={{ color: 'var(--fc-text)' }}>{joint.name}</span>
                  <span style={{ color: 'var(--fc-accent)', fontFamily: 'monospace' }}>
                    {Number(rawValue.toFixed(2))}{joint.unit ? ` ${joint.unit}` : ''}{isCoupled ? ' (linked)' : ''}
                  </span>
                </div>
                <input
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value}
                  disabled={!!activeAnimationClip || isCoupled}
                  onFocus={() => setHoveredJointName(joint.name)}
                  onBlur={() => {
                    if (hoveredJointName === joint.name) setHoveredJointName(null);
                  }}
                  onChange={(event) => setJointValue(joint.name, Number(event.target.value))}
                  title={isCoupled ? 'Linked joint (driven by other joints)' : undefined}
                  style={{ width: '100%' }}
                />
              </div>
            );
          })}
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fc-textDim)' }}>
            {activeAnimationClip
              ? 'Animation clip currently drives joint values.'
              : 'Viewport-only motion. Geometry does not recompute.'}
          </div>
        </div>
      )}

      <div style={{ ...sectionStyle, paddingBottom: 0 }}>
        <div style={labelStyle}>Objects</div>
        {focusedObjectIds.length > 0 && (
          <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 8 }}>
            Focus mode on. Shift/Cmd/Ctrl + double-click toggles objects.
          </div>
        )}
      </div>
      <div
        style={{ flex: 1, minHeight: 180, overflowY: 'auto', padding: '0 12px 12px' }}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) return;
          setConstructionGhost(null);
          clearFocusedObject();
        }}
      >
        {objects.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--fc-textDim)', padding: '6px 0' }}>No objects loaded</div>
        )}
        {objectTree.map(renderObjectTreeNode)}
      </div>

      {/* Sketch Geometry Tree */}
      {constraintMeta && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Sketch Geometry</div>
          {/* Edges */}
          {(constraintMeta.edges.lines.length > 0 || constraintMeta.edges.circles.length > 0 || constraintMeta.edges.arcs.length > 0) && (
            <CollapsibleSection title="Edges" count={constraintMeta.edges.lines.length + constraintMeta.edges.circles.length + constraintMeta.edges.arcs.length}>
              {constraintMeta.edges.lines.map((line) => {
                const isSelected = selectedSketchEntityId === line.id;
                const len = Math.hypot(line.b[0] - line.a[0], line.b[1] - line.a[1]);
                return (
                  <div
                    key={line.id}
                    onClick={() => setSelectedSketchEntityId(line.id)}
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      background: isSelected ? 'rgba(74,163,255,0.15)' : 'transparent',
                      border: isSelected ? '1px solid rgba(74,163,255,0.4)' : '1px solid transparent',
                      color: isSelected ? '#4aa3ff' : 'var(--fc-text)',
                    }}
                  >
                    <span>{line.name ? <>{line.name} <span style={{ color: 'var(--fc-textDim)', fontSize: 9, opacity: 0.6 }}>{line.id}</span></> : line.id}</span>
                    <span style={{ color: 'var(--fc-textDim)', fontSize: 10 }}>{len.toFixed(1)}mm</span>
                  </div>
                );
              })}
              {constraintMeta.edges.circles.map((c) => {
                const isSelected = selectedSketchEntityId === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => setSelectedSketchEntityId(c.id)}
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      background: isSelected ? 'rgba(74,163,255,0.15)' : 'transparent',
                      border: isSelected ? '1px solid rgba(74,163,255,0.4)' : '1px solid transparent',
                      color: isSelected ? '#4aa3ff' : 'var(--fc-text)',
                    }}
                  >
                    <span>{c.name ? <>{c.name} <span style={{ color: 'var(--fc-textDim)', fontSize: 9, opacity: 0.6 }}>{c.id}</span></> : c.id}</span>
                    <span style={{ color: 'var(--fc-textDim)', fontSize: 10 }}>r={c.radius.toFixed(1)}mm</span>
                  </div>
                );
              })}
              {constraintMeta.edges.arcs.map((a) => {
                const isSelected = selectedSketchEntityId === a.id;
                return (
                  <div
                    key={a.id}
                    onClick={() => setSelectedSketchEntityId(a.id)}
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      justifyContent: 'space-between',
                      background: isSelected ? 'rgba(74,163,255,0.15)' : 'transparent',
                      border: isSelected ? '1px solid rgba(74,163,255,0.4)' : '1px solid transparent',
                      color: isSelected ? '#4aa3ff' : 'var(--fc-text)',
                    }}
                  >
                    <span>{a.name ? <>{a.name} <span style={{ color: 'var(--fc-textDim)', fontSize: 9, opacity: 0.6 }}>{a.id}</span></> : a.id}</span>
                    <span style={{ color: 'var(--fc-textDim)', fontSize: 10 }}>r={a.radius.toFixed(1)}mm</span>
                  </div>
                );
              })}
            </CollapsibleSection>
          )}
          {/* Points */}
          {constraintMeta.edges.points.length > 0 && (
            <CollapsibleSection title="Points" count={constraintMeta.edges.points.length}>
              {constraintMeta.edges.points.map((pt) => {
                const isSelected = selectedSketchEntityId === pt.id;
                return (
                  <div
                    key={pt.id}
                    onClick={() => setSelectedSketchEntityId(pt.id)}
                    style={{
                      fontSize: 11,
                      padding: '2px 6px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      background: isSelected ? 'rgba(74,163,255,0.15)' : 'transparent',
                      border: isSelected ? '1px solid rgba(74,163,255,0.4)' : '1px solid transparent',
                      color: isSelected ? '#4aa3ff' : 'var(--fc-text)',
                    }}
                  >
                    <span>{pt.id}</span>
                    {isSelected && (
                      <span style={{ color: 'var(--fc-textDim)', fontSize: 10, paddingLeft: 8 }}>({pt.pos[0].toFixed(1)}, {pt.pos[1].toFixed(1)})</span>
                    )}
                  </div>
                );
              })}
            </CollapsibleSection>
          )}
          {/* Construction */}
          {(constraintMeta.construction.lines.length > 0 || constraintMeta.construction.circles.length > 0) && (
            <CollapsibleSection title="Construction" count={constraintMeta.construction.lines.length + constraintMeta.construction.circles.length + constraintMeta.construction.arcs.length}>
              {constraintMeta.construction.lines.map((line) => (
                <div key={line.id} style={{ fontSize: 11, padding: '2px 6px', color: '#888', fontStyle: 'italic' }}>
                  {line.id}
                </div>
              ))}
              {constraintMeta.construction.circles.map((c) => (
                <div key={c.id} style={{ fontSize: 11, padding: '2px 6px', color: '#888', fontStyle: 'italic' }}>
                  {c.id} — r={c.radius.toFixed(1)}mm
                </div>
              ))}
            </CollapsibleSection>
          )}
        </div>
      )}

      {constraintMeta && (
        <div style={sectionStyle}>
          <div
            onClick={() => setConstraintsSectionOpen((v) => !v)}
            style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', userSelect: 'none' }}
          >
            <span><span style={{ fontSize: 8, marginRight: 4 }}>{constraintsSectionOpen ? '\u25BE' : '\u25B8'}</span>Constraints ({constraintMeta.constraints.length})</span>
            <span style={{ fontSize: 11, color: constraintStatusColor }}>
              {constraintMeta.status}
              {constraintMeta.dof !== 0 && (
                <span style={{ marginLeft: 4, opacity: 0.75 }}>
                  {constraintMeta.dof > 0 ? `+${constraintMeta.dof}` : constraintMeta.dof}
                </span>
              )}
            </span>
          </div>
          {constraintsSectionOpen && (<>
          {constraintMeta.timedOut && (
            <div style={{
              fontSize: 11,
              color: '#f59e0b',
              background: 'rgba(245, 158, 11, 0.1)',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              borderRadius: 4,
              padding: '4px 8px',
              marginBottom: 6,
            }}>
              Solver timed out — result may be approximate. Try simplifying constraints or using groupRect() for rigid rectangles.
            </div>
          )}
          {constraintMeta.constraints.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--fc-textDim)', padding: '6px 0' }}>No constraints in this sketch</div>
          )}
          {constraintMeta.constraints.map((constraint) => (
            <div
              key={constraint.id}
              onClick={() => setSelectedConstraintId(constraint.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                border: selectedConstraintId === constraint.id ? '1px solid #ffcc00' : '1px solid var(--fc-borderLight)',
                borderRadius: 6,
                marginBottom: 6,
                background: selectedConstraintId === constraint.id
                  ? 'rgba(255,204,0,0.15)'
                  : constraint.isConflicting ? 'var(--fc-errorBg)' : constraint.isRedundant ? `color-mix(in srgb, var(--fc-sketchRedundant) 12%, transparent)` : 'var(--fc-bgOverlay)',
                cursor: 'pointer',
              }}
            >
              <span style={{ fontSize: 11, color: constraint.isConflicting ? 'var(--fc-sketchConflicting)' : constraint.isRedundant ? 'var(--fc-sketchRedundant)' : 'var(--fc-text)', width: 48 }}>
                {constraint.label}
              </span>
              {constraint.isDimension && constraint.value !== undefined ? (
                <span style={{ fontSize: 12, color: 'var(--fc-text)' }}>{constraint.value.toFixed(2)} {lengthUnit}</span>
              ) : (
                <span style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>{constraint.type}</span>
              )}
              <span style={{ fontSize: 9, color: 'var(--fc-textDim)', marginLeft: 'auto', opacity: 0.6 }}>
                {constraint.entityIds.join(', ')}
              </span>
            </div>
          ))}
          {constraintMeta.rejected.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--fc-error)', marginBottom: 4 }}>Rejected constraints</div>
              {constraintMeta.rejected.map((constraint) => (
                <div key={constraint.id} style={{ fontSize: 11, color: 'var(--fc-error)' }} title={constraint.rejectionReason}>
                  {constraint.label}{constraint.rejectionReason ? ` — ${constraint.rejectionReason}` : ''}
                </div>
              ))}
            </div>
          )}
          </>)}
          {constraintMeta.surfaces && constraintMeta.surfaces.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 4, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Surfaces ({constraintMeta.surfaces.length})</span>
                <span
                  onClick={(e) => { e.stopPropagation(); useForgeStore.getState().toggleSurfaces(); }}
                  style={{ cursor: 'pointer', fontSize: 13, opacity: surfacesVisible ? 1 : 0.4, userSelect: 'none' }}
                  title={surfacesVisible ? 'Hide surfaces' : 'Show surfaces'}
                >{surfacesVisible ? '\u25C9' : '\u25CE'}</span>
              </div>
              {constraintMeta.surfaces.map((s) => {
                const palette = ['#4488cc', '#44cc88', '#cc8844', '#cc44aa', '#88cc44', '#44aacc', '#aa44cc', '#cccc44'];
                const color = palette[s.index % palette.length];
                const isSelected = selectedSurfaceIndex === s.index;
                const isHovered = hoveredSurfaceIndex === s.index;
                return (
                  <div
                    key={s.index}
                    onClick={() => setSelectedSurfaceIndex(s.index)}
                    onMouseEnter={() => setHoveredSurfaceIndex(s.index)}
                    onMouseLeave={() => setHoveredSurfaceIndex(null)}
                    style={{
                      fontSize: 11,
                      color: 'var(--fc-text)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2,
                      padding: '4px 6px',
                      marginBottom: 3,
                      borderRadius: 4,
                      cursor: 'pointer',
                      border: isSelected ? `1px solid ${color}` : '1px solid transparent',
                      background: isSelected ? `${color}22` : isHovered ? 'var(--fc-bgOverlay)' : 'transparent',
                      transition: 'all 0.1s',
                    }}
                  >
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0, opacity: isSelected ? 1 : 0.7 }} />
                      <span style={{ fontWeight: isSelected ? 600 : 400 }}>S{s.index} — {formatArea(s.area, lengthUnit, 1)}</span>
                    </div>
                    {isSelected && (
                      <div style={{ fontSize: 10, color: 'var(--fc-textDim)', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 1 }}>
                        <span>Centroid: ({s.centroid[0].toFixed(2)}, {s.centroid[1].toFixed(2)})</span>
                        <span>Bounds: [{s.bounds.min[0].toFixed(1)}, {s.bounds.min[1].toFixed(1)}] → [{s.bounds.max[0].toFixed(1)}, {s.bounds.max[1].toFixed(1)}]</span>
                        <span>Seed: ({s.seed[0].toFixed(2)}, {s.seed[1].toFixed(2)})</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {/* Selected entity info — show constraints referencing this entity */}
          {selectedSketchEntityId && constraintMeta && (() => {
            const relatedConstraints = constraintMeta.constraints.filter(
              (c) => c.entityIds.includes(selectedSketchEntityId)
            );
            if (relatedConstraints.length === 0) return null;
            return (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 4 }}>
                  Constraints on {selectedSketchEntityId} ({relatedConstraints.length})
                </div>
                {relatedConstraints.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => { setSelectedConstraintId(c.id); }}
                    style={{
                      fontSize: 11,
                      padding: '3px 6px',
                      marginBottom: 2,
                      borderRadius: 4,
                      cursor: 'pointer',
                      color: c.isConflicting ? 'var(--fc-error)' : c.isRedundant ? '#faad14' : 'var(--fc-text)',
                      background: selectedConstraintId === c.id ? 'rgba(255,204,0,0.15)' : 'transparent',
                      border: selectedConstraintId === c.id ? '1px solid #ffcc00' : '1px solid transparent',
                    }}
                  >
                    {c.label} {c.isDimension && c.value !== undefined ? `= ${c.value}` : c.type}
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      )}

      {selectedObject?.shape && (
        <ConstructionTreePanel key={selectedObject.id} objectId={selectedObject.id} shape={selectedObject.shape} />
      )}

      <div style={sectionStyle}>
        <div style={labelStyle}>Display</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input
              type="checkbox"
              checked={gridEnabled}
              onChange={(e) => setGridEnabled(e.target.checked)}
            />
            Show grid
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input
              type="checkbox"
              checked={dimensionsVisible}
              onChange={toggleDimensions}
            />
            Show dimensions
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input
              type="checkbox"
              checked={showPerformanceInfo}
              onChange={(e) => setShowPerformanceInfo(e.target.checked)}
            />
            Show performance info
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input
              type="checkbox"
              checked={disableRunCache}
              onChange={(e) => setDisableRunCache(e.target.checked)}
            />
            Disable run cache
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input
              type="checkbox"
              checked={objectPickSyncEnabled}
              onChange={(e) => setObjectPickSyncEnabled(e.target.checked)}
            />
            Scene pick sync + labels
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>Grid size</span>
          <input
            type="number"
            min={1}
            max={200}
            value={gridSize}
            onChange={(e) => setGridSize(Math.max(1, Number(e.target.value) || 1))}
            style={inputStyle}
          />
        </div>
      </div>

      {cutPlanes.length > 0 && (
        <div style={sectionStyle}>
          <div style={labelStyle}>Cut Planes</div>
          {cutPlanes.map((cp) => (
            <div key={cp.name} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
                <input
                  type="checkbox"
                  checked={cutPlaneEnabled[cp.name] ?? false}
                  onChange={(e) => setCutPlaneEnabled(cp.name, e.target.checked)}
                />
                ✂ {cp.name}
              </label>
            </div>
          ))}
          <div style={{ borderTop: '1px solid var(--fc-borderLight)', margin: '8px 0 6px' }} />
          <div style={{ fontSize: 11, color: 'var(--fc-textDim)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Section Visuals
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
              <input
                type="checkbox"
                checked={sectionPlaneGuidesEnabled}
                onChange={(e) => setSectionPlaneGuidesEnabled(e.target.checked)}
              />
              Show guides
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
              <input
                type="checkbox"
                checked={sectionPlaneFillEnabled}
                onChange={(e) => setSectionPlaneFillEnabled(e.target.checked)}
                disabled={!sectionPlaneGuidesEnabled}
              />
              Fill
            </label>
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', marginLeft: 'auto' }}>Opacity</span>
            <input
              type="range"
              min={0.05}
              max={0.9}
              step={0.05}
              value={sectionPlaneFillOpacity}
              onChange={(e) => setSectionPlaneFillOpacity(Number(e.target.value))}
              disabled={!sectionPlaneGuidesEnabled || !sectionPlaneFillEnabled}
              style={{ flex: 1, maxWidth: 90 }}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
              <input
                type="checkbox"
                checked={sectionPlaneBorderEnabled}
                onChange={(e) => setSectionPlaneBorderEnabled(e.target.checked)}
                disabled={!sectionPlaneGuidesEnabled}
              />
              Border
            </label>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
              <input
                type="checkbox"
                checked={sectionPlaneAxisEnabled}
                onChange={(e) => setSectionPlaneAxisEnabled(e.target.checked)}
                disabled={!sectionPlaneGuidesEnabled}
              />
              Normal axis
            </label>
          </div>
        </div>
      )}

      <div style={sectionStyle}>
        <div style={labelStyle}>Measure</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>Snap radius (px)</span>
          <input
            type="number"
            min={4}
            max={40}
            value={measureSnapPx}
            onChange={(e) => setMeasureSnapPx(Math.max(4, Math.min(40, Number(e.target.value) || 4)))}
            style={inputStyle}
          />
        </div>
      </div>
    </div>
  );
}

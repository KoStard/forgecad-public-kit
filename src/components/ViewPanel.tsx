import { useForgeStore } from '../store/forgeStore';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CutPlaneDef } from '@forge/cutPlane';
import { findJointAnimationClip, resolveJointAnimation } from '@forge/jointAnimation';
import { resolveJointViewValues } from '@forge/jointsView';
import { animationSpeedToSlider, formatAnimationSpeed, sliderToAnimationSpeed } from '../animationSpeed';
import { formatCameraCliSpec, getCameraForwardVector } from '../capture/cameraState';

const btnStyle = (active = false): CSSProperties => ({
  padding: '4px 8px',
  background: active ? 'var(--fc-accent)' : 'transparent',
  color: active ? 'var(--fc-accentText)' : 'var(--fc-textMuted)',
  border: '1px solid var(--fc-border)',
  borderRadius: 3,
  cursor: 'pointer',
  fontSize: 12,
});

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

export function ViewPanel() {
  const renderMode = useForgeStore((s) => s.renderMode);
  const setRenderMode = useForgeStore((s) => s.setRenderMode);
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const gridEnabled = useForgeStore((s) => s.gridEnabled);
  const gridSize = useForgeStore((s) => s.gridSize);
  const setGridEnabled = useForgeStore((s) => s.setGridEnabled);
  const setGridSize = useForgeStore((s) => s.setGridSize);
  const result = useForgeStore((s) => s.result);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const setObjectVisibility = useForgeStore((s) => s.setObjectVisibility);
  const setObjectOpacity = useForgeStore((s) => s.setObjectOpacity);
  const setObjectColor = useForgeStore((s) => s.setObjectColor);
  const selectedObjectId = useForgeStore((s) => s.selectedObjectId);
  const selectObject = useForgeStore((s) => s.selectObject);
  const focusedObjectIds = useForgeStore((s) => s.focusedObjectIds);
  const focusObject = useForgeStore((s) => s.focusObject);
  const clearFocusedObject = useForgeStore((s) => s.clearFocusedObject);
  const setHoveredObjectId = useForgeStore((s) => s.setHoveredObjectId);
  const objectPickSyncEnabled = useForgeStore((s) => s.objectPickSyncEnabled);
  const setObjectPickSyncEnabled = useForgeStore((s) => s.setObjectPickSyncEnabled);
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const measureSnapPx = useForgeStore((s) => s.measureSnapPx);
  const setMeasureSnapPx = useForgeStore((s) => s.setMeasureSnapPx);
  const viewportCameraState = useForgeStore((s) => s.viewportCameraState);
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
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues),
    [animatedJointValues, jointCouplings, joints],
  );
  const displayedRawJointValues = useMemo(
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues, { clamp: false }),
    [animatedJointValues, jointCouplings, joints],
  );
  const coupledJointNames = useMemo(
    () => new Set(jointCouplings.map((coupling) => coupling.joint)),
    [jointCouplings],
  );
  const focusedObjectIdSet = useMemo(() => new Set(focusedObjectIds), [focusedObjectIds]);
  const [cameraCopyStatus, setCameraCopyStatus] = useState<string | null>(null);
  const cameraCopyTimeoutRef = useRef<number | null>(null);
  const cameraForward = useMemo(
    () => (viewportCameraState ? getCameraForwardVector(viewportCameraState) : null),
    [viewportCameraState],
  );

  useEffect(() => {
    if (!hoveredJointName) return;
    if (joints.some((joint) => joint.name === hoveredJointName)) return;
    setHoveredJointName(null);
  }, [hoveredJointName, joints, setHoveredJointName]);

  const objects = result?.objects ?? [];
  const selectedObject = objects.find((obj) => obj.id === selectedObjectId) ?? null;
  const objectItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const constraintMeta = selectedObject?.sketchMeta ?? null;
  const constraintStatusColor = constraintMeta?.status === 'over'
    ? '#ff4d4f'
    : constraintMeta?.status === 'fully'
      ? '#35c759'
      : constraintMeta?.status === 'under'
        ? '#4aa3ff'
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
      if (cameraCopyTimeoutRef.current !== null) {
        window.clearTimeout(cameraCopyTimeoutRef.current);
      }
    };
  }, []);

  const setCameraCopyFeedback = (message: string): void => {
    setCameraCopyStatus(message);
    if (cameraCopyTimeoutRef.current !== null) {
      window.clearTimeout(cameraCopyTimeoutRef.current);
    }
    cameraCopyTimeoutRef.current = window.setTimeout(() => {
      cameraCopyTimeoutRef.current = null;
      setCameraCopyStatus(null);
    }, 1800);
  };

  const copyCameraCliArg = async (): Promise<void> => {
    if (!viewportCameraState) return;
    const text = `--camera "${formatCameraCliSpec(viewportCameraState)}"`;
    try {
      await navigator.clipboard.writeText(text);
      setCameraCopyFeedback('CLI camera copied');
    } catch (err) {
      console.error('Failed to copy camera spec:', err);
      setCameraCopyFeedback('Clipboard failed');
    }
  };

  return (
    <div
      style={{
        width: 280,
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
        <div style={labelStyle}>Render Mode</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button style={btnStyle(renderMode === 'solid')} onClick={() => setRenderMode('solid')}>Solid</button>
          <button style={btnStyle(renderMode === 'wireframe')} onClick={() => setRenderMode('wireframe')}>Wireframe</button>
          <button style={btnStyle(renderMode === 'overlay')} onClick={() => setRenderMode('overlay')}>Overlay</button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Projection</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button style={btnStyle(projectionMode === 'perspective')} onClick={() => setProjectionMode('perspective')}>Perspective</button>
          <button style={btnStyle(projectionMode === 'orthographic')} onClick={() => setProjectionMode('orthographic')}>Orthographic</button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Views</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button style={btnStyle()} onClick={() => requestViewCommand({ type: 'snap', view: 'iso' })}>⌂ Home</button>
          <button style={btnStyle()} onClick={() => requestViewCommand({ type: 'fit' })}>Fit</button>
          <button
            style={btnStyle()}
            onClick={() => requestViewCommand({ type: 'zoom', targetId: selectedObjectId })}
            disabled={!selectedObjectId}
          >
            Zoom Sel
          </button>
        </div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 6 }}>
          {(['front', 'back', 'left', 'right', 'top', 'bottom'] as const).map((v) => (
            <button key={v} style={btnStyle()} onClick={() => requestViewCommand({ type: 'snap', view: v })}>
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
              Copy this pose into the CLI to reproduce the current viewport framing.
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
              style={{ ...btnStyle(), width: '100%', marginTop: 8 }}
              onClick={() => { void copyCameraCliArg(); }}
            >
              Copy CLI `--camera`
            </button>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fc-textDim)' }}>
              {cameraCopyStatus ?? 'Tracks the live viewport camera.'}
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
          Always on. Set to 0 for assembled view.
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
              style={btnStyle(jointAnimationPlaying)}
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
              value={jointAnimationProgress}
              disabled={!activeAnimationClip}
              onChange={(event) => setJointAnimationProgress(Number(event.target.value))}
              style={{ flex: 1 }}
            />
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 36, textAlign: 'right' }}>
              {Math.round(jointAnimationProgress * 100)}%
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
              ? `Duration ${activeAnimationClip.duration.toFixed(2)}s${activeAnimationClip.loop ? ' • Loop' : ''}`
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
        style={{ flex: 1, overflowY: 'auto', padding: '0 12px 12px' }}
        onDoubleClick={(event) => {
          if (event.target !== event.currentTarget) return;
          clearFocusedObject();
        }}
      >
        {objects.length === 0 && (
          <div style={{ fontSize: 12, color: 'var(--fc-textDim)', padding: '6px 0' }}>No objects loaded</div>
        )}
        {objects.map((obj) => {
          const settings = objectSettings[obj.id] ?? { visible: true, opacity: 1, color: '#5b9bd5' };
          const isSelected = selectedObjectId === obj.id;
          const isFocused = focusedObjectIdSet.has(obj.id);
          const isDimmedByFocus = focusedObjectIdSet.size > 0 && !isFocused;
          return (
            <div
              key={obj.id}
              ref={(node) => { objectItemRefs.current[obj.id] = node; }}
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
                <input
                  type="checkbox"
                  checked={settings.visible}
                  onChange={(e) => setObjectVisibility(obj.id, e.target.checked)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                />
                <span style={{ fontSize: 12, color: 'var(--fc-text)', flex: 1 }}>{obj.name}</span>
                <input
                  type="color"
                  value={settings.color}
                  onChange={(e) => setObjectColor(obj.id, e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
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
                  onChange={(e) => setObjectOpacity(obj.id, Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  onDoubleClick={(e) => e.stopPropagation()}
                  style={{ flex: 1 }}
                />
                <span style={{ fontSize: 11, color: 'var(--fc-textDim)', width: 32, textAlign: 'right' }}>{Math.round(settings.opacity * 100)}%</span>
              </div>
            </div>
          );
        })}
      </div>

      {constraintMeta && (
        <div style={sectionStyle}>
          <div style={{ ...labelStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Constraints</span>
            <span style={{ fontSize: 11, color: constraintStatusColor }}>{constraintMeta.status}</span>
          </div>
          {constraintMeta.constraints.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--fc-textDim)', padding: '6px 0' }}>No constraints in this sketch</div>
          )}
          {constraintMeta.constraints.map((constraint) => (
            <div
              key={constraint.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                border: '1px solid var(--fc-borderLight)',
                borderRadius: 6,
                marginBottom: 6,
                background: constraint.isConflicting ? 'var(--fc-errorBg)' : 'var(--fc-bgOverlay)',
              }}
            >
              <span style={{ fontSize: 11, color: constraint.isConflicting ? 'var(--fc-error)' : 'var(--fc-text)', width: 48 }}>
                {constraint.label}
              </span>
              {constraint.isDimension && constraint.value !== undefined ? (
                <input
                  type="number"
                  value={constraint.value}
                  onChange={(e) => {
                    const nextValue = Number(e.target.value);
                    if (Number.isNaN(nextValue) || !selectedObject) return;
                    updateSketchConstraint(selectedObject.id, constraint.id, nextValue);
                  }}
                  style={inputStyle}
                />
              ) : (
                <span style={{ fontSize: 12, color: 'var(--fc-textDim)' }}>{constraint.type}</span>
              )}
            </div>
          ))}
          {constraintMeta.rejected.length > 0 && (
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--fc-error)', marginBottom: 4 }}>Rejected constraints</div>
              {constraintMeta.rejected.map((constraint) => (
                <div key={constraint.id} style={{ fontSize: 11, color: 'var(--fc-error)' }}>
                  {constraint.label}
                </div>
              ))}
            </div>
          )}
        </div>
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

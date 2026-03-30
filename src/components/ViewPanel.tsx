import type { CSSProperties } from 'react';
import { useForgeStore } from '../store/forgeStore';
import { ConstructionTreePanel } from './ConstructionTreePanel';
import { ConstraintPanel } from './viewport/ConstraintPanel';
import { JointControls } from './viewport/JointControls';
import { ObjectTree } from './viewport/ObjectTree';
import { useViewPanelState } from './viewport/useViewPanelState';

const btn = (active = false) => `fc-btn${active ? ' active' : ''}`;

const AXIS_PRESETS: { label: string; normal: [number, number, number] }[] = [
  { label: 'X', normal: [1, 0, 0] },
  { label: 'Y', normal: [0, 1, 0] },
  { label: 'Z', normal: [0, 0, 1] },
];

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

const formatVector = (value: [number, number, number]): string => value.map((entry) => entry.toFixed(3)).join(', ');

export function ViewPanel() {
  const state = useViewPanelState();

  const {
    activeBackend,
    setActiveBackend,
    runQuality,
    setRunQuality,
    renderMode,
    setRenderMode,
    projectionMode,
    setProjectionMode,
    gridEnabled,
    gridSize,
    setGridEnabled,
    setGridSize,
    showPerformanceInfo,
    setShowPerformanceInfo,
    disableRunCache,
    setDisableRunCache,
    objectSettings,
    setObjectVisibility,
    setObjectsVisibility,
    setObjectOpacity,
    setObjectColor,
    selectedObjectId,
    selectObject,
    focusedObjectIds,
    focusObject,
    clearFocusedObject,
    setConstructionGhost,
    setHoveredObjectId,
    objectPickSyncEnabled,
    setObjectPickSyncEnabled,
    selectedConstraintId,
    setSelectedConstraintId,
    requestViewCommand,
    measureSnapPx,
    setMeasureSnapPx,
    viewportCameraState,
    lengthUnit,
    dimensionsVisible,
    toggleDimensions,
    explodeAmount,
    setExplodeAmount,
    jointValues,
    setJointValue,
    jointAnimationClip,
    jointAnimationProgress,
    jointAnimationPlaying,
    jointAnimationSpeed,
    setJointAnimationClip,
    setJointAnimationProgress,
    setJointAnimationSpeed,
    toggleJointAnimationPlayback,
    hoveredJointName,
    setHoveredJointName,
    selectedSurfaceIndex,
    setSelectedSurfaceIndex,
    hoveredSurfaceIndex,
    setHoveredSurfaceIndex,
    selectedSketchEntityId,
    setSelectedSketchEntityId,
    surfacesVisible,
    cutPlaneEnabled,
    setCutPlaneEnabled,
    sectionPlaneGuidesEnabled,
    setSectionPlaneGuidesEnabled,
    sectionPlaneFillEnabled,
    setSectionPlaneFillEnabled,
    sectionPlaneFillOpacity,
    setSectionPlaneFillOpacity,
    sectionPlaneBorderEnabled,
    setSectionPlaneBorderEnabled,
    sectionPlaneAxisEnabled,
    setSectionPlaneAxisEnabled,
    sectionExplorerEnabled,
    setSectionExplorerEnabled,
    sectionExplorerNormal,
    resetSectionExplorerPlane,
    sectionExplorerFlip,
    setSectionExplorerFlip,
    cutPlanes,
    joints,
    animationClips,
    activeAnimationClip,
    displayedAnimationProgress,
    displayedJointValues,
    displayedRawJointValues,
    coupledJointNames,
    focusedObjectIdSet,
    sceneCopyStatus,
    cameraForward,
    objects,
    sceneObjectOverrideCount,
    selectedObject,
    objectItemRefs,
    constraintMeta,
    constraintStatusColor,
    copySceneCliArg,
  } = state;

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
          <button className={btn(activeBackend === 'manifold')} onClick={() => setActiveBackend('manifold')}>
            Manifold (fast)
          </button>
          <button className={btn(activeBackend === 'occt')} onClick={() => setActiveBackend('occt')}>
            OCCT (exact)
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Quality</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={btn(runQuality === 'live')} onClick={() => setRunQuality('live')}>
            Live
          </button>
          <button className={btn(runQuality === 'default')} onClick={() => setRunQuality('default')}>
            Default
          </button>
          <button className={btn(runQuality === 'high')} onClick={() => setRunQuality('high')}>
            High
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Render Mode</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className={btn(renderMode === 'solid')} onClick={() => setRenderMode('solid')}>
            Solid
          </button>
          <button className={btn(renderMode === 'wireframe')} onClick={() => setRenderMode('wireframe')}>
            Wireframe
          </button>
          <button className={btn(renderMode === 'overlay')} onClick={() => setRenderMode('overlay')}>
            Overlay
          </button>
        </div>
      </div>

      <div style={sectionStyle}>
        <div style={labelStyle}>Projection</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className={btn(projectionMode === 'perspective')} onClick={() => setProjectionMode('perspective')}>
            Perspective
          </button>
          <button className={btn(projectionMode === 'orthographic')} onClick={() => setProjectionMode('orthographic')}>
            Orthographic
          </button>
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
          <button className={btn()} onClick={() => requestViewCommand({ type: 'snap', view: 'iso' })}>
            ⌂ Home
          </button>
          <button className={btn()} onClick={() => requestViewCommand({ type: 'fit' })}>
            Fit
          </button>
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
              onClick={() => {
                void copySceneCliArg();
              }}
            >
              Copy CLI `--scene`
            </button>
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--fc-textDim)' }}>
              {sceneCopyStatus ??
                (sceneObjectOverrideCount > 0
                  ? `Includes camera + ${sceneObjectOverrideCount} object override${sceneObjectOverrideCount === 1 ? '' : 's'}.`
                  : 'Includes the live viewport camera only.')}
            </div>
          </>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--fc-textDim)' }}>Move the viewport once to populate the CLI camera export.</div>
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

      <JointControls
        joints={joints}
        animationClips={animationClips}
        jointAnimationClip={jointAnimationClip}
        jointAnimationPlaying={jointAnimationPlaying}
        jointAnimationSpeed={jointAnimationSpeed}
        activeAnimationClip={activeAnimationClip}
        displayedAnimationProgress={displayedAnimationProgress}
        displayedJointValues={displayedJointValues}
        displayedRawJointValues={displayedRawJointValues}
        coupledJointNames={coupledJointNames}
        hoveredJointName={hoveredJointName}
        setJointAnimationClip={setJointAnimationClip}
        setJointAnimationProgress={setJointAnimationProgress}
        setJointAnimationSpeed={setJointAnimationSpeed}
        toggleJointAnimationPlayback={toggleJointAnimationPlayback}
        setJointValue={setJointValue}
        setHoveredJointName={setHoveredJointName}
      />

      <div style={{ ...sectionStyle, paddingBottom: 0 }}>
        <div style={labelStyle}>Objects</div>
      </div>
      <ObjectTree
        objects={objects}
        objectItemRefs={objectItemRefs}
        focusedObjectIdSet={focusedObjectIdSet}
        selectedObjectId={selectedObjectId}
        objectSettings={objectSettings}
        setObjectVisibility={setObjectVisibility}
        setObjectsVisibility={setObjectsVisibility}
        setObjectOpacity={setObjectOpacity}
        setObjectColor={setObjectColor}
        selectObject={selectObject}
        focusObject={focusObject}
        clearFocusedObject={clearFocusedObject}
        setHoveredObjectId={setHoveredObjectId}
        setConstructionGhost={setConstructionGhost}
      />

      <ConstraintPanel
        constraintMeta={constraintMeta}
        constraintStatusColor={constraintStatusColor}
        selectedConstraintId={selectedConstraintId}
        setSelectedConstraintId={setSelectedConstraintId}
        selectedSketchEntityId={selectedSketchEntityId}
        setSelectedSketchEntityId={setSelectedSketchEntityId}
        surfacesVisible={surfacesVisible}
        selectedSurfaceIndex={selectedSurfaceIndex}
        setSelectedSurfaceIndex={setSelectedSurfaceIndex}
        hoveredSurfaceIndex={hoveredSurfaceIndex}
        setHoveredSurfaceIndex={setHoveredSurfaceIndex}
        lengthUnit={lengthUnit}
      />

      {selectedObject?.shape && <ConstructionTreePanel key={selectedObject.id} objectId={selectedObject.id} shape={selectedObject.shape} />}

      <div style={sectionStyle}>
        <div style={labelStyle}>Display</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input type="checkbox" checked={gridEnabled} onChange={(e) => setGridEnabled(e.target.checked)} />
            Show grid
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input type="checkbox" checked={dimensionsVisible} onChange={toggleDimensions} />
            Show dimensions
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input type="checkbox" checked={showPerformanceInfo} onChange={(e) => setShowPerformanceInfo(e.target.checked)} />
            Show performance info
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input type="checkbox" checked={disableRunCache} onChange={(e) => setDisableRunCache(e.target.checked)} />
            Disable run cache
          </label>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input type="checkbox" checked={objectPickSyncEnabled} onChange={(e) => setObjectPickSyncEnabled(e.target.checked)} />
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

      <div style={sectionStyle}>
        <div style={labelStyle}>Section Explorer</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
            <input type="checkbox" checked={sectionExplorerEnabled} onChange={(e) => setSectionExplorerEnabled(e.target.checked)} />
            Enable clipping plane
          </label>
        </div>
        {sectionExplorerEnabled && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: 'var(--fc-textDim)', minWidth: 36 }}>Axis</span>
              {AXIS_PRESETS.map(({ label, normal }) => {
                const isActive =
                  sectionExplorerNormal[0] === normal[0] &&
                  sectionExplorerNormal[1] === normal[1] &&
                  sectionExplorerNormal[2] === normal[2];
                return (
                  <button
                    key={label}
                    className={btn(isActive)}
                    style={{ padding: '2px 8px', fontSize: 11, minWidth: 28 }}
                    onClick={() => resetSectionExplorerPlane(normal)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fc-text)' }}>
                <input type="checkbox" checked={sectionExplorerFlip} onChange={(e) => setSectionExplorerFlip(e.target.checked)} />
                Flip direction
              </label>
            </div>
          </>
        )}
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
              <input type="checkbox" checked={sectionPlaneGuidesEnabled} onChange={(e) => setSectionPlaneGuidesEnabled(e.target.checked)} />
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

import { formatCoord, formatLength } from '@forge/units';
import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { LocalStudioEnvironment } from './viewport/LocalStudioEnvironment';
import {
  MOUSE_BUTTONS_3D,
  MOUSE_BUTTONS_DRAW,
  MOUSE_BUTTONS_SKETCH,
  TOUCH_GESTURES_3D,
  TOUCH_GESTURES_SKETCH,
} from '../capture/controlsConfig';
import { themes } from '../theme';
import { useForgeStore } from '../store/forgeStore';
import { DrawCanvas } from './DrawCanvas';
import { DrawToolbar } from './DrawToolbar';
import { SceneConfigurator } from './SceneConfigurator';
import { ClippingManager } from './viewport/ClippingManager';
import { ConstructionGhostOverlay } from './viewport/ConstructionGhostOverlay';
import { ControlsInteractionBridge, OrbitGifExporterBridge } from './viewport/ControlsBridge';
import { DebugHighlightsOverlay } from './viewport/DebugHighlights';
import { DimensionAnnotation } from './viewport/DimensionAnnotation';
import { EvaluationIndicator } from './viewport/EvaluationIndicator';
import { ForgeObject } from './viewport/ForgeObject';
import { HoveredJointOverlay } from './viewport/HoveredJointOverlay';
import { LabeledAxes } from './viewport/LabeledAxes';
import { MeasureInfoPanel, MeasureTool } from './viewport/MeasureTool';
import { PerformanceInfoPanel, PerformanceInfoSampler } from './viewport/PerformanceInfo';
import { SectionExplorerGizmo } from './viewport/SectionExplorerGizmo';
import { SectionPlaneGuides } from './viewport/SectionPlane';
import { SketchObject } from './viewport/SketchObject';
import { ToolpathObject } from './viewport/ToolpathObject';
import { ZoomIndicatorPanel, ZoomSampler } from './viewport/ZoomIndicator';
import { FOCUS_MODE_DIM_OPACITY, OBJECT_CONTEXT_MENU_MARGIN, OBJECT_CONTEXT_MENU_WIDTH } from './viewport/types';
import { ViewController, ViewManager, ViewPersistence } from './viewport/ViewController';
import { useViewportState } from './viewport/useViewportState';
import { useViewportHandlers } from './viewport/useViewportHandlers';
import { SvgPreview } from './SvgPreview';

export function Viewport() {
  const activeFile = useForgeStore((s) => s.activeFile);
  const isSvgActive = !!activeFile && activeFile.toLowerCase().endsWith('.svg');
  const state = useViewportState();

  const {
    measureMode,
    isEvaluating,
    evaluationPhase,
    renderMode,
    projectionMode,
    gridEnabled,
    gridSize,
    showPerformanceInfo,
    objectSettings,
    setObjectVisibility,
    hoveredObjectId,
    setHoveredObjectId,
    selectObject,
    focusedObjectIds,
    focusObject,
    clearFocusedObject,
    objectPickSyncEnabled,
    viewCommand,
    requestViewCommand,
    clearViewCommand,
    lengthUnit,
    constructionGhost,
    objects,
    dimensions,
    debugHighlights3D,
    dimensionsVisible,
    sectionPlaneGuidesEnabled,
    sectionPlaneFillEnabled,
    sectionPlaneFillOpacity,
    sectionPlaneBorderEnabled,
    sectionPlaneAxisEnabled,
    sectionExplorerEnabled,
    drawFlagEnabled,
    drawModeActive,
    shapeHighlightByIndex,
    activeCutPlaneDefs,
    scriptCutPlaneDefs,
    objectCutPlanesById,
    objectClippingPlanesById,
    hasAnyObjectCutPlanes,
    objectMatrices,
    constructionGhostMatrix,
    joints,
    activeJointAnimation,
    effectiveJointValues,
    sectionGuideSize,
    hoveredJointOverlay,
    jointOverlayConfig,
    isSketchOnly,
    sceneConfig,
    focusedObjectIdSet,
    visibleSceneObjectCount,
    visibleModelTriangles,
    toolpathProgress,
    setToolpathProgress,
    performanceInfo,
    setPerformanceInfo,
    reactRenderCountRef,
    defaultLightsOverridden,
    defaultEnvironmentOverridden,
    handleDefaultLightsOverridden,
    handleDefaultEnvironmentOverridden,
    themeName,
    previewFile,
    knownFileNames,
  } = state;

  const [viewPersistenceResolved, setViewPersistenceResolved] = useState(false);
  const [isViewportInteracting, setIsViewportInteracting] = useState(false);
  const [zoomMmPerPx, setZoomMmPerPx] = useState<number | null>(null);
  const [hoverLabel, setHoverLabel] = useState<{ id: string; name: string; x: number; y: number } | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const initialFitRequestedRef = useRef(false);
  const prevPreviewFileRef = useRef<string | null | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);

  const t = themes[themeName];
  const canvasDpr: number | [number, number] = isViewportInteracting ? 1 : [1, 2];

  const handlers = useViewportHandlers({
    containerRef,
    contextMenuRef,
    measureMode,
    isViewportInteracting,
    objectPickSyncEnabled,
    hoveredObjectId,
    knownFileNames,
    objects,
    selectObject,
    focusObject,
    clearFocusedObject,
    setHoveredObjectId,
    setHoverLabel,
    setObjectVisibility,
    requestViewCommand,
    viewPersistenceResolved,
    viewCommand,
    previewFile,
    initialFitRequestedRef,
    prevPreviewFileRef,
    setPerformanceInfo,
  });

  const {
    objectContextMenu,
    closeObjectContextMenu,
    faceInfoPanel,
    setFaceInfoPanel,
    faceInfoData,
    faceInfoLoading,
    sketchEntityInfo,
    setSketchEntityInfo,
    updateHoverLabel,
    clearHoverLabel,
    handleObjectClick,
    handleObjectDoubleClick,
    handleObjectContextMenu,
    handleHideObject,
    handleGetFaceInfo,
    handleSketchEntityClick,
    handleViewportPointerMissed,
    handlePerformanceInfoChange,
    handleViewPersistenceResolved: handleViewPersistenceResolvedFromHandlers,
  } = handlers;

  const handleViewPersistenceResolved = (restored: boolean) => {
    handleViewPersistenceResolvedFromHandlers(restored);
    setViewPersistenceResolved(true);
  };

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {isSvgActive && <SvgPreview />}
      <Canvas
        style={{ background: t.viewportBg, cursor: measureMode ? 'crosshair' : 'default' }}
        dpr={canvasDpr}
        gl={{
          antialias: true,
          logarithmicDepthBuffer: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.0,
        }}
        raycaster={{ params: { Line: { threshold: 0.5 } } } as any}
        camera={{ up: [0, 0, 1] }}
        onPointerMissed={handleViewportPointerMissed}
      >
        {projectionMode === 'orthographic' ? (
          <OrthographicCamera makeDefault position={[120, 80, 120]} zoom={2} near={-50000} far={50000} up={[0, 0, 1]} />
        ) : (
          <PerspectiveCamera makeDefault position={[120, 80, 120]} fov={45} near={0.1} far={100000} up={[0, 0, 1]} />
        )}

        {/* Scene configurator — applies script scene() settings */}
        {sceneConfig && (
          <SceneConfigurator
            config={sceneConfig}
            onDefaultLightsOverridden={handleDefaultLightsOverridden}
            onDefaultEnvironmentOverridden={handleDefaultEnvironmentOverridden}
          />
        )}

        {/* Default environment map (offline-safe) — hidden when script overrides */}
        {!defaultEnvironmentOverridden && <LocalStudioEnvironment />}
        {/* Default lights — hidden when script provides custom lights */}
        {!defaultLightsOverridden && (
          <>
            <ambientLight intensity={0.3} />
            <directionalLight position={[100, 150, 80]} intensity={1.2} castShadow />
            <directionalLight position={[-60, -40, -80]} intensity={0.3} />
            <hemisphereLight args={['#b1e1ff', '#444444', 0.4]} />
          </>
        )}

        <ClippingManager active={hasAnyObjectCutPlanes} />
        {sectionExplorerEnabled && <SectionExplorerGizmo size={sectionGuideSize} />}
        {sectionPlaneGuidesEnabled && activeCutPlaneDefs.length > 0 && (
          <SectionPlaneGuides
            cutPlanes={scriptCutPlaneDefs}
            sectionSize={sectionGuideSize}
            style={{
              showFill: sectionPlaneFillEnabled,
              fillOpacity: sectionPlaneFillOpacity,
              showBorder: sectionPlaneBorderEnabled,
              showAxis: sectionPlaneAxisEnabled,
            }}
          />
        )}

        {objects.map((obj, objIndex) => {
          const settings = objectSettings[obj.id] ?? { visible: true, opacity: 1, color: '#5b9bd5' };
          const isDimmedByFocus = focusedObjectIdSet.size > 0 && !focusedObjectIdSet.has(obj.id);
          const isDimmedByGhost = constructionGhost !== null && obj.id !== constructionGhost.objectId;
          const effectiveSettings =
            isDimmedByFocus || isDimmedByGhost ? { ...settings, opacity: Math.min(settings.opacity, FOCUS_MODE_DIM_OPACITY) } : settings;
          const isHovered = hoveredObjectId === obj.id;
          const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
          const objectCutPlanes = objectCutPlanesById[obj.id] ?? [];
          const objectClippingPlanes = objectClippingPlanesById[obj.id] ?? [];
          const shapeHl = shapeHighlightByIndex.get(objIndex);
          if (obj.shape) {
            return (
              <ForgeObject
                key={obj.id}
                obj={obj}
                settings={effectiveSettings}
                renderMode={renderMode}
                isInteracting={isViewportInteracting}
                matrix={matrix}
                isHovered={isHovered}
                cutPlanes={objectCutPlanes}
                clippingPlanes={objectClippingPlanes}
                debugHighlightColor={shapeHl?.color}
                debugHighlightPulse={shapeHl?.pulse}
                onPointerEnter={(event) => updateHoverLabel(obj, event)}
                onPointerMove={(event) => updateHoverLabel(obj, event)}
                onPointerLeave={(event) => clearHoverLabel(obj, event)}
                onClick={(event) => handleObjectClick(obj, event)}
                onDoubleClick={(event) => handleObjectDoubleClick(obj, event)}
                onContextMenu={(event) => handleObjectContextMenu(obj, event)}
              />
            );
          }
          if (obj.sketch) {
            return (
              <SketchObject
                key={obj.id}
                obj={obj}
                settings={effectiveSettings}
                renderMode={renderMode}
                matrix={matrix}
                isSketchMode={isSketchOnly}
                onPointerEnter={(event) => updateHoverLabel(obj, event)}
                onPointerMove={(event) => updateHoverLabel(obj, event)}
                onPointerLeave={(event) => clearHoverLabel(obj, event)}
                onClick={(event) => handleObjectClick(obj, event)}
                onDoubleClick={(event) => handleObjectDoubleClick(obj, event)}
                onContextMenu={(event) => handleObjectContextMenu(obj, event)}
                onEntityClick={handleSketchEntityClick}
                onVertexHover={(pointId, event) => {
                  if (!objectPickSyncEnabled || measureMode || isViewportInteracting || event.buttons !== 0) return;
                  const rect = containerRef.current?.getBoundingClientRect();
                  if (!rect) return;
                  setHoverLabel({
                    id: `${obj.id}:${pointId}`,
                    name: pointId,
                    x: event.clientX - rect.left + 10,
                    y: event.clientY - rect.top + 12,
                  });
                }}
              />
            );
          }
          if (obj.toolpath) {
            return (
              <ToolpathObject
                key={obj.id}
                obj={obj}
                settings={effectiveSettings}
                matrix={matrix}
                maxSegmentIndex={Math.round(toolpathProgress * obj.toolpath.segments.length)}
              />
            );
          }
          return null;
        })}
        {constructionGhost && <ConstructionGhostOverlay matrix={constructionGhostMatrix} />}
        {hoveredJointOverlay && <HoveredJointOverlay state={hoveredJointOverlay} config={jointOverlayConfig} />}
        {dimensionsVisible && dimensions.map((d) => <DimensionAnnotation key={d.id} def={d} lengthUnit={lengthUnit} />)}
        <MeasureTool />
        {debugHighlights3D.length > 0 && <DebugHighlightsOverlay highlights={debugHighlights3D} />}
        {drawFlagEnabled && <DrawCanvas />}
        <PerformanceInfoSampler
          enabled={showPerformanceInfo}
          sceneObjects={visibleSceneObjectCount}
          modelTriangles={visibleModelTriangles}
          reactRenderCountRef={reactRenderCountRef}
          onStatsChange={handlePerformanceInfoChange}
        />
        <ZoomSampler onZoomChange={setZoomMmPerPx} />

        {gridEnabled && !isSketchOnly && (
          <Grid
            args={[500, 500]}
            rotation-x={Math.PI / 2}
            cellSize={gridSize}
            cellThickness={0.5}
            cellColor={t.gridCell}
            sectionSize={gridSize * 5}
            sectionThickness={1}
            sectionColor={t.gridSection}
            fadeDistance={400}
            infiniteGrid
          />
        )}
        {!isSketchOnly && <LabeledAxes />}
        {gridEnabled && isSketchOnly && (
          <Grid
            args={[500, 500]}
            cellSize={gridSize}
            cellThickness={0.5}
            cellColor={t.gridCell}
            sectionSize={gridSize * 5}
            sectionThickness={1}
            sectionColor={t.gridSection}
            fadeDistance={400}
            infiniteGrid
            rotation={[Math.PI / 2, 0, 0]}
            side={THREE.DoubleSide}
          />
        )}

        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.1}
          minPolarAngle={0}
          maxPolarAngle={Math.PI}
          enableRotate={!isSketchOnly}
          mouseButtons={drawModeActive ? MOUSE_BUTTONS_DRAW : isSketchOnly ? MOUSE_BUTTONS_SKETCH : MOUSE_BUTTONS_3D}
          touches={isSketchOnly ? TOUCH_GESTURES_SKETCH : TOUCH_GESTURES_3D}
        />

        <ControlsInteractionBridge controlsRef={controlsRef} onInteractionChange={setIsViewportInteracting} />

        <ViewManager isSketchOnly={isSketchOnly} controlsRef={controlsRef} />

        <ViewPersistence controlsRef={controlsRef} isSketchOnly={isSketchOnly} onResolved={handleViewPersistenceResolved} />

        <OrbitGifExporterBridge controlsRef={controlsRef} />

        <ViewController
          controlsRef={controlsRef}
          command={viewCommand}
          objects={objects}
          objectMatrices={objectMatrices}
          settings={objectSettings}
          focusedObjectIds={focusedObjectIds}
          clearCommand={clearViewCommand}
        />
      </Canvas>

      {/* Toolpath timeline slider */}
      {(() => {
        const toolpathObj = objects.find((o) => o.toolpath && o.toolpath.segments.length > 0);
        if (!toolpathObj?.toolpath) return null;
        const tp = toolpathObj.toolpath;
        const totalSegs = tp.segments.length;
        const elapsed = tp.estimatedTimeSeconds * toolpathProgress;
        const fmtTime = (s: number) => {
          const m = Math.floor(s / 60);
          const sec = Math.floor(s % 60);
          return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
        };
        return (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'var(--fc-bgPanel)',
              border: '1px solid var(--fc-border)',
              borderRadius: 8,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              minWidth: 340,
              maxWidth: 520,
              pointerEvents: 'auto',
              boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
              zIndex: 10,
            }}
          >
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', whiteSpace: 'nowrap' }}>{fmtTime(elapsed)}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={1 / Math.max(1, totalSegs)}
              value={toolpathProgress}
              onChange={(e) => setToolpathProgress(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--fc-accent)' }}
            />
            <span style={{ fontSize: 11, color: 'var(--fc-textDim)', whiteSpace: 'nowrap' }}>{fmtTime(tp.estimatedTimeSeconds)}</span>
            <span style={{ fontSize: 10, color: 'var(--fc-textMuted)', whiteSpace: 'nowrap', minWidth: 36, textAlign: 'right' }}>
              {Math.round(toolpathProgress * 100)}%
            </span>
          </div>
        );
      })()}

      <PerformanceInfoPanel enabled={showPerformanceInfo} stats={performanceInfo} />
      <ZoomIndicatorPanel mmPerPx={zoomMmPerPx} />

      {drawFlagEnabled && <DrawToolbar />}

      {/* Measure mode indicator */}
      {measureMode && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--fc-warning)',
            color: '#000',
            padding: '4px 12px',
            borderRadius: 4,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          Click surfaces, edges, or vertices to measure
        </div>
      )}

      {/* Measure info panel */}
      {measureMode && <MeasureInfoPanel />}

      {(isEvaluating || evaluationPhase === 'exporting') && <EvaluationIndicator phase={evaluationPhase} />}

      {objectPickSyncEnabled && !measureMode && hoverLabel && (
        <div
          style={{
            position: 'absolute',
            left: hoverLabel.x,
            top: hoverLabel.y,
            zIndex: 15,
            background: '#111111d9',
            color: '#f2f2f2',
            padding: '3px 7px',
            borderRadius: 4,
            border: '1px solid #2a2a2a',
            fontSize: 11,
            fontWeight: 600,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
            transform: 'translate(0, -100%)',
          }}
        >
          {hoverLabel.name}
        </div>
      )}

      {objectContextMenu && (
        <div
          ref={contextMenuRef}
          style={{
            position: 'absolute',
            left: objectContextMenu.x,
            top: objectContextMenu.y,
            width: OBJECT_CONTEXT_MENU_WIDTH,
            background: 'var(--fc-bgPanel)',
            border: '1px solid var(--fc-border)',
            borderRadius: 8,
            boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
            padding: 6,
            zIndex: 20,
          }}
          onPointerDown={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button
            type="button"
            onClick={handleGetFaceInfo}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 6,
              padding: '8px 10px',
              background: 'transparent',
              color: 'var(--fc-text)',
              textAlign: 'left',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Get Info
          </button>
          <button
            type="button"
            onClick={handleHideObject}
            style={{
              width: '100%',
              border: 'none',
              borderRadius: 6,
              padding: '8px 10px',
              background: 'transparent',
              color: 'var(--fc-text)',
              textAlign: 'left',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Hide
          </button>
        </div>
      )}

      {faceInfoPanel &&
        (() => {
          const obj = objects.find((o) => o.id === faceInfoPanel.objectId);
          if (!obj) return null;
          const activeFaceName = faceInfoPanel.faceName;
          const history = activeFaceName ? (faceInfoData?.faceHistories[activeFaceName] ?? null) : null;
          const faceNames = faceInfoData?.faceNames ?? [];
          return (
            <div
              style={{
                position: 'absolute',
                left: Math.min(faceInfoPanel.x, (containerRef.current?.clientWidth ?? 600) - 280 - OBJECT_CONTEXT_MENU_MARGIN),
                top: faceInfoPanel.y,
                width: 272,
                background: 'var(--fc-bgPanel)',
                border: '1px solid var(--fc-border)',
                borderRadius: 8,
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
                padding: 12,
                zIndex: 20,
                fontSize: 12,
                color: 'var(--fc-text)',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>Surface History</span>
                <button
                  type="button"
                  onClick={() => setFaceInfoPanel(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--fc-textMuted)',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>

              {/* Object name / breadcrumb */}
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--fc-textMuted)',
                  marginBottom: 10,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {obj.treePath && obj.treePath.length > 0 ? obj.treePath.join(' / ') : obj.name}
              </div>

              {faceInfoLoading ? (
                <div style={{ fontSize: 11, color: 'var(--fc-textMuted)' }}>Loading...</div>
              ) : (
                <>
                  {/* Face selector */}
                  {faceNames.length > 0 && (
                    <div style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 11, color: 'var(--fc-textMuted)', display: 'block', marginBottom: 3 }}>Face</label>
                      <select
                        value={activeFaceName ?? ''}
                        onChange={(e) => setFaceInfoPanel({ ...faceInfoPanel, faceName: e.target.value })}
                        style={{
                          width: '100%',
                          background: 'var(--fc-bgInput)',
                          border: '1px solid var(--fc-border)',
                          borderRadius: 4,
                          color: 'var(--fc-text)',
                          fontSize: 12,
                          padding: '4px 6px',
                        }}
                      >
                        {faceNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {history && history.timeline.length > 0 ? (
                    <div>
                      {history.timeline.map((entry, i) => {
                        const isFirst = i === 0;
                        const isLast = i === history.timeline.length - 1;
                        const color =
                          entry.category === 'primitive'
                            ? '#4ade80'
                            : entry.category === 'sketch'
                              ? '#60a5fa'
                              : entry.category === 'modifier'
                                ? '#fb923c'
                                : entry.category === 'boolean'
                                  ? '#c084fc'
                                  : 'var(--fc-textMuted)';
                        return (
                          <div key={i} style={{ display: 'flex', gap: 8, paddingBottom: isLast ? 0 : 6 }}>
                            {/* Timeline spine */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, width: 14 }}>
                              <div
                                style={{
                                  width: isFirst ? 10 : 8,
                                  height: isFirst ? 10 : 8,
                                  borderRadius: '50%',
                                  background: color,
                                  flexShrink: 0,
                                  marginTop: isFirst ? 1 : 2,
                                  boxShadow: isFirst ? `0 0 0 2px color-mix(in srgb, ${color} 30%, transparent)` : undefined,
                                }}
                              />
                              {!isLast && <div style={{ width: 2, flex: 1, background: 'var(--fc-border)', marginTop: 3 }} />}
                            </div>
                            {/* Entry content */}
                            <div style={{ paddingBottom: isLast ? 0 : 4, minWidth: 0 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--fc-text)', lineHeight: 1.3 }}>
                                {entry.label}
                                <span
                                  style={{
                                    marginLeft: 5,
                                    fontSize: 9,
                                    fontWeight: 500,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.04em',
                                    color,
                                    opacity: 0.85,
                                  }}
                                >
                                  {entry.category}
                                </span>
                              </div>
                              {entry.summary && (
                                <div
                                  style={{
                                    fontSize: 10,
                                    color: 'var(--fc-textMuted)',
                                    marginTop: 1,
                                    fontFamily: 'monospace',
                                    wordBreak: 'break-all',
                                  }}
                                >
                                  {entry.summary}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'var(--fc-textMuted)' }}>No history available for this face</div>
                  )}
                </>
              )}
            </div>
          );
        })()}

      {sketchEntityInfo &&
        (() => {
          const ent = sketchEntityInfo.entity;
          let title = '';
          let rows: [string, string][] = [];
          if (ent.kind === 'line') {
            const len = Math.hypot(ent.b[0] - ent.a[0], ent.b[1] - ent.a[1]);
            title = `Line — ${ent.id}`;
            rows = [
              ['Length', formatLength(len, lengthUnit, 3)],
              ['Start', formatCoord(ent.a, lengthUnit)],
              ['End', formatCoord(ent.b, lengthUnit)],
            ];
          } else if (ent.kind === 'circle') {
            title = `Circle — ${ent.id}`;
            rows = [
              ['Radius', formatLength(ent.radius, lengthUnit, 3)],
              ['Diameter', formatLength(ent.radius * 2, lengthUnit, 3)],
              ['Center', formatCoord(ent.center, lengthUnit)],
            ];
          } else if (ent.kind === 'arc') {
            const sa = Math.atan2(ent.start[1] - ent.center[1], ent.start[0] - ent.center[0]);
            const ea = Math.atan2(ent.end[1] - ent.center[1], ent.end[0] - ent.center[0]);
            let span = ea - sa;
            if (ent.clockwise && span > 0) span -= Math.PI * 2;
            if (!ent.clockwise && span < 0) span += Math.PI * 2;
            title = `Arc — ${ent.id}`;
            rows = [
              ['Radius', formatLength(ent.radius, lengthUnit, 3)],
              ['Span', `${(Math.abs(span) * (180 / Math.PI)).toFixed(2)}\u00B0`],
              ['Length', formatLength(Math.abs(span) * ent.radius, lengthUnit, 3)],
            ];
          } else {
            title = `Point — ${ent.id}`;
            rows = [
              ['X', formatLength(ent.position[0], lengthUnit, 3)],
              ['Y', formatLength(ent.position[1], lengthUnit, 3)],
            ];
          }
          // Find constraints referencing this entity
          const sketchObj = objects.find((o) => o.sketchMeta);
          const relatedConstraints = sketchObj?.sketchMeta?.constraints.filter((c) => c.entityIds.includes(ent.id)) ?? [];
          return (
            <div
              style={{
                position: 'absolute',
                left: sketchEntityInfo.x,
                top: sketchEntityInfo.y,
                width: 248,
                background: 'var(--fc-bgPanel)',
                border: '1px solid var(--fc-border)',
                borderRadius: 8,
                boxShadow: '0 12px 28px rgba(0, 0, 0, 0.28)',
                padding: 12,
                zIndex: 20,
                fontSize: 12,
                color: 'var(--fc-text)',
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
                <button
                  type="button"
                  onClick={() => setSketchEntityInfo(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    color: 'var(--fc-textMuted)',
                    cursor: 'pointer',
                    fontSize: 16,
                    lineHeight: 1,
                    padding: 0,
                  }}
                >
                  ×
                </button>
              </div>
              {rows.map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}>
                  <span style={{ color: 'var(--fc-textMuted)', fontSize: 11 }}>{label}</span>
                  <span style={{ fontFamily: 'monospace', fontSize: 11 }}>{value}</span>
                </div>
              ))}
              {relatedConstraints.length > 0 && (
                <div style={{ marginTop: 6, borderTop: '1px solid var(--fc-border)', paddingTop: 6 }}>
                  <div style={{ fontSize: 10, color: 'var(--fc-textMuted)', marginBottom: 4 }}>
                    Constraints ({relatedConstraints.length})
                  </div>
                  {relatedConstraints.map((c) => (
                    <div
                      key={c.id}
                      onClick={() => useForgeStore.getState().setSelectedConstraintId(c.id)}
                      style={{
                        fontSize: 10,
                        padding: '2px 4px',
                        borderRadius: 3,
                        cursor: 'pointer',
                        color: c.isConflicting ? '#ff6b6b' : c.isRedundant ? '#faad14' : 'var(--fc-text)',
                      }}
                    >
                      {c.label} {c.isDimension && c.value !== undefined ? `= ${c.value}` : c.type}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
    </div>
  );
}

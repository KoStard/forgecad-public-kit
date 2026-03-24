import type { CutPlaneDef } from '@forge/cutPlane';
import type { ExplodeViewOptions, JointViewDef, SceneObject } from '@forge/index';
import { DEFAULT_VIEW_CONFIG } from '@forge/index';
import { findJointAnimationClip, resolveJointAnimation } from '@forge/assembly/jointAnimation';
import { resolveJointViewValues } from '@forge/assembly/jointsView';
import type { SceneConfig } from '@forge/scene';
import { getSketchWorldMatrix } from '@forge/sketch/placement3d';
import { formatCoord, formatLength } from '@forge/units';
import { Grid, OrbitControls, OrthographicCamera, PerspectiveCamera } from '@react-three/drei';
import type { ThreeEvent } from '@react-three/fiber';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  MOUSE_BUTTONS_3D,
  MOUSE_BUTTONS_DRAW,
  MOUSE_BUTTONS_SKETCH,
  TOUCH_GESTURES_3D,
  TOUCH_GESTURES_SKETCH,
} from '../capture/controlsConfig';
import { useDrawStore } from '../draw/drawStore';
import { getShortcutKey, hasPrimaryModifier } from '../editorShortcuts';
import { useFeatureFlag } from '../featureFlags';
import { useForgeStore } from '../store/forgeStore';
import { themes } from '../theme';
import { evalWorkerClient } from '../workers/evalWorkerClient';
import type { EvalWorkerFaceInfoResult } from '../workers/evalWorkerProtocol';
import { DrawCanvas } from './DrawCanvas';
import { DrawToolbar } from './DrawToolbar';
import { SceneConfigurator } from './SceneConfigurator';
import { ClippingManager } from './viewport/ClippingManager';
import { ConstructionGhostOverlay } from './viewport/ConstructionGhostOverlay';
import { ControlsInteractionBridge, OrbitGifExporterBridge } from './viewport/ControlsBridge';
import { resolveHoverObjectName } from './viewport/cameraPersistence';
import { DebugHighlightsOverlay } from './viewport/DebugHighlights';
import { DimensionAnnotation } from './viewport/DimensionAnnotation';
import { EvaluationIndicator } from './viewport/EvaluationIndicator';
import { buildExplodeTree, computeExplodeTreeOffsets } from './viewport/explodeTree';
import { ForgeObject } from './viewport/ForgeObject';
import { expandBoundsByTransformedAabb, isTextEntryTarget } from './viewport/geometryUtils';
import { HoveredJointOverlay } from './viewport/HoveredJointOverlay';
import { computeJointNodeMatrices } from './viewport/jointUtils';
import { LabeledAxes } from './viewport/LabeledAxes';
import { LocalStudioEnvironment } from './viewport/LocalStudioEnvironment';
import { MeasureInfoPanel, MeasureTool } from './viewport/MeasureTool';
import { PerformanceInfoPanel, PerformanceInfoSampler } from './viewport/PerformanceInfo';
import { SectionPlaneGuides } from './viewport/SectionPlane';
import { SketchObject } from './viewport/SketchObject';
import { isObjectExcludedFromCutPlane, toClippingPlane } from './viewport/sectionUtils';
import { ToolpathObject } from './viewport/ToolpathObject';
import type { SketchHoveredEntity } from './viewport/types';
// Extracted viewport modules
import {
  FOCUS_MODE_DIM_OPACITY,
  type HoveredJointOverlayState,
  IDENTITY_MATRIX,
  OBJECT_CONTEXT_MENU_HEIGHT,
  OBJECT_CONTEXT_MENU_MARGIN,
  OBJECT_CONTEXT_MENU_WIDTH,
  type ObjectContextMenuState,
  type SketchEntityInfoPanel,
  type ViewportPerformanceInfo,
  ZERO_OFFSET,
} from './viewport/types';
import { ViewController, ViewManager, ViewPersistence } from './viewport/ViewController';

export function Viewport() {
  const measureMode = useForgeStore((s) => s.measureMode);
  const isEvaluating = useForgeStore((s) => s.isEvaluating);
  const evaluationPhase = useForgeStore((s) => s.evaluationPhase);
  const result = useForgeStore((s) => s.lastValidResult);
  const previewFile = useForgeStore((s) => s.previewFile);
  const files = useForgeStore((s) => s.files);
  const renderMode = useForgeStore((s) => s.renderMode);
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const gridEnabled = useForgeStore((s) => s.gridEnabled);
  const gridSize = useForgeStore((s) => s.gridSize);
  const showPerformanceInfo = useForgeStore((s) => s.showPerformanceInfo);
  const objectSettings = useForgeStore((s) => s.objectSettings);
  const setObjectVisibility = useForgeStore((s) => s.setObjectVisibility);
  const hoveredObjectId = useForgeStore((s) => s.hoveredObjectId);
  const setHoveredObjectId = useForgeStore((s) => s.setHoveredObjectId);
  const selectObject = useForgeStore((s) => s.selectObject);
  const focusedObjectIds = useForgeStore((s) => s.focusedObjectIds);
  const focusObject = useForgeStore((s) => s.focusObject);
  const clearFocusedObject = useForgeStore((s) => s.clearFocusedObject);
  const objectPickSyncEnabled = useForgeStore((s) => s.objectPickSyncEnabled);
  const explodeAmount = useForgeStore((s) => s.explodeAmount);
  const viewCommand = useForgeStore((s) => s.viewCommand);
  const requestViewCommand = useForgeStore((s) => s.requestViewCommand);
  const clearViewCommand = useForgeStore((s) => s.clearViewCommand);
  const jointValues = useForgeStore((s) => s.jointValues);
  const jointAnimationClip = useForgeStore((s) => s.jointAnimationClip);
  const jointAnimationProgress = useForgeStore((s) => s.jointAnimationProgress);
  const jointAnimationPlaying = useForgeStore((s) => s.jointAnimationPlaying);
  const jointAnimationSpeed = useForgeStore((s) => s.jointAnimationSpeed);
  const hoveredJointName = useForgeStore((s) => s.hoveredJointName);
  const setJointAnimationProgress = useForgeStore((s) => s.setJointAnimationProgress);
  const setJointAnimationPlaying = useForgeStore((s) => s.setJointAnimationPlaying);
  const lengthUnit = useForgeStore((s) => s.lengthUnit);
  const constructionGhost = useForgeStore((s) => s.constructionGhost);
  const objects = result?.objects ?? [];
  const dimensions = result?.dimensions ?? [];
  const debugHighlights3D = result?.debugHighlights3D ?? [];
  const shapeHighlightByIndex = useMemo(() => {
    const map = new Map<number, { color: string; pulse?: boolean }>();
    for (const hl of debugHighlights3D) {
      if (hl.kind === 'shape') {
        map.set(hl.shapeIndex, { color: hl.color ?? '#ff00ff', pulse: hl.pulse });
      }
    }
    return map;
  }, [debugHighlights3D]);
  const dimensionsVisible = useForgeStore((s) => s.dimensionsVisible);
  const _surfacesVisible = useForgeStore((s) => s.surfacesVisible);
  const cutPlaneEnabled = useForgeStore((s) => s.cutPlaneEnabled);
  const sectionPlaneGuidesEnabled = useForgeStore((s) => s.sectionPlaneGuidesEnabled);
  const sectionPlaneFillEnabled = useForgeStore((s) => s.sectionPlaneFillEnabled);
  const sectionPlaneFillOpacity = useForgeStore((s) => s.sectionPlaneFillOpacity);
  const sectionPlaneBorderEnabled = useForgeStore((s) => s.sectionPlaneBorderEnabled);
  const sectionPlaneAxisEnabled = useForgeStore((s) => s.sectionPlaneAxisEnabled);
  const drawFlagEnabled = useFeatureFlag('drawMode');
  const drawModeActive = useDrawStore((s) => s.active) && drawFlagEnabled;
  const [toolpathProgress, setToolpathProgress] = useState(1); // 0..1 — fraction of segments to show
  const prevResultRef = useRef(result);
  if (prevResultRef.current !== result) {
    prevResultRef.current = result;
    // Reset to full when the script re-evaluates
    if (toolpathProgress !== 1) setToolpathProgress(1);
  }
  const [performanceInfo, setPerformanceInfo] = useState<ViewportPerformanceInfo | null>(null);
  const reactRenderCountRef = useRef(0);
  reactRenderCountRef.current += 1;
  const cutPlaneDefs: CutPlaneDef[] = result?.cutPlanes ?? [];
  const explodeConfig: ExplodeViewOptions | null = result?.explodeView ?? null;
  const jointsConfig = result?.jointsView ?? null;
  const jointOverlayConfig = result?.viewConfig?.jointOverlay ?? DEFAULT_VIEW_CONFIG.jointOverlay;
  const sceneConfig: SceneConfig | null = result?.sceneConfig ?? null;
  const [defaultLightsOverridden, setDefaultLightsOverridden] = useState(false);
  const [defaultEnvironmentOverridden, setDefaultEnvironmentOverridden] = useState(false);
  const handleDefaultLightsOverridden = useCallback((v: boolean) => setDefaultLightsOverridden(v), []);
  const handleDefaultEnvironmentOverridden = useCallback((v: boolean) => setDefaultEnvironmentOverridden(v), []);
  const joints = useMemo(() => (jointsConfig?.enabled === false ? [] : (jointsConfig?.joints ?? [])), [jointsConfig]);
  const jointCouplings = useMemo(() => (jointsConfig?.enabled === false ? [] : (jointsConfig?.couplings ?? [])), [jointsConfig]);
  const jointAnimations = useMemo(() => (jointsConfig?.enabled === false ? [] : (jointsConfig?.animations ?? [])), [jointsConfig]);
  const activeJointAnimation = useMemo(
    () => findJointAnimationClip(jointAnimations, jointAnimationClip),
    [jointAnimationClip, jointAnimations],
  );
  const animatedJointValues = useMemo(
    () => resolveJointAnimation(activeJointAnimation, jointAnimationProgress, jointValues),
    [activeJointAnimation, jointAnimationProgress, jointValues],
  );
  const effectiveJointValues = useMemo(
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues, { clamp: false }),
    [animatedJointValues, jointCouplings, joints],
  );

  const activeCutPlaneDefs = useMemo(() => {
    return cutPlaneDefs
      .filter((cp) => cutPlaneEnabled[cp.name])
      .filter((cp) => new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).lengthSq() > 1e-8);
  }, [cutPlaneDefs, cutPlaneEnabled]);

  const { objectCutPlanesById, objectClippingPlanesById, hasAnyObjectCutPlanes } = useMemo(() => {
    const cutPlanesById: Record<string, CutPlaneDef[]> = {};
    const clippingPlanesById: Record<string, THREE.Plane[]> = {};
    let hasAnyCutPlanes = false;

    objects.forEach((obj) => {
      const applicable = activeCutPlaneDefs.filter((cp) => !isObjectExcludedFromCutPlane(obj, cp));
      cutPlanesById[obj.id] = applicable;
      clippingPlanesById[obj.id] = applicable.map(toClippingPlane);
      if (applicable.length > 0) hasAnyCutPlanes = true;
    });

    return {
      objectCutPlanesById: cutPlanesById,
      objectClippingPlanesById: clippingPlanesById,
      hasAnyObjectCutPlanes: hasAnyCutPlanes,
    };
  }, [activeCutPlaneDefs, objects]);

  const explodeOffsets = useMemo(() => {
    if (explodeAmount <= 1e-8) return {} as Record<string, [number, number, number]>;
    if (explodeConfig?.enabled === false) return {} as Record<string, [number, number, number]>;
    if (objects.length === 0) return {} as Record<string, [number, number, number]>;
    return computeExplodeTreeOffsets(buildExplodeTree(objects), explodeAmount, explodeConfig);
  }, [explodeAmount, explodeConfig, objects]);

  const jointNodeMatrices = useMemo(() => computeJointNodeMatrices(joints, effectiveJointValues), [effectiveJointValues, joints]);

  const jointMatrices = useMemo(() => {
    const out: Record<string, THREE.Matrix4> = {};
    objects.forEach((obj) => {
      out[obj.id] = new THREE.Matrix4();
    });

    if (joints.length === 0 || objects.length === 0) return out;

    const jointByChild = new Map<string, JointViewDef>();
    joints.forEach((joint) => {
      jointByChild.set(joint.child, joint);
    });

    objects.forEach((obj) => {
      let nodeName: string | null = null;
      if (jointByChild.has(obj.name)) {
        nodeName = obj.name;
      } else if (obj.groupName && jointByChild.has(obj.groupName)) {
        // ShapeGroup returns are flattened as "Group.Lid" or the fallback "Group.1".
        // Resolve joints against the parent group name when exact object name is absent.
        nodeName = obj.groupName;
      }
      if (!nodeName) return;
      out[obj.id] = jointNodeMatrices.get(nodeName)?.clone() ?? new THREE.Matrix4();
    });

    return out;
  }, [jointNodeMatrices, joints, objects]);

  const objectMatrices = useMemo(() => {
    const out: Record<string, THREE.Matrix4> = {};
    objects.forEach((obj) => {
      const baseMatrix = obj.sketch ? new THREE.Matrix4().fromArray(getSketchWorldMatrix(obj.sketch)) : new THREE.Matrix4();
      const jointMatrix = jointMatrices[obj.id] ?? new THREE.Matrix4();
      const offset = explodeOffsets[obj.id] ?? ZERO_OFFSET;
      const explodeMatrix = new THREE.Matrix4().makeTranslation(offset[0], offset[1], offset[2]);
      out[obj.id] = explodeMatrix.multiply(jointMatrix).multiply(baseMatrix);
    });
    return out;
  }, [explodeOffsets, jointMatrices, objects]);

  const constructionGhostMatrix = useMemo(
    () => (constructionGhost ? (objectMatrices[constructionGhost.objectId] ?? new THREE.Matrix4()) : new THREE.Matrix4()),
    [constructionGhost, objectMatrices],
  );

  useEffect(() => {
    if (!jointAnimationPlaying || !activeJointAnimation) return;

    let raf = 0;
    let lastTs = performance.now();
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const dtSec = Math.max(0, (now - lastTs) / 1000);
      lastTs = now;

      const step = (dtSec * jointAnimationSpeed) / Math.max(1e-6, activeJointAnimation.duration);
      let next = useForgeStore.getState().jointAnimationProgress + step;
      if (next >= 1) {
        if (!activeJointAnimation.loop) {
          next = 1;
          setJointAnimationPlaying(false);
        } else if (!activeJointAnimation.continuous) {
          next = next % 1;
        }
      }
      setJointAnimationProgress(next);

      if (useForgeStore.getState().jointAnimationPlaying) {
        raf = requestAnimationFrame(tick);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, [activeJointAnimation, jointAnimationPlaying, jointAnimationSpeed, setJointAnimationPlaying, setJointAnimationProgress]);

  const sectionGuideBoundsKey = sectionPlaneGuidesEnabled && activeCutPlaneDefs.length > 0 ? objectMatrices : null;

  const sectionGuideSize = useMemo(() => {
    if (!sectionPlaneGuidesEnabled || activeCutPlaneDefs.length === 0) {
      return Math.max(60, gridSize * 8);
    }

    const bounds = new THREE.Box3();
    let hasBounds = false;

    objects.forEach((obj) => {
      const matrix = objectMatrices[obj.id] ?? new THREE.Matrix4();
      if (obj.shape) {
        try {
          const bb = obj.shape.boundingBox();
          expandBoundsByTransformedAabb(bounds, bb.min, bb.max, matrix);
          hasBounds = true;
        } catch {
          // Ignore bad shape bounds from partial execution failures.
        }
        return;
      }
      if (obj.sketch) {
        try {
          const bb = obj.sketch.bounds();
          expandBoundsByTransformedAabb(bounds, [bb.min[0], bb.min[1], 0], [bb.max[0], bb.max[1], 0], matrix);
          hasBounds = true;
        } catch {
          // Ignore bad sketch bounds from partial execution failures.
        }
        return;
      }
      if (obj.toolpath) {
        const tb = obj.toolpath.bounds;
        expandBoundsByTransformedAabb(bounds, tb.min, tb.max, matrix);
        hasBounds = true;
      }
    });

    if (!hasBounds) return Math.max(60, gridSize * 8);

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const diagonal = Math.max(1, size.length());
    return Math.max(60, diagonal * 1.35, gridSize * 6);
  }, [activeCutPlaneDefs.length, gridSize, objects, sectionGuideBoundsKey, sectionPlaneGuidesEnabled]);

  const jointOverlayBaseSize = useMemo(() => {
    const bounds = new THREE.Box3();
    let hasBounds = false;

    objects.forEach((obj) => {
      if (obj.shape) {
        try {
          const bb = obj.shape.boundingBox();
          expandBoundsByTransformedAabb(bounds, bb.min, bb.max, IDENTITY_MATRIX);
          hasBounds = true;
        } catch {
          // Ignore bad shape bounds from partial execution failures.
        }
        return;
      }
      if (obj.sketch) {
        try {
          const bb = obj.sketch.bounds();
          expandBoundsByTransformedAabb(
            bounds,
            [bb.min[0], bb.min[1], 0],
            [bb.max[0], bb.max[1], 0],
            new THREE.Matrix4().fromArray(getSketchWorldMatrix(obj.sketch)),
          );
          hasBounds = true;
        } catch {
          // Ignore bad sketch bounds from partial execution failures.
        }
        return;
      }
      if (obj.toolpath) {
        const tb = obj.toolpath.bounds;
        expandBoundsByTransformedAabb(bounds, tb.min, tb.max, IDENTITY_MATRIX);
        hasBounds = true;
      }
    });

    if (!hasBounds) return Math.max(60, gridSize * 8);

    const size = new THREE.Vector3();
    bounds.getSize(size);
    const diagonal = Math.max(1, size.length());
    return Math.max(60, diagonal * 1.35, gridSize * 6);
  }, [gridSize, objects]);

  const hoveredJointOverlay = useMemo((): HoveredJointOverlayState | null => {
    if (!jointOverlayConfig.enabled) return null;
    if (!hoveredJointName) return null;
    const joint = joints.find((entry) => entry.name === hoveredJointName);
    if (!joint) return null;

    const parentMatrix = joint.parent ? (jointNodeMatrices.get(joint.parent)?.clone() ?? new THREE.Matrix4()) : new THREE.Matrix4();
    const axisLocal = new THREE.Vector3(joint.axis[0], joint.axis[1], joint.axis[2]).normalize();
    const axisWorld = axisLocal.clone().transformDirection(parentMatrix);
    if (axisWorld.lengthSq() <= 1e-8) axisWorld.copy(axisLocal);
    axisWorld.normalize();

    const pivotWorld = new THREE.Vector3(joint.pivot[0], joint.pivot[1], joint.pivot[2]).applyMatrix4(parentMatrix);
    const childObject = objects.find((obj) => obj.name === joint.child || obj.groupName === joint.child);
    if (childObject) {
      const offset = explodeOffsets[childObject.id] ?? ZERO_OFFSET;
      pivotWorld.add(new THREE.Vector3(offset[0], offset[1], offset[2]));
    }

    const rawOverlay = effectiveJointValues[joint.name] ?? joint.defaultValue;
    const value = Number.isFinite(rawOverlay) ? rawOverlay : joint.defaultValue;
    const axisLength = Math.max(jointOverlayConfig.axisLengthMin, jointOverlayBaseSize * jointOverlayConfig.axisLengthScale);
    return {
      joint,
      value,
      pivotWorld,
      axisWorld,
      axisLength,
    };
  }, [
    effectiveJointValues,
    explodeOffsets,
    hoveredJointName,
    jointNodeMatrices,
    jointOverlayConfig,
    jointOverlayBaseSize,
    joints,
    objects,
  ]);

  const hasShape = objects.some((obj) => obj.shape);
  const isSketchOnly = !hasShape && objects.some((obj) => obj.sketch);
  const knownFileNames = useMemo(() => new Set(Object.keys(files)), [files]);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const initialFitRequestedRef = useRef(false);
  const prevPreviewFileRef = useRef<string | null | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hoverTooltipRef = useRef<HTMLDivElement | null>(null);
  const hoverTooltipIdRef = useRef<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement | null>(null);
  const [viewPersistenceResolved, setViewPersistenceResolved] = useState(false);
  const [isViewportInteracting, setIsViewportInteracting] = useState(false);
  const [objectContextMenu, setObjectContextMenu] = useState<ObjectContextMenuState | null>(null);
  const [faceInfoPanel, setFaceInfoPanel] = useState<{
    objectId: string;
    faceName: string | null;
    hitNormal: [number, number, number] | null;
    x: number;
    y: number;
  } | null>(null);
  const [faceInfoData, setFaceInfoData] = useState<EvalWorkerFaceInfoResult | null>(null);
  const [faceInfoLoading, setFaceInfoLoading] = useState(false);
  const [sketchEntityInfo, setSketchEntityInfo] = useState<SketchEntityInfoPanel | null>(null);
  const themeName = useForgeStore((s) => s.theme);
  const t = themes[themeName];
  const focusedObjectIdSet = useMemo(() => new Set(focusedObjectIds), [focusedObjectIds]);
  const canvasDpr: number | [number, number] = isViewportInteracting ? 1 : [1, 2];
  const { visibleSceneObjectCount, visibleModelTriangles } = useMemo(() => {
    let nextVisibleSceneObjectCount = 0;
    let nextVisibleModelTriangles = 0;

    objects.forEach((obj) => {
      if (objectSettings[obj.id]?.visible === false) return;
      nextVisibleSceneObjectCount += 1;
      if (!obj.shape) return;
      try {
        nextVisibleModelTriangles += obj.shape.numTri();
      } catch {
        // Ignore broken triangle counts from partial/invalid geometry.
      }
    });

    return {
      visibleSceneObjectCount: nextVisibleSceneObjectCount,
      visibleModelTriangles: nextVisibleModelTriangles,
    };
  }, [objectSettings, objects]);

  const closeObjectContextMenu = useCallback(() => {
    setObjectContextMenu(null);
  }, []);

  const hideHoverTooltip = useCallback((id?: string | null) => {
    if (id !== undefined && hoverTooltipIdRef.current !== id) return;
    hoverTooltipIdRef.current = null;
    const tooltip = hoverTooltipRef.current;
    if (!tooltip) return;
    tooltip.style.visibility = 'hidden';
    tooltip.style.opacity = '0';
  }, []);

  const showHoverTooltip = useCallback((label: { id: string; name: string; x: number; y: number }) => {
    hoverTooltipIdRef.current = label.id;
    const tooltip = hoverTooltipRef.current;
    if (!tooltip) return;
    if (tooltip.textContent !== label.name) tooltip.textContent = label.name;
    tooltip.style.left = `${label.x}px`;
    tooltip.style.top = `${label.y}px`;
    tooltip.style.visibility = 'visible';
    tooltip.style.opacity = '1';
  }, []);

  const handleViewPersistenceResolved = useCallback((restored: boolean) => {
    if (restored) {
      initialFitRequestedRef.current = true;
    }
    setViewPersistenceResolved(true);
  }, []);

  useEffect(() => {
    if (!viewPersistenceResolved) return;
    if (initialFitRequestedRef.current) return;
    if (viewCommand) return;
    if (objects.length === 0) return;
    initialFitRequestedRef.current = true;
    requestViewCommand({ type: 'fit' });
  }, [objects.length, requestViewCommand, viewCommand, viewPersistenceResolved]);

  // Auto-fit whenever a different model finishes loading
  useEffect(() => {
    const prev = prevPreviewFileRef.current;
    prevPreviewFileRef.current = previewFile;
    if (prev === undefined) return; // skip initial mount — handled by the effect above
    if (prev === previewFile) return;
    if (objects.length === 0) return;
    requestViewCommand({ type: 'fit' });
  }, [previewFile, objects.length, requestViewCommand]);

  useEffect(() => {
    if (objectPickSyncEnabled) return;
    hideHoverTooltip();
    setHoveredObjectId(null);
  }, [hideHoverTooltip, objectPickSyncEnabled, setHoveredObjectId]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (objectContextMenu) {
        closeObjectContextMenu();
        return;
      }
      // Escape in measure mode: clear selections first, then deactivate
      const store = useForgeStore.getState();
      if (store.measureMode) {
        if (store.measureSelections.length > 0) {
          store.clearMeasureSelections();
        } else {
          store.toggleMeasure();
        }
        return;
      }
      if (store.constructionGhost !== null) {
        store.setConstructionGhost(null);
        return;
      }
      if (store.focusedObjectIds.length === 0) return;
      clearFocusedObject();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [clearFocusedObject, closeObjectContextMenu, objectContextMenu]);

  useEffect(() => {
    const handleViewShortcut = (event: KeyboardEvent) => {
      if (event.isComposing || event.repeat) return;
      if (event.altKey || !event.shiftKey || !hasPrimaryModifier(event)) return;
      if (isTextEntryTarget(event.target)) return;

      const key = getShortcutKey(event);
      if (key === 'f') {
        event.preventDefault();
        requestViewCommand({ type: 'fit' });
        return;
      }
      if (key === 'h') {
        event.preventDefault();
        requestViewCommand({ type: 'snap', view: 'iso' });
      }
    };

    window.addEventListener('keydown', handleViewShortcut, true);
    return () => window.removeEventListener('keydown', handleViewShortcut, true);
  }, [requestViewCommand]);

  useEffect(() => {
    if (!objectContextMenu) return;

    const handleWindowPointerDown = (event: PointerEvent) => {
      const menu = contextMenuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) return;
      closeObjectContextMenu();
    };
    const handleWindowResize = () => closeObjectContextMenu();

    window.addEventListener('pointerdown', handleWindowPointerDown);
    window.addEventListener('resize', handleWindowResize);
    return () => {
      window.removeEventListener('pointerdown', handleWindowPointerDown);
      window.removeEventListener('resize', handleWindowResize);
    };
  }, [closeObjectContextMenu, objectContextMenu]);

  useEffect(() => {
    if (!objectContextMenu) return;
    if (measureMode || isViewportInteracting) {
      closeObjectContextMenu();
      return;
    }
    if (!objects.some((obj) => obj.id === objectContextMenu.objectId)) {
      closeObjectContextMenu();
    }
  }, [closeObjectContextMenu, isViewportInteracting, measureMode, objectContextMenu, objects]);

  const updateHoverLabel = useCallback(
    (obj: SceneObject, event: ThreeEvent<PointerEvent>) => {
      if (!objectPickSyncEnabled || measureMode || isViewportInteracting || event.buttons !== 0) return;
      event.stopPropagation();
      setHoveredObjectId(obj.id);
      const hoverName = resolveHoverObjectName(obj.name, knownFileNames);
      if (!hoverName) {
        // Pass no ID so the guard in hideHoverTooltip doesn't block clearing a stale tooltip
        // that belongs to a different (now-occluded) object.
        hideHoverTooltip();
        return;
      }
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      showHoverTooltip({
        id: obj.id,
        name: hoverName,
        x: event.clientX - rect.left + 10,
        y: event.clientY - rect.top + 12,
      });
    },
    [hideHoverTooltip, isViewportInteracting, knownFileNames, measureMode, objectPickSyncEnabled, setHoveredObjectId, showHoverTooltip],
  );

  const clearHoverLabel = useCallback(
    (obj: SceneObject, event: ThreeEvent<PointerEvent>) => {
      if (!objectPickSyncEnabled || measureMode || isViewportInteracting || event.buttons !== 0) return;
      event.stopPropagation();
      if (hoveredObjectId === obj.id) setHoveredObjectId(null);
      hideHoverTooltip(obj.id);
    },
    [hideHoverTooltip, hoveredObjectId, isViewportInteracting, measureMode, objectPickSyncEnabled, setHoveredObjectId],
  );

  const handleObjectClick = useCallback(
    (obj: SceneObject, event: ThreeEvent<MouseEvent>) => {
      if (!objectPickSyncEnabled || measureMode || isViewportInteracting) return;
      event.stopPropagation();
      selectObject(obj.id);
    },
    [isViewportInteracting, measureMode, objectPickSyncEnabled, selectObject],
  );

  const handleObjectDoubleClick = useCallback(
    (obj: SceneObject, event: ThreeEvent<MouseEvent>) => {
      if (measureMode || isViewportInteracting) return;
      event.stopPropagation();
      const additive = event.shiftKey || event.metaKey || event.ctrlKey;
      focusObject(obj.id, { additive });
    },
    [focusObject, isViewportInteracting, measureMode],
  );

  const handleObjectContextMenu = useCallback(
    (obj: SceneObject, event: ThreeEvent<MouseEvent>) => {
      if (measureMode || isViewportInteracting) return;
      event.stopPropagation();
      event.nativeEvent.preventDefault();
      selectObject(obj.id);
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.min(
        Math.max(event.clientX - rect.left, OBJECT_CONTEXT_MENU_MARGIN),
        Math.max(OBJECT_CONTEXT_MENU_MARGIN, rect.width - OBJECT_CONTEXT_MENU_WIDTH - OBJECT_CONTEXT_MENU_MARGIN),
      );
      const y = Math.min(
        Math.max(event.clientY - rect.top, OBJECT_CONTEXT_MENU_MARGIN),
        Math.max(OBJECT_CONTEXT_MENU_MARGIN, rect.height - OBJECT_CONTEXT_MENU_HEIGHT - OBJECT_CONTEXT_MENU_MARGIN),
      );
      // Capture the face normal in world space for face identification
      let hitNormal: [number, number, number] | undefined;
      if (event.face) {
        const n = event.face.normal.clone().transformDirection(event.object.matrixWorld);
        hitNormal = [n.x, n.y, n.z];
      }
      setObjectContextMenu({ objectId: obj.id, x, y, hitNormal });
    },
    [isViewportInteracting, measureMode, selectObject],
  );

  const handleHideObject = useCallback(() => {
    if (!objectContextMenu) return;
    setObjectVisibility(objectContextMenu.objectId, false);
    closeObjectContextMenu();
  }, [closeObjectContextMenu, objectContextMenu, setObjectVisibility]);

  // Fetch face info asynchronously when the panel opens or switches object.
  useEffect(() => {
    if (!faceInfoPanel) {
      setFaceInfoData(null);
      return;
    }
    let cancelled = false;
    setFaceInfoLoading(true);
    evalWorkerClient
      .fetchFaceInfo(faceInfoPanel.objectId)
      .then((data) => {
        if (cancelled) return;
        setFaceInfoData(data);
        setFaceInfoLoading(false);
        // If we don't have a faceName yet, pick the best one now that we have the data.
        if (!faceInfoPanel.faceName) {
          let bestName: string | null = data.faceNames[0] ?? null;
          if (faceInfoPanel.hitNormal && data.faceNames.length > 0) {
            let bestDot = -Infinity;
            for (const name of data.faceNames) {
              try {
                const n = data.faces[name]?.normal;
                if (!n) continue;
                const dot = n[0] * faceInfoPanel.hitNormal[0] + n[1] * faceInfoPanel.hitNormal[1] + n[2] * faceInfoPanel.hitNormal[2];
                if (dot > bestDot) {
                  bestDot = dot;
                  bestName = name;
                }
              } catch {
                /* skip */
              }
            }
          }
          if (bestName) setFaceInfoPanel((prev) => (prev ? { ...prev, faceName: bestName } : prev));
        }
      })
      .catch(() => {
        if (cancelled) return;
        setFaceInfoLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [faceInfoPanel?.objectId]);

  const handleGetFaceInfo = useCallback(() => {
    if (!objectContextMenu) return;
    const obj = objects.find((o) => o.id === objectContextMenu.objectId);
    if (!obj?.shape) {
      closeObjectContextMenu();
      return;
    }
    setFaceInfoData(null);
    setFaceInfoPanel({
      objectId: objectContextMenu.objectId,
      faceName: null,
      hitNormal: objectContextMenu.hitNormal ?? null,
      x: objectContextMenu.x,
      y: objectContextMenu.y,
    });
    closeObjectContextMenu();
  }, [closeObjectContextMenu, objectContextMenu, objects]);

  const handleSketchEntityClick = useCallback((entity: SketchHoveredEntity, clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const panelWidth = 248;
    const panelHeight = 160;
    const x = Math.min(
      Math.max(clientX - rect.left, OBJECT_CONTEXT_MENU_MARGIN),
      Math.max(OBJECT_CONTEXT_MENU_MARGIN, rect.width - panelWidth - OBJECT_CONTEXT_MENU_MARGIN),
    );
    const y = Math.min(
      Math.max(clientY - rect.top, OBJECT_CONTEXT_MENU_MARGIN),
      Math.max(OBJECT_CONTEXT_MENU_MARGIN, rect.height - panelHeight - OBJECT_CONTEXT_MENU_MARGIN),
    );
    setSketchEntityInfo({ entity, x, y });
  }, []);

  const handleViewportPointerMissed = useCallback(
    (event: MouseEvent) => {
      if (measureMode) return;
      if (useForgeStore.getState().constructionGhost !== null) {
        useForgeStore.getState().setConstructionGhost(null);
        return;
      }
      if (event.detail !== 2) return;
      clearFocusedObject();
    },
    [clearFocusedObject, measureMode],
  );

  const handlePerformanceInfoChange = useCallback((stats: ViewportPerformanceInfo | null) => {
    setPerformanceInfo(stats);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative' }}
      onContextMenu={(event) => event.preventDefault()}
    >
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
        {sectionPlaneGuidesEnabled && activeCutPlaneDefs.length > 0 && (
          <SectionPlaneGuides
            cutPlanes={activeCutPlaneDefs}
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
                  showHoverTooltip({
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

      {objectPickSyncEnabled && !measureMode && (
        <div
          ref={hoverTooltipRef}
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
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
            visibility: 'hidden',
            opacity: 0,
          }}
        ></div>
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

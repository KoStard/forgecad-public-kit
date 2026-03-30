import type { CutPlaneDef } from '@forge/cutPlane';
import type { ExplodeViewOptions, JointViewDef, SceneObject } from '@forge/index';
import { DEFAULT_VIEW_CONFIG } from '@forge/index';
import { findJointAnimationClip, resolveJointAnimation } from '@forge/assembly/jointAnimation';
import { resolveJointViewValues } from '@forge/assembly/jointsView';
import type { SceneConfig } from '@forge/scene';
import { getSketchWorldMatrix } from '@forge/sketch/placement3d';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useDrawStore } from '../../draw/drawStore';
import { useFeatureFlag } from '../../featureFlags';
import { useForgeStore } from '../../store/forgeStore';
import { buildExplodeTree, computeExplodeTreeOffsets } from './explodeTree';
import { expandBoundsByTransformedAabb } from './geometryUtils';
import { computeJointNodeMatrices } from './jointUtils';
import { isObjectExcludedFromCutPlane, SECTION_EXPLORER_PLANE_NAME, toClippingPlane } from './sectionUtils';
import { type HoveredJointOverlayState, IDENTITY_MATRIX, ZERO_OFFSET, type ViewportPerformanceInfo } from './types';

export function useViewportState() {
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
  const dimensionsVisible = useForgeStore((s) => s.dimensionsVisible);
  const _surfacesVisible = useForgeStore((s) => s.surfacesVisible);
  const cutPlaneEnabled = useForgeStore((s) => s.cutPlaneEnabled);
  const sectionExplorerEnabled = useForgeStore((s) => s.sectionExplorerEnabled);
  const sectionExplorerNormal = useForgeStore((s) => s.sectionExplorerNormal);
  const sectionExplorerOffset = useForgeStore((s) => s.sectionExplorerOffset);
  const sectionExplorerFlip = useForgeStore((s) => s.sectionExplorerFlip);
  const sectionPlaneGuidesEnabled = useForgeStore((s) => s.sectionPlaneGuidesEnabled);
  const sectionPlaneFillEnabled = useForgeStore((s) => s.sectionPlaneFillEnabled);
  const sectionPlaneFillOpacity = useForgeStore((s) => s.sectionPlaneFillOpacity);
  const sectionPlaneBorderEnabled = useForgeStore((s) => s.sectionPlaneBorderEnabled);
  const sectionPlaneAxisEnabled = useForgeStore((s) => s.sectionPlaneAxisEnabled);
  const themeName = useForgeStore((s) => s.theme);

  const drawFlagEnabled = useFeatureFlag('drawMode');
  const drawModeActive = useDrawStore((s) => s.active) && drawFlagEnabled;

  const objects = useMemo(() => result?.objects ?? [], [result]);
  const dimensions = useMemo(() => result?.dimensions ?? [], [result]);
  const debugHighlights3D = useMemo(() => result?.debugHighlights3D ?? [], [result]);
  const cutPlaneDefs = useMemo((): CutPlaneDef[] => result?.cutPlanes ?? [], [result]);
  const explodeConfig = useMemo((): ExplodeViewOptions | null => result?.explodeView ?? null, [result]);
  const jointsConfig = useMemo(() => result?.jointsView ?? null, [result]);
  const jointOverlayConfig = useMemo(() => result?.viewConfig?.jointOverlay ?? DEFAULT_VIEW_CONFIG.jointOverlay, [result]);
  const sceneConfig = useMemo((): SceneConfig | null => result?.sceneConfig ?? null, [result]);

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

  const shapeHighlightByIndex = useMemo(() => {
    const map = new Map<number, { color: string; pulse?: boolean }>();
    for (const hl of debugHighlights3D) {
      if (hl.kind === 'shape') {
        map.set(hl.shapeIndex, { color: hl.color ?? '#ff00ff', pulse: hl.pulse });
      }
    }
    return map;
  }, [debugHighlights3D]);

  const activeCutPlaneDefs = useMemo(() => {
    const scriptPlanes = cutPlaneDefs
      .filter((cp) => cutPlaneEnabled[cp.name])
      .filter((cp) => new THREE.Vector3(cp.normal[0], cp.normal[1], cp.normal[2]).lengthSq() > 1e-8);

    if (!sectionExplorerEnabled) return scriptPlanes;

    // Merge the interactive section explorer plane into active cut planes.
    // The flip flag reverses which side gets clipped.
    const n = sectionExplorerFlip
      ? ([-sectionExplorerNormal[0], -sectionExplorerNormal[1], -sectionExplorerNormal[2]] as [number, number, number])
      : sectionExplorerNormal;
    const explorerPlane: CutPlaneDef = {
      name: SECTION_EXPLORER_PLANE_NAME,
      normal: n,
      offset: sectionExplorerFlip ? -sectionExplorerOffset : sectionExplorerOffset,
    };
    return [...scriptPlanes, explorerPlane];
  }, [cutPlaneDefs, cutPlaneEnabled, sectionExplorerEnabled, sectionExplorerNormal, sectionExplorerOffset, sectionExplorerFlip]);

  // Script-defined planes only (excluding interactive explorer) — used for guide visuals.
  const scriptCutPlaneDefs = useMemo(
    () => activeCutPlaneDefs.filter((cp) => cp.name !== SECTION_EXPLORER_PLANE_NAME),
    [activeCutPlaneDefs],
  );

  const { objectCutPlanesById, objectClippingPlanesById, hasAnyObjectCutPlanes } = useMemo(() => {
    const cutPlanesById: Record<string, CutPlaneDef[]> = {};
    const clippingPlanesById: Record<string, THREE.Plane[]> = {};
    let hasAnyCutPlanes = false;

    objects.forEach((obj) => {
      const applicable = activeCutPlaneDefs.filter((cp) => !isObjectExcludedFromCutPlane(obj, cp));
      // CPU boolean trimming only for script-defined planes (skip interactive explorer
      // to keep drag smooth — it uses GPU-only clipping).
      cutPlanesById[obj.id] = applicable.filter((cp) => cp.name !== SECTION_EXPLORER_PLANE_NAME);
      // GPU clipping includes ALL planes (script + explorer).
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

  // Joint animation RAF loop
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

  const anySectionActive = activeCutPlaneDefs.length > 0;
  const sectionGuideBoundsKey = (sectionPlaneGuidesEnabled || sectionExplorerEnabled) && anySectionActive ? objectMatrices : null;

  const sectionGuideSize = useMemo(() => {
    if (!anySectionActive) {
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
  }, [anySectionActive, gridSize, objects, sectionGuideBoundsKey]);

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

  const focusedObjectIdSet = useMemo(() => new Set(focusedObjectIds), [focusedObjectIds]);

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

  const [toolpathProgress, setToolpathProgress] = useState(1);
  const prevResultRef = useRef(result);
  if (prevResultRef.current !== result) {
    prevResultRef.current = result;
    if (toolpathProgress !== 1) setToolpathProgress(1);
  }

  const [performanceInfo, setPerformanceInfo] = useState<ViewportPerformanceInfo | null>(null);
  const reactRenderCountRef = useRef(0);
  reactRenderCountRef.current += 1;

  return {
    measureMode,
    isEvaluating,
    evaluationPhase,
    result,
    previewFile,
    files,
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
    explodeAmount,
    viewCommand,
    requestViewCommand,
    clearViewCommand,
    jointValues,
    jointAnimationClip,
    jointAnimationProgress,
    jointAnimationPlaying,
    jointAnimationSpeed,
    hoveredJointName,
    setJointAnimationProgress,
    setJointAnimationPlaying,
    lengthUnit,
    constructionGhost,
    objects,
    dimensions,
    debugHighlights3D,
    dimensionsVisible,
    cutPlaneEnabled,
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
    explodeOffsets,
    jointMatrices,
    objectMatrices,
    constructionGhostMatrix,
    joints,
    jointCouplings,
    jointAnimations,
    activeJointAnimation,
    animatedJointValues,
    effectiveJointValues,
    sectionGuideSize,
    jointOverlayBaseSize,
    hoveredJointOverlay,
    jointOverlayConfig,
    hasShape,
    isSketchOnly,
    knownFileNames,
    cutPlaneDefs,
    explodeConfig,
    jointsConfig,
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
    _surfacesVisible,
  };
}

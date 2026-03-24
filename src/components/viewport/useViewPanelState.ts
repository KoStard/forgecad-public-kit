import type { CutPlaneDef } from '@forge/cutPlane';
import type { SceneObject } from '@forge/index';
import { findJointAnimationClip, resolveJointAnimation } from '@forge/assembly/jointAnimation';
import { resolveJointViewValues } from '@forge/assembly/jointsView';
import { useEffect, useMemo, useRef, useState } from 'react';
import { getCameraForwardVector } from '../../capture/cameraState';
import { formatRenderSceneCliSpec, type ViewportRenderSceneState } from '../../capture/renderSceneState';
import type { ViewportCameraState } from '../../capture/cameraState';
import { useForgeStore } from '../../store/forgeStore';

const DEFAULT_OBJECT_SETTINGS = { visible: true, opacity: 1, color: '#5b9bd5' } as const;

const shellQuoteArg = (value: string): string => `'${value.replace(/'/g, `'"'"'`)}'`;

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

  return Object.keys(objectOverrides).length > 0 ? { camera, objects: objectOverrides } : { camera };
};

export function useViewPanelState() {
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
  const _updateSketchConstraint = useForgeStore((s) => s.updateSketchConstraint);
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

  const cutPlanes = useMemo((): CutPlaneDef[] => result?.cutPlanes ?? [], [result]);
  const joints = useMemo(
    () => (result?.jointsView?.enabled === false ? [] : (result?.jointsView?.joints ?? [])),
    [result],
  );
  const jointCouplings = useMemo(
    () => (result?.jointsView?.enabled === false ? [] : (result?.jointsView?.couplings ?? [])),
    [result],
  );
  const animationClips = useMemo(
    () => (result?.jointsView?.enabled === false ? [] : (result?.jointsView?.animations ?? [])),
    [result],
  );

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
  const coupledJointNames = useMemo(() => new Set(jointCouplings.map((coupling) => coupling.joint)), [jointCouplings]);
  const focusedObjectIdSet = useMemo(() => new Set(focusedObjectIds), [focusedObjectIds]);
  const [sceneCopyStatus, setSceneCopyStatus] = useState<string | null>(null);
  const [constraintsSectionOpen, setConstraintsSectionOpen] = useState(true);
  const sceneCopyTimeoutRef = useRef<number | null>(null);
  const cameraForward = useMemo(
    () => (viewportCameraState ? getCameraForwardVector(viewportCameraState) : null),
    [viewportCameraState],
  );
  const displayedAnimationProgress =
    activeAnimationClip?.loop && activeAnimationClip.continuous
      ? jointAnimationProgress - Math.floor(jointAnimationProgress)
      : Math.max(0, Math.min(1, jointAnimationProgress));

  useEffect(() => {
    if (!hoveredJointName) return;
    if (joints.some((joint) => joint.name === hoveredJointName)) return;
    setHoveredJointName(null);
  }, [hoveredJointName, joints, setHoveredJointName]);

  const objects = useMemo((): SceneObject[] => result?.objects ?? [], [result]);

  const cliSceneState = useMemo(
    () => (viewportCameraState ? buildViewportRenderSceneState(viewportCameraState, objects, objectSettings) : null),
    [objectSettings, objects, viewportCameraState],
  );
  const sceneObjectOverrideCount = useMemo(() => Object.keys(cliSceneState?.objects ?? {}).length, [cliSceneState]);

  const selectedObject = useMemo(
    () => objects.find((obj) => obj.id === selectedObjectId) ?? null,
    [objects, selectedObjectId],
  );
  const objectItemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const constraintMeta = selectedObject?.sketchMeta ?? null;
  const constraintStatusColor =
    constraintMeta?.status === 'over'
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

  return {
    activeBackend,
    setActiveBackend,
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
    result,
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
    _updateSketchConstraint,
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
    cutPlanes,
    joints,
    jointCouplings,
    animationClips,
    activeAnimationClip,
    animatedJointValues,
    displayedJointValues,
    displayedRawJointValues,
    coupledJointNames,
    focusedObjectIdSet,
    sceneCopyStatus,
    constraintsSectionOpen,
    setConstraintsSectionOpen,
    cameraForward,
    displayedAnimationProgress,
    objects,
    cliSceneState,
    sceneObjectOverrideCount,
    selectedObject,
    objectItemRefs,
    constraintMeta,
    constraintStatusColor,
    copySceneCliArg,
  };
}

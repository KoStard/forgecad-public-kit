import type { SceneObject } from '@forge/index';
import type { ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useForgeStore } from '../../store/forgeStore';
import { getShortcutKey, hasPrimaryModifier } from '../../editorShortcuts';
import { evalWorkerClient } from '../../workers/evalWorkerClient';
import type { EvalWorkerFaceInfoResult } from '../../workers/evalWorkerProtocol';
import { resolveHoverObjectName } from './cameraPersistence';
import { isTextEntryTarget } from './geometryUtils';
import {
  OBJECT_CONTEXT_MENU_HEIGHT,
  OBJECT_CONTEXT_MENU_MARGIN,
  OBJECT_CONTEXT_MENU_WIDTH,
  type ObjectContextMenuState,
  type SketchEntityInfoPanel,
} from './types';
import type { SketchHoveredEntity } from './types';
import type { ViewportPerformanceInfo } from './types';

interface UseViewportHandlersInput {
  containerRef: RefObject<HTMLDivElement | null>;
  hoverTooltipRef: RefObject<HTMLDivElement | null>;
  hoverTooltipIdRef: RefObject<string | null>;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  measureMode: boolean;
  isViewportInteracting: boolean;
  objectPickSyncEnabled: boolean;
  hoveredObjectId: string | null;
  knownFileNames: Set<string>;
  objects: SceneObject[];
  selectObject: (id: string) => void;
  focusObject: (id: string, opts?: { additive?: boolean }) => void;
  clearFocusedObject: () => void;
  setHoveredObjectId: (id: string | null) => void;
  setObjectVisibility: (id: string, visible: boolean) => void;
  requestViewCommand: (cmd: any) => void;
  viewPersistenceResolved: boolean;
  viewCommand: any;
  previewFile: string | null | undefined;
  initialFitRequestedRef: RefObject<boolean>;
  prevPreviewFileRef: RefObject<string | null | undefined>;
  setPerformanceInfo: (v: ViewportPerformanceInfo | null) => void;
}

export interface ViewportHandlers {
  objectContextMenu: ObjectContextMenuState | null;
  setObjectContextMenu: (v: ObjectContextMenuState | null) => void;
  closeObjectContextMenu: () => void;
  faceInfoPanel: {
    objectId: string;
    faceName: string | null;
    hitNormal: [number, number, number] | null;
    x: number;
    y: number;
  } | null;
  setFaceInfoPanel: React.Dispatch<React.SetStateAction<{
    objectId: string;
    faceName: string | null;
    hitNormal: [number, number, number] | null;
    x: number;
    y: number;
  } | null>>;
  faceInfoData: EvalWorkerFaceInfoResult | null;
  faceInfoLoading: boolean;
  sketchEntityInfo: SketchEntityInfoPanel | null;
  setSketchEntityInfo: (v: SketchEntityInfoPanel | null) => void;
  hideHoverTooltip: (id?: string | null) => void;
  showHoverTooltip: (label: { id: string; name: string; x: number; y: number }) => void;
  updateHoverLabel: (obj: SceneObject, event: ThreeEvent<PointerEvent>) => void;
  clearHoverLabel: (obj: SceneObject, event: ThreeEvent<PointerEvent>) => void;
  handleObjectClick: (obj: SceneObject, event: ThreeEvent<MouseEvent>) => void;
  handleObjectDoubleClick: (obj: SceneObject, event: ThreeEvent<MouseEvent>) => void;
  handleObjectContextMenu: (obj: SceneObject, event: ThreeEvent<MouseEvent>) => void;
  handleHideObject: () => void;
  handleGetFaceInfo: () => void;
  handleSketchEntityClick: (entity: SketchHoveredEntity, clientX: number, clientY: number) => void;
  handleViewportPointerMissed: (event: MouseEvent) => void;
  handlePerformanceInfoChange: (stats: ViewportPerformanceInfo | null) => void;
  handleViewPersistenceResolved: (restored: boolean) => void;
}

export function useViewportHandlers({
  containerRef,
  hoverTooltipRef,
  hoverTooltipIdRef,
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
  setObjectVisibility,
  requestViewCommand,
  viewPersistenceResolved,
  viewCommand,
  previewFile,
  initialFitRequestedRef,
  prevPreviewFileRef,
  setPerformanceInfo,
}: UseViewportHandlersInput): ViewportHandlers {
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
  }, [hoverTooltipIdRef, hoverTooltipRef]);

  const showHoverTooltip = useCallback((label: { id: string; name: string; x: number; y: number }) => {
    hoverTooltipIdRef.current = label.id;
    const tooltip = hoverTooltipRef.current;
    if (!tooltip) return;
    if (tooltip.textContent !== label.name) tooltip.textContent = label.name;
    tooltip.style.left = `${label.x}px`;
    tooltip.style.top = `${label.y}px`;
    tooltip.style.visibility = 'visible';
    tooltip.style.opacity = '1';
  }, [hoverTooltipIdRef, hoverTooltipRef]);

  const handleViewPersistenceResolved = useCallback((restored: boolean) => {
    if (restored) {
      initialFitRequestedRef.current = true;
    }
  }, [initialFitRequestedRef]);

  useEffect(() => {
    if (!viewPersistenceResolved) return;
    if (initialFitRequestedRef.current) return;
    if (viewCommand) return;
    if (objects.length === 0) return;
    initialFitRequestedRef.current = true;
    requestViewCommand({ type: 'fit' });
  }, [objects.length, requestViewCommand, viewCommand, viewPersistenceResolved, initialFitRequestedRef]);

  // Auto-fit whenever a different model finishes loading
  useEffect(() => {
    const prev = prevPreviewFileRef.current;
    prevPreviewFileRef.current = previewFile;
    if (prev === undefined) return;
    if (prev === previewFile) return;
    if (objects.length === 0) return;
    requestViewCommand({ type: 'fit' });
  }, [previewFile, objects.length, requestViewCommand, prevPreviewFileRef]);

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
  }, [closeObjectContextMenu, contextMenuRef, objectContextMenu]);

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
    [containerRef, hideHoverTooltip, isViewportInteracting, knownFileNames, measureMode, objectPickSyncEnabled, setHoveredObjectId, showHoverTooltip],
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
      let hitNormal: [number, number, number] | undefined;
      if (event.face) {
        const n = event.face.normal.clone().transformDirection(event.object.matrixWorld);
        hitNormal = [n.x, n.y, n.z];
      }
      setObjectContextMenu({ objectId: obj.id, x, y, hitNormal });
    },
    [containerRef, isViewportInteracting, measureMode, selectObject],
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
  }, [containerRef]);

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
  }, [setPerformanceInfo]);

  return {
    objectContextMenu,
    setObjectContextMenu,
    closeObjectContextMenu,
    faceInfoPanel,
    setFaceInfoPanel,
    faceInfoData,
    faceInfoLoading,
    sketchEntityInfo,
    setSketchEntityInfo,
    hideHoverTooltip,
    showHoverTooltip,
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
    handleViewPersistenceResolved,
  };
}

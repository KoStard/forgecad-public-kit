import type { SceneObject } from '@forge/index';
import { useThree } from '@react-three/fiber';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { type ViewportCameraState } from '../../capture/cameraState';
import { type ObjectSettings, type ProjectionMode, useForgeStore, type ViewCommand } from '../../store/forgeStore';
import { readPersistedViewportCameraState, writePersistedViewportCameraState } from './cameraPersistence';
import { computeSceneObjectBounds } from './geometryUtils';

/**
 * ViewController — handles view commands (fit, snap) by computing bounds
 * and repositioning the camera accordingly.
 */
export function ViewController({
  controlsRef,
  command,
  objects,
  objectMatrices,
  settings,
  focusedObjectIds,
  clearCommand,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  command: ViewCommand | null;
  objects: SceneObject[];
  objectMatrices: Record<string, THREE.Matrix4>;
  settings: Record<string, ObjectSettings>;
  focusedObjectIds: string[];
  clearCommand: () => void;
}) {
  const { camera, size } = useThree();

  useEffect(() => {
    if (!command) return;
    const visibleObjects = objects.filter((obj) => settings[obj.id]?.visible);
    const focusedIdSet = new Set(focusedObjectIds);
    const focusedVisibleObjects = focusedIdSet.size > 0 ? visibleObjects.filter((obj) => focusedIdSet.has(obj.id)) : [];
    const useFocusedScope = !command.targetId && focusedVisibleObjects.length > 0;
    const targetObjects = command.targetId
      ? visibleObjects.filter((obj) => obj.id === command.targetId)
      : useFocusedScope
        ? focusedVisibleObjects
        : visibleObjects;

    const bounds = new THREE.Box3();
    let hasBounds = false;
    targetObjects.forEach((obj) => {
      const box = computeSceneObjectBounds(obj, objectMatrices);
      if (box) {
        if (!hasBounds) bounds.copy(box);
        else bounds.union(box);
        hasBounds = true;
      }
    });

    if (!hasBounds) {
      clearCommand();
      return;
    }

    const center = new THREE.Vector3();
    bounds.getCenter(center);
    const sizeVec = new THREE.Vector3();
    bounds.getSize(sizeVec);
    const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z, 1);

    const snapUsesScopedCenter = command.type === 'snap' && useFocusedScope;

    // "snap" (Home / standard views) targets origin unless focus mode scopes it to a subset.
    const target = command.type === 'snap' && !snapUsesScopedCenter ? new THREE.Vector3(0, 0, 0) : center;
    // Distance must cover model extent + offset from target.
    const maxReach =
      command.type === 'snap' && !snapUsesScopedCenter
        ? Math.max(sizeVec.x / 2 + Math.abs(center.x), sizeVec.y / 2 + Math.abs(center.y), sizeVec.z / 2 + Math.abs(center.z)) * 2
        : maxDim;

    const controls = controlsRef.current;
    const camDir = new THREE.Vector3();
    if (command.type === 'snap') {
      // Camera position direction (Z-up convention, see coordinate-system.md)
      const viewMap: Record<string, THREE.Vector3> = {
        front: new THREE.Vector3(0, -1, 0),
        back: new THREE.Vector3(0, 1, 0),
        right: new THREE.Vector3(1, 0, 0),
        left: new THREE.Vector3(-1, 0, 0),
        top: new THREE.Vector3(0, 0, 1),
        bottom: new THREE.Vector3(0, 0, -1),
        iso: new THREE.Vector3(1, -1, 1),
      };
      // Camera up vector — top/bottom views need special up to avoid gimbal lock
      // Top: up=(0,1,0) so screen-right=X, screen-up=Y
      // Bottom: up=(0,-1,0) so screen-right=X, screen-up=-Y
      const upMap: Record<string, THREE.Vector3> = {
        top: new THREE.Vector3(0, 1, 0),
        bottom: new THREE.Vector3(0, -1, 0),
      };
      camDir.copy(viewMap[command.view ?? 'iso']).normalize();
      const up = upMap[command.view ?? ''] ?? new THREE.Vector3(0, 0, 1);
      camera.up.copy(up);
    } else if (controls) {
      camDir.subVectors(camera.position, controls.target).normalize();
      if (camDir.lengthSq() === 0) camDir.set(1, 1, 1).normalize();
    } else {
      camDir.set(1, 1, 1).normalize();
    }

    const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
    if (isOrtho) {
      const ortho = camera as THREE.OrthographicCamera;
      const zoom = Math.min(size.width, size.height) / maxReach / 2.2;
      ortho.zoom = Math.max(0.1, zoom);
      ortho.position.copy(target.clone().add(camDir.multiplyScalar(maxReach * 2)));
      ortho.updateProjectionMatrix();
    } else {
      const persp = camera as THREE.PerspectiveCamera;
      const dist = (maxReach / (2 * Math.tan((persp.fov * Math.PI) / 360))) * 1.4;
      persp.position.copy(target.clone().add(camDir.multiplyScalar(dist)));
      persp.updateProjectionMatrix();
    }

    if (controls) {
      controls.target.copy(target);
      controls.update();
    } else {
      camera.lookAt(target);
    }

    clearCommand();
  }, [camera, clearCommand, command, controlsRef, focusedObjectIds, objectMatrices, objects, settings, size.height, size.width]);

  return null;
}

/**
 * ViewManager — manages view state, handling sketch mode toggling
 * (switches to orthographic when entering sketch-only mode, restores on exit).
 */
export function ViewManager({
  isSketchOnly,
  controlsRef,
}: {
  isSketchOnly: boolean;
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
}) {
  const { camera } = useThree();
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const wasSketchOnlyRef = useRef(false);
  const savedProjectionRef = useRef<ProjectionMode>('perspective');

  useEffect(() => {
    if (isSketchOnly && !wasSketchOnlyRef.current) {
      savedProjectionRef.current = projectionMode;
    }

    if (isSketchOnly) {
      // Switch to straight-on 2D view
      camera.position.set(0, 0, 200);
      camera.lookAt(0, 0, 0);
      camera.up.set(0, 0, 1);
      if (controlsRef.current) {
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
      if (projectionMode !== 'orthographic') {
        setProjectionMode('orthographic');
      }
    } else if (wasSketchOnlyRef.current) {
      const restoreMode = savedProjectionRef.current ?? 'perspective';
      if (projectionMode !== restoreMode) {
        setProjectionMode(restoreMode);
      }
    }

    wasSketchOnlyRef.current = isSketchOnly;
  }, [camera, controlsRef, isSketchOnly, projectionMode, setProjectionMode]);

  return null;
}

/**
 * ViewPersistence — persists and restores camera state to/from localStorage.
 * On mount it reads the saved state and restores camera position, target, up vector,
 * and projection mode. During use it debounces camera changes and writes them back.
 */
export function ViewPersistence({
  controlsRef,
  isSketchOnly,
  onResolved,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  isSketchOnly: boolean;
  onResolved: (restored: boolean) => void;
}) {
  const { camera } = useThree();
  const projectionMode = useForgeStore((s) => s.projectionMode);
  const setProjectionMode = useForgeStore((s) => s.setProjectionMode);
  const setViewportCameraState = useForgeStore((s) => s.setViewportCameraState);
  const restoreStatusRef = useRef<'pending' | 'done'>('pending');
  const didResolveRef = useRef(false);
  const savedStateRef = useRef<ViewportCameraState | null>(readPersistedViewportCameraState());
  const persistTimeoutRef = useRef<number | null>(null);

  const resolve = useCallback(
    (restored: boolean) => {
      if (didResolveRef.current) return;
      didResolveRef.current = true;
      onResolved(restored);
    },
    [onResolved],
  );

  useEffect(() => {
    if (isSketchOnly) {
      restoreStatusRef.current = 'done';
      resolve(false);
    }
  }, [isSketchOnly, resolve]);

  useEffect(() => {
    if (isSketchOnly) return;
    if (restoreStatusRef.current === 'done') return;

    const saved = savedStateRef.current;
    if (!saved) {
      restoreStatusRef.current = 'done';
      resolve(false);
      return;
    }

    if (saved.projectionMode !== projectionMode) {
      setProjectionMode(saved.projectionMode);
      return;
    }

    const controls = controlsRef.current;
    if (!controls) return;

    camera.position.set(saved.position[0], saved.position[1], saved.position[2]);
    camera.up.set(saved.up[0], saved.up[1], saved.up[2]);

    if ((camera as THREE.OrthographicCamera).isOrthographicCamera && saved.orthoZoom !== undefined) {
      const ortho = camera as THREE.OrthographicCamera;
      ortho.zoom = Math.max(0.1, saved.orthoZoom);
      ortho.updateProjectionMatrix();
    } else {
      camera.updateProjectionMatrix();
    }

    controls.target.set(saved.target[0], saved.target[1], saved.target[2]);
    controls.update();

    restoreStatusRef.current = 'done';
    resolve(true);
  }, [camera, controlsRef, isSketchOnly, projectionMode, resolve, setProjectionMode]);

  useEffect(() => {
    if (restoreStatusRef.current !== 'done') return;
    if (isSketchOnly) return;

    const controls = controlsRef.current;
    if (!controls) return;

    const persistCamera = () => {
      const isOrtho = (camera as THREE.OrthographicCamera).isOrthographicCamera;
      const nextState: ViewportCameraState = {
        projectionMode,
        position: [camera.position.x, camera.position.y, camera.position.z],
        target: [controls.target.x, controls.target.y, controls.target.z],
        up: [camera.up.x, camera.up.y, camera.up.z],
        orthoZoom: isOrtho ? Math.max(0.1, (camera as THREE.OrthographicCamera).zoom) : undefined,
      };
      writePersistedViewportCameraState(nextState);
      setViewportCameraState(nextState);
    };

    const schedulePersistCamera = () => {
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
      }
      persistTimeoutRef.current = window.setTimeout(() => {
        persistTimeoutRef.current = null;
        persistCamera();
      }, 140);
    };

    persistCamera();
    controls.addEventListener('change', schedulePersistCamera);
    return () => {
      controls.removeEventListener('change', schedulePersistCamera);
      if (persistTimeoutRef.current !== null) {
        window.clearTimeout(persistTimeoutRef.current);
        persistTimeoutRef.current = null;
        persistCamera();
      }
    };
  }, [camera, controlsRef, isSketchOnly, projectionMode, setViewportCameraState]);

  return null;
}

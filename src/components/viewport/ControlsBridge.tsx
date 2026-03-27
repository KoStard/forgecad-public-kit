import { useThree } from '@react-three/fiber';
import { applyPalette, GIFEncoder, quantize } from 'gifenc';
import { type MutableRefObject, useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { useForgeStore } from '../../store/forgeStore';
import { type OrbitGifExportOptions, type OrbitGifMode, registerOrbitGifExporter } from '../exportActions';
import {
  applyOrbitPose,
  createOverrideSessionFromRunResult,
  disposeOverrideSession,
  GIF_DEFAULT_FPS,
  GIF_DEFAULT_FRAMES_PER_TURN,
  GIF_DEFAULT_HOLD_FRAMES,
  GIF_DEFAULT_PITCH_DEG,
  GIF_DEFAULT_SIZE,
  setOverrideOrbitCamera,
  setOverrideSessionMode,
} from './orbitGif';
import { waitForAnimationFrame } from './types';

// ---------------------------------------------------------------------------
// ControlsInteractionBridge
// ---------------------------------------------------------------------------

/**
 * Bridges OrbitControls events to set interaction state (active / idle).
 * Renders nothing — purely side-effect driven.
 */
export function ControlsInteractionBridge({
  controlsRef,
  onInteractionChange,
}: {
  controlsRef: MutableRefObject<OrbitControlsImpl | null>;
  onInteractionChange: (active: boolean) => void;
}) {
  const idleTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const markActive = () => {
      onInteractionChange(true);
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
      }
      idleTimeoutRef.current = window.setTimeout(() => {
        idleTimeoutRef.current = null;
        onInteractionChange(false);
      }, 140);
    };

    controls.addEventListener('start', markActive);
    controls.addEventListener('change', markActive);
    controls.addEventListener('end', markActive);

    return () => {
      controls.removeEventListener('start', markActive);
      controls.removeEventListener('change', markActive);
      controls.removeEventListener('end', markActive);
      if (idleTimeoutRef.current !== null) {
        window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      onInteractionChange(false);
    };
  }, [controlsRef, onInteractionChange]);

  return null;
}

// ---------------------------------------------------------------------------
// OrbitGifExporterBridge
// ---------------------------------------------------------------------------

/**
 * Registers an orbit-GIF exporter that captures frames by manipulating the
 * camera / renderer and encoding them into an animated GIF.
 * Renders nothing — purely side-effect driven.
 */
export function OrbitGifExporterBridge({ controlsRef }: { controlsRef: MutableRefObject<OrbitControlsImpl | null> }) {
  const { camera, gl, scene } = useThree();
  const setRenderMode = useForgeStore((s) => s.setRenderMode);

  const exportOrbitGif = useCallback(
    async (options?: OrbitGifExportOptions): Promise<Blob> => {
      const size = Math.max(64, Math.min(2048, Math.round(options?.size ?? GIF_DEFAULT_SIZE)));
      const fps = Math.max(1, Math.round(options?.fps ?? GIF_DEFAULT_FPS));
      const framesPerTurn = Math.max(1, Math.round(options?.framesPerTurn ?? GIF_DEFAULT_FRAMES_PER_TURN));
      const holdFrames = Math.max(0, Math.round(options?.holdFrames ?? GIF_DEFAULT_HOLD_FRAMES));
      const pitchDeg = options?.pitchDeg ?? GIF_DEFAULT_PITCH_DEG;
      const includeWireframePass = options?.includeWireframePass ?? true;
      const delayMs = Math.max(20, Math.round(1000 / fps));
      const modePlan: OrbitGifMode[] = includeWireframePass ? ['solid', 'wireframe'] : ['solid'];
      const encoder = GIFEncoder();

      const captureCanvas = document.createElement('canvas');
      captureCanvas.width = size;
      captureCanvas.height = size;
      const captureCtx = captureCanvas.getContext('2d', { willReadFrequently: true });
      if (!captureCtx) {
        throw new Error('Could not create GIF capture context.');
      }

      const overrideSession = options?.runResult
        ? createOverrideSessionFromRunResult(options.runResult, options.objectSettings, options.background)
        : null;

      const controls = controlsRef.current;
      const orbitTarget = overrideSession ? overrideSession.center.clone() : (controls?.target.clone() ?? new THREE.Vector3(0, 0, 0));
      let orbitRadius = overrideSession ? overrideSession.distance : camera.position.distanceTo(orbitTarget);
      if (!Number.isFinite(orbitRadius) || orbitRadius <= 1e-3) orbitRadius = 160;

      const prevCameraPos = camera.position.clone();
      const prevCameraQuat = camera.quaternion.clone();
      const prevCameraUp = camera.up.clone();
      const prevRenderMode = useForgeStore.getState().renderMode;
      const prevControlsTarget = controls?.target.clone() ?? null;
      const prevDamping = controls?.enableDamping ?? null;
      const prevSize = gl.getSize(new THREE.Vector2());
      const prevPixelRatio = gl.getPixelRatio();

      let frameIndex = 0;
      const writeFrame = async (mode: OrbitGifMode, turn: number): Promise<void> => {
        await waitForAnimationFrame();

        if (overrideSession) {
          setOverrideSessionMode(overrideSession, mode);
          setOverrideOrbitCamera(overrideSession, turn, pitchDeg);
          gl.render(overrideSession.scene, overrideSession.camera);
        } else {
          setRenderMode(mode);
          applyOrbitPose(camera, orbitTarget, orbitRadius, turn, pitchDeg);
          if (controls) {
            controls.target.copy(orbitTarget);
            controls.update();
          }
          gl.render(scene, camera);
        }

        captureCtx.clearRect(0, 0, size, size);
        captureCtx.drawImage(gl.domElement, 0, 0, size, size);
        const image = captureCtx.getImageData(0, 0, size, size);
        const palette = quantize(image.data, 256);
        const indexed = applyPalette(image.data, palette);

        if (frameIndex === 0) {
          encoder.writeFrame(indexed, size, size, {
            palette,
            delay: delayMs,
            repeat: 0,
          });
        } else {
          encoder.writeFrame(indexed, size, size, {
            palette,
            delay: delayMs,
          });
        }

        frameIndex += 1;
      };

      try {
        if (controls && !overrideSession) controls.enableDamping = false;
        gl.setPixelRatio(2);
        gl.setSize(size, size, false);

        for (const mode of modePlan) {
          for (let i = 0; i < holdFrames; i += 1) {
            await writeFrame(mode, 0);
          }
          for (let i = 0; i < framesPerTurn; i += 1) {
            await writeFrame(mode, i / framesPerTurn);
          }
        }

        encoder.finish();
        const bytes = new Uint8Array(encoder.bytes());
        return new Blob([bytes], { type: 'image/gif' });
      } finally {
        if (overrideSession) {
          disposeOverrideSession(overrideSession);
        } else {
          setRenderMode(prevRenderMode);
          await waitForAnimationFrame();

          camera.position.copy(prevCameraPos);
          camera.quaternion.copy(prevCameraQuat);
          camera.up.copy(prevCameraUp);
          if (controls && prevControlsTarget) {
            controls.target.copy(prevControlsTarget);
          }
          if (controls && prevDamping !== null) {
            controls.enableDamping = prevDamping;
            controls.update();
          } else if (!controls && prevControlsTarget) {
            camera.lookAt(prevControlsTarget);
          }
        }

        gl.setPixelRatio(prevPixelRatio);
        gl.setSize(prevSize.x, prevSize.y, false);
        gl.render(scene, camera);
      }
    },
    [camera, controlsRef, gl, scene, setRenderMode],
  );

  useEffect(() => {
    registerOrbitGifExporter(exportOrbitGif);
    return () => {
      registerOrbitGifExporter(null);
    };
  }, [exportOrbitGif]);

  return null;
}

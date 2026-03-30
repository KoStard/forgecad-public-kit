/**
 * Shared joint animation state, RAF playback loop, and per-object joint matrix computation.
 * Consumed by both desktop (useViewportState / useViewPanelState) and mobile (MobileApp).
 */

import type { JointViewAnimationDef, JointViewCouplingDef, JointViewDef, SceneObject } from '@forge/index';
import { findJointAnimationClip, resolveJointAnimation } from '@forge/assembly/jointAnimation';
import { resolveJointViewValues } from '@forge/assembly/jointsView';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useForgeStore } from '../../store/forgeStore';

/**
 * Derives joint/animation config arrays from the execution result.
 */
export function useJointsConfig() {
  const result = useForgeStore((s) => s.lastValidResult);
  const jointsConfig = useMemo(() => result?.jointsView ?? null, [result]);

  const joints = useMemo(() => (jointsConfig?.enabled === false ? [] : (jointsConfig?.joints ?? [])), [jointsConfig]);
  const jointCouplings = useMemo(() => (jointsConfig?.enabled === false ? [] : (jointsConfig?.couplings ?? [])), [jointsConfig]);
  const animationClips = useMemo(() => (jointsConfig?.enabled === false ? [] : (jointsConfig?.animations ?? [])), [jointsConfig]);

  return { jointsConfig, joints, jointCouplings, animationClips };
}

/**
 * Derives animated joint values and display-ready values from the current animation state.
 */
export function useJointAnimationValues(
  joints: JointViewDef[],
  jointCouplings: JointViewCouplingDef[],
  animationClips: JointViewAnimationDef[],
) {
  const jointValues = useForgeStore((s) => s.jointValues);
  const jointAnimationClip = useForgeStore((s) => s.jointAnimationClip);
  const jointAnimationProgress = useForgeStore((s) => s.jointAnimationProgress);

  const activeAnimationClip = useMemo(
    () => findJointAnimationClip(animationClips, jointAnimationClip),
    [animationClips, jointAnimationClip],
  );

  const animatedJointValues = useMemo(
    () => resolveJointAnimation(activeAnimationClip, jointAnimationProgress, jointValues),
    [activeAnimationClip, jointAnimationProgress, jointValues],
  );

  const effectiveJointValues = useMemo(
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues, { clamp: false }),
    [animatedJointValues, jointCouplings, joints],
  );

  const displayedJointValues = useMemo(
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues, { clamp: true }),
    [animatedJointValues, jointCouplings, joints],
  );

  const displayedRawJointValues = useMemo(
    () => resolveJointViewValues(joints, jointCouplings, animatedJointValues),
    [animatedJointValues, jointCouplings, joints],
  );

  const coupledJointNames = useMemo(() => new Set(jointCouplings.map((c) => c.joint)), [jointCouplings]);

  const displayedAnimationProgress =
    activeAnimationClip?.loop && activeAnimationClip.continuous
      ? jointAnimationProgress - Math.floor(jointAnimationProgress)
      : Math.max(0, Math.min(1, jointAnimationProgress));

  return {
    activeAnimationClip,
    animatedJointValues,
    effectiveJointValues,
    displayedJointValues,
    displayedRawJointValues,
    coupledJointNames,
    displayedAnimationProgress,
  };
}

/**
 * RAF-based animation playback loop. Advances jointAnimationProgress each frame
 * based on speed and clip duration.
 */
export function useJointAnimationLoop(activeAnimation: JointViewAnimationDef | null) {
  const jointAnimationPlaying = useForgeStore((s) => s.jointAnimationPlaying);
  const jointAnimationSpeed = useForgeStore((s) => s.jointAnimationSpeed);
  const setJointAnimationProgress = useForgeStore((s) => s.setJointAnimationProgress);
  const setJointAnimationPlaying = useForgeStore((s) => s.setJointAnimationPlaying);

  useEffect(() => {
    if (!jointAnimationPlaying || !activeAnimation) return;

    let raf = 0;
    let lastTs = performance.now();
    let cancelled = false;

    const tick = (now: number) => {
      if (cancelled) return;
      const dtSec = Math.max(0, (now - lastTs) / 1000);
      lastTs = now;

      const step = (dtSec * jointAnimationSpeed) / Math.max(1e-6, activeAnimation.duration);
      let next = useForgeStore.getState().jointAnimationProgress + step;
      if (next >= 1) {
        if (!activeAnimation.loop) {
          next = 1;
          setJointAnimationPlaying(false);
        } else if (!activeAnimation.continuous) {
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
  }, [activeAnimation, jointAnimationPlaying, jointAnimationSpeed, setJointAnimationPlaying, setJointAnimationProgress]);
}

/**
 * Computes per-object joint matrices from joint node matrices.
 * Maps each SceneObject to the transform of the joint whose child matches the object's name or groupName.
 */
export function computeObjectJointMatrices(
  joints: JointViewDef[],
  objects: SceneObject[],
  jointNodeMatrices: Map<string, THREE.Matrix4>,
): Record<string, THREE.Matrix4> {
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
}

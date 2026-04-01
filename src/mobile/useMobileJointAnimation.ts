/**
 * Joint animation state for mobile.
 * Thin wrapper around shared hooks — adds the RAF loop and per-object joint matrices.
 */

import { useMemo } from 'react';
import { useForgeStore } from '../store/forgeStore';
import { computeJointNodeMatrices } from '../components/viewport/jointUtils';
import {
  computeObjectJointMatrices,
  useJointAnimationLoop,
  useJointAnimationValues,
  useJointsConfig,
} from '../components/viewport/useJointAnimation';

export function useMobileJointAnimation() {
  const result = useForgeStore((s) => s.lastValidResult);
  const jointAnimationClip = useForgeStore((s) => s.jointAnimationClip);
  const jointAnimationPlaying = useForgeStore((s) => s.jointAnimationPlaying);
  const jointAnimationSpeed = useForgeStore((s) => s.jointAnimationSpeed);
  const setJointAnimationClip = useForgeStore((s) => s.setJointAnimationClip);
  const setJointAnimationProgress = useForgeStore((s) => s.setJointAnimationProgress);
  const setJointAnimationSpeed = useForgeStore((s) => s.setJointAnimationSpeed);
  const toggleJointAnimationPlayback = useForgeStore((s) => s.toggleJointAnimationPlayback);
  const setJointValue = useForgeStore((s) => s.setJointValue);

  const { joints, jointCouplings, animationClips } = useJointsConfig();

  const {
    activeAnimationClip,
    effectiveJointValues,
    displayedJointValues,
    displayedRawJointValues,
    coupledJointNames,
    displayedAnimationProgress,
  } = useJointAnimationValues(joints, jointCouplings, animationClips);

  useJointAnimationLoop(activeAnimationClip);

  const jointNodeMatrices = useMemo(() => computeJointNodeMatrices(joints, effectiveJointValues), [effectiveJointValues, joints]);
  const objects = useMemo(() => result?.objects ?? [], [result]);
  const jointMatrices = useMemo(() => computeObjectJointMatrices(joints, objects, jointNodeMatrices), [jointNodeMatrices, joints, objects]);

  return {
    joints,
    animationClips,
    activeAnimationClip,
    jointAnimationClip,
    jointAnimationPlaying,
    jointAnimationSpeed,
    displayedAnimationProgress,
    displayedJointValues,
    displayedRawJointValues,
    coupledJointNames,
    jointMatrices,
    setJointAnimationClip,
    setJointAnimationProgress,
    setJointAnimationSpeed,
    toggleJointAnimationPlayback,
    setJointValue,
  };
}

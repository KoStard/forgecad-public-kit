import type { JointViewAnimationDef } from './jointsView';

export function clampAnimationProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function findJointAnimationClip(
  clips: JointViewAnimationDef[],
  clipName: string | null | undefined,
): JointViewAnimationDef | null {
  if (!clipName) return null;
  return clips.find((clip) => clip.name === clipName) ?? null;
}

export function resolveJointAnimation(
  clip: JointViewAnimationDef | null | undefined,
  progress: number,
  baseValues: Record<string, number> = {},
): Record<string, number> {
  if (!clip) return { ...baseValues };
  if (clip.keyframes.length === 0) return { ...baseValues };

  const t = clampAnimationProgress(progress);
  const out: Record<string, number> = { ...baseValues };
  const jointNames = new Set<string>();
  clip.keyframes.forEach((keyframe) => {
    Object.keys(keyframe.values).forEach((jointName) => jointNames.add(jointName));
  });

  jointNames.forEach((jointName) => {
    let prev: { at: number; value: number } | null = null;
    let next: { at: number; value: number } | null = null;

    for (const keyframe of clip.keyframes) {
      if (!Object.prototype.hasOwnProperty.call(keyframe.values, jointName)) continue;
      const value = keyframe.values[jointName];
      if (keyframe.at <= t) prev = { at: keyframe.at, value };
      if (keyframe.at >= t) {
        next = { at: keyframe.at, value };
        break;
      }
    }

    if (!prev && !next) return;
    if (!prev) {
      out[jointName] = next!.value;
      return;
    }
    if (!next) {
      out[jointName] = prev.value;
      return;
    }
    if (Math.abs(next.at - prev.at) <= 1e-8) {
      out[jointName] = next.value;
      return;
    }
    const alpha = (t - prev.at) / (next.at - prev.at);
    out[jointName] = prev.value + (next.value - prev.value) * alpha;
  });

  return out;
}

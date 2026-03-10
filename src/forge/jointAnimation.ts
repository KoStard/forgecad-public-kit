import type { JointViewAnimationDef } from './jointsView';

export function clampAnimationProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function sanitizeAnimationProgress(
  clip: JointViewAnimationDef | null | undefined,
  value: number,
): number {
  if (!Number.isFinite(value)) return 0;
  if (clip?.loop && clip.continuous) return Math.max(0, value);
  return clampAnimationProgress(value);
}

function sampleJointValueAt(
  clip: JointViewAnimationDef,
  jointName: string,
  t: number,
): number | null {
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

  if (!prev && !next) return null;
  if (!prev) return next!.value;
  if (!next) return prev.value;
  if (Math.abs(next.at - prev.at) <= 1e-8) return next.value;
  const alpha = (t - prev.at) / (next.at - prev.at);
  return prev.value + (next.value - prev.value) * alpha;
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

  const safeProgress = sanitizeAnimationProgress(clip, progress);
  const continuous = clip.loop && clip.continuous;
  const cycle = continuous ? Math.floor(safeProgress) : 0;
  const t = continuous ? (safeProgress - cycle) : clampAnimationProgress(safeProgress);
  const out: Record<string, number> = { ...baseValues };
  const jointNames = new Set<string>();
  clip.keyframes.forEach((keyframe) => {
    Object.keys(keyframe.values).forEach((jointName) => jointNames.add(jointName));
  });

  jointNames.forEach((jointName) => {
    const value = sampleJointValueAt(clip, jointName, t);
    if (value === null) return;
    if (!continuous || cycle === 0) {
      out[jointName] = value;
      return;
    }

    const startValue = sampleJointValueAt(clip, jointName, 0);
    const endValue = sampleJointValueAt(clip, jointName, 1);
    if (startValue === null || endValue === null) {
      out[jointName] = value;
      return;
    }

    out[jointName] = value + cycle * (endValue - startValue);
  });

  return out;
}

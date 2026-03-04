export type ForgeQualityPreset = 'live' | 'default' | 'high';

export interface ForgeCurvesQualityProfile {
  /**
   * Global multiplier for spline sampling density.
   * < 1 = fewer spline points, > 1 = denser spline points.
   */
  splineSamplesScale: number;
  /**
   * Global multiplier for path sampling count used by sweep().
   */
  sweepPathSamplesScale: number;
  /**
   * Global multiplier for level-set edge length.
   * > 1 = coarser mesh, < 1 = finer mesh.
   */
  levelSetEdgeLengthScale: number;
  /**
   * Global multiplier for level-set bounds padding.
   */
  boundsPaddingScale: number;
}

export interface ForgeSmoothingQualityProfile {
  /**
   * Multiplier for explicit refine(n) calls.
   */
  refineStepsScale: number;
  /**
   * Multiplier for refineToLength(length). > 1 = coarser.
   */
  refineLengthScale: number;
  /**
   * Multiplier for refineToTolerance(tol). > 1 = coarser.
   */
  refineToleranceScale: number;
}

export interface ForgeQualityProfile {
  id: ForgeQualityPreset;
  label: string;
  description: string;
  curves: ForgeCurvesQualityProfile;
  smoothing: ForgeSmoothingQualityProfile;
}

const QUALITY_PROFILES: Record<ForgeQualityPreset, ForgeQualityProfile> = {
  live: {
    id: 'live',
    label: 'Live (fast)',
    description: 'Prioritizes responsiveness for interactive editing.',
    curves: {
      splineSamplesScale: 0.55,
      sweepPathSamplesScale: 0.6,
      levelSetEdgeLengthScale: 1.75,
      boundsPaddingScale: 1,
    },
    smoothing: {
      refineStepsScale: 0.5,
      refineLengthScale: 1.8,
      refineToleranceScale: 1.8,
    },
  },
  default: {
    id: 'default',
    label: 'Default',
    description: 'Balanced quality and speed.',
    curves: {
      splineSamplesScale: 1,
      sweepPathSamplesScale: 1,
      levelSetEdgeLengthScale: 1,
      boundsPaddingScale: 1,
    },
    smoothing: {
      refineStepsScale: 1,
      refineLengthScale: 1,
      refineToleranceScale: 1,
    },
  },
  high: {
    id: 'high',
    label: 'High',
    description: 'Finer tessellation for final exports.',
    curves: {
      splineSamplesScale: 1.35,
      sweepPathSamplesScale: 1.35,
      levelSetEdgeLengthScale: 0.8,
      boundsPaddingScale: 1,
    },
    smoothing: {
      refineStepsScale: 1.25,
      refineLengthScale: 0.8,
      refineToleranceScale: 0.8,
    },
  },
};

export const FORGE_QUALITY_PRESETS: ForgeQualityPreset[] = ['live', 'default', 'high'];
export const FORGE_QUALITY_PROFILES: Readonly<Record<ForgeQualityPreset, ForgeQualityProfile>> = QUALITY_PROFILES;

let _qualityStack: ForgeQualityPreset[] = ['default'];

export function resolveForgeQualityPreset(preset?: ForgeQualityPreset | null): ForgeQualityPreset {
  if (preset === 'live' || preset === 'default' || preset === 'high') return preset;
  return 'default';
}

export function getForgeQualityPreset(): ForgeQualityPreset {
  return _qualityStack[_qualityStack.length - 1] ?? 'default';
}

export function getForgeQualityProfile(preset?: ForgeQualityPreset | null): ForgeQualityProfile {
  const id = resolveForgeQualityPreset(preset ?? getForgeQualityPreset());
  return QUALITY_PROFILES[id];
}

export function runWithForgeQuality<T>(preset: ForgeQualityPreset | null | undefined, fn: () => T): T {
  const id = resolveForgeQualityPreset(preset);
  _qualityStack.push(id);
  try {
    return fn();
  } finally {
    _qualityStack.pop();
  }
}

function scaledAtLeastInt(base: number, scale: number, minimum: number): number {
  const scaled = Math.round(base * scale);
  return Math.max(minimum, scaled);
}

function scaledAtLeast(base: number, scale: number, minimum: number): number {
  return Math.max(minimum, base * scale);
}

export function scaleSplineSamples(samplesPerSegment: number): number {
  const base = Math.max(3, Math.floor(samplesPerSegment));
  const scale = getForgeQualityProfile().curves.splineSamplesScale;
  return scaledAtLeastInt(base, scale, 3);
}

export function scaleSweepPathSamples(samples: number): number {
  const base = Math.max(4, Math.floor(samples));
  const scale = getForgeQualityProfile().curves.sweepPathSamplesScale;
  return scaledAtLeastInt(base, scale, 4);
}

export function scaleLevelSetEdgeLength(edgeLength: number): number {
  const base = Math.max(0.01, edgeLength);
  const scale = getForgeQualityProfile().curves.levelSetEdgeLengthScale;
  return scaledAtLeast(base, scale, 0.01);
}

export function scaleLevelSetBoundsPadding(padding: number): number {
  const base = Math.max(0.01, padding);
  const scale = getForgeQualityProfile().curves.boundsPaddingScale;
  return scaledAtLeast(base, scale, 0.01);
}

export function scaleRefineSteps(steps: number): number {
  const base = Math.max(0, Math.floor(steps));
  const scale = getForgeQualityProfile().smoothing.refineStepsScale;
  return Math.max(0, Math.round(base * scale));
}

export function scaleRefineToLength(length: number): number {
  const base = Math.max(1e-6, length);
  const scale = getForgeQualityProfile().smoothing.refineLengthScale;
  return Math.max(1e-6, base * scale);
}

export function scaleRefineToTolerance(tolerance: number): number {
  const base = Math.max(1e-6, tolerance);
  const scale = getForgeQualityProfile().smoothing.refineToleranceScale;
  return Math.max(1e-6, base * scale);
}

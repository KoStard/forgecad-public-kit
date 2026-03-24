/**
 * Runtime viewport visualization configuration collected during script execution.
 * This controls renderer-only helper visuals (no geometry recompute).
 */

export interface JointOverlayViewConfig {
  enabled: boolean;
  axisColor: string;
  axisCoreColor: string;
  arcColor: string;
  zeroColor: string;
  arcVisualLimitDeg: number;
  axisLengthScale: number;
  axisLengthMin: number;
  axisLineRadiusScale: number;
  axisLineRadiusMin: number;
  axisLineRadiusMax: number;
  spokeLineRadiusScale: number;
  spokeLineRadiusMin: number;
  spokeLineRadiusMax: number;
  arcLineRadiusScale: number;
  arcLineRadiusMin: number;
  arcLineRadiusMax: number;
  axisDotRadiusScale: number;
  axisDotRadiusMin: number;
  axisArrowRadiusScale: number;
  axisArrowRadiusMin: number;
  axisArrowLengthScale: number;
  axisArrowLengthMin: number;
  axisArrowOffsetFactor: number;
  arcRadiusScale: number;
  arcRadiusMin: number;
  arcDotRadiusScale: number;
  arcDotRadiusMin: number;
  arcArrowRadiusScale: number;
  arcArrowRadiusMin: number;
  arcArrowLengthScale: number;
  arcArrowLengthMin: number;
  arcArrowOffsetFactor: number;
  arcStepDeg: number;
  arcMinSteps: number;
  arcTubeSegmentsMin: number;
  arcTubeSegmentsFactor: number;
  arcTubeRadialSegments: number;
}

export interface ViewConfig {
  jointOverlay: JointOverlayViewConfig;
}

export interface JointOverlayViewConfigOptions {
  enabled?: boolean;
  axisColor?: string;
  axisCoreColor?: string;
  arcColor?: string;
  zeroColor?: string;
  arcVisualLimitDeg?: number;
  axisLengthScale?: number;
  axisLengthMin?: number;
  axisLineRadiusScale?: number;
  axisLineRadiusMin?: number;
  axisLineRadiusMax?: number;
  spokeLineRadiusScale?: number;
  spokeLineRadiusMin?: number;
  spokeLineRadiusMax?: number;
  arcLineRadiusScale?: number;
  arcLineRadiusMin?: number;
  arcLineRadiusMax?: number;
  axisDotRadiusScale?: number;
  axisDotRadiusMin?: number;
  axisArrowRadiusScale?: number;
  axisArrowRadiusMin?: number;
  axisArrowLengthScale?: number;
  axisArrowLengthMin?: number;
  axisArrowOffsetFactor?: number;
  arcRadiusScale?: number;
  arcRadiusMin?: number;
  arcDotRadiusScale?: number;
  arcDotRadiusMin?: number;
  arcArrowRadiusScale?: number;
  arcArrowRadiusMin?: number;
  arcArrowLengthScale?: number;
  arcArrowLengthMin?: number;
  arcArrowOffsetFactor?: number;
  arcStepDeg?: number;
  arcMinSteps?: number;
  arcTubeSegmentsMin?: number;
  arcTubeSegmentsFactor?: number;
  arcTubeRadialSegments?: number;
}

export interface ViewConfigOptions {
  jointOverlay?: JointOverlayViewConfigOptions;
}

const validateColor = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string`);
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be a non-empty string`);
  return trimmed;
};

const validateFinite = (value: unknown, label: string, opts: { min?: number; max?: number; integer?: boolean } = {}): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  if (opts.integer && !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer`);
  }
  if (opts.min !== undefined && value < opts.min) {
    throw new Error(`${label} must be >= ${opts.min}`);
  }
  if (opts.max !== undefined && value > opts.max) {
    throw new Error(`${label} must be <= ${opts.max}`);
  }
  return value;
};

const cloneJointOverlay = (value: JointOverlayViewConfig): JointOverlayViewConfig => ({ ...value });

const cloneViewConfig = (value: ViewConfig): ViewConfig => ({
  jointOverlay: cloneJointOverlay(value.jointOverlay),
});

const validateRadiusRange = (cfg: JointOverlayViewConfig, label: string): void => {
  if (cfg.axisLineRadiusMin > cfg.axisLineRadiusMax) {
    throw new Error(`${label}.axisLineRadiusMin must be <= axisLineRadiusMax`);
  }
  if (cfg.spokeLineRadiusMin > cfg.spokeLineRadiusMax) {
    throw new Error(`${label}.spokeLineRadiusMin must be <= spokeLineRadiusMax`);
  }
  if (cfg.arcLineRadiusMin > cfg.arcLineRadiusMax) {
    throw new Error(`${label}.arcLineRadiusMin must be <= arcLineRadiusMax`);
  }
};

const patchJointOverlay = (
  current: JointOverlayViewConfig,
  patch: JointOverlayViewConfigOptions,
  label: string,
): JointOverlayViewConfig => {
  const next = cloneJointOverlay(current);
  if (patch.enabled !== undefined) {
    if (typeof patch.enabled !== 'boolean') throw new Error(`${label}.enabled must be a boolean`);
    next.enabled = patch.enabled;
  }
  if (patch.axisColor !== undefined) next.axisColor = validateColor(patch.axisColor, `${label}.axisColor`);
  if (patch.axisCoreColor !== undefined) next.axisCoreColor = validateColor(patch.axisCoreColor, `${label}.axisCoreColor`);
  if (patch.arcColor !== undefined) next.arcColor = validateColor(patch.arcColor, `${label}.arcColor`);
  if (patch.zeroColor !== undefined) next.zeroColor = validateColor(patch.zeroColor, `${label}.zeroColor`);

  if (patch.arcVisualLimitDeg !== undefined)
    next.arcVisualLimitDeg = validateFinite(patch.arcVisualLimitDeg, `${label}.arcVisualLimitDeg`, { min: 0, max: 3600 });
  if (patch.axisLengthScale !== undefined)
    next.axisLengthScale = validateFinite(patch.axisLengthScale, `${label}.axisLengthScale`, { min: 0 });
  if (patch.axisLengthMin !== undefined) next.axisLengthMin = validateFinite(patch.axisLengthMin, `${label}.axisLengthMin`, { min: 0 });
  if (patch.axisLineRadiusScale !== undefined)
    next.axisLineRadiusScale = validateFinite(patch.axisLineRadiusScale, `${label}.axisLineRadiusScale`, { min: 0 });
  if (patch.axisLineRadiusMin !== undefined)
    next.axisLineRadiusMin = validateFinite(patch.axisLineRadiusMin, `${label}.axisLineRadiusMin`, { min: 0 });
  if (patch.axisLineRadiusMax !== undefined)
    next.axisLineRadiusMax = validateFinite(patch.axisLineRadiusMax, `${label}.axisLineRadiusMax`, { min: 0 });
  if (patch.spokeLineRadiusScale !== undefined)
    next.spokeLineRadiusScale = validateFinite(patch.spokeLineRadiusScale, `${label}.spokeLineRadiusScale`, { min: 0 });
  if (patch.spokeLineRadiusMin !== undefined)
    next.spokeLineRadiusMin = validateFinite(patch.spokeLineRadiusMin, `${label}.spokeLineRadiusMin`, { min: 0 });
  if (patch.spokeLineRadiusMax !== undefined)
    next.spokeLineRadiusMax = validateFinite(patch.spokeLineRadiusMax, `${label}.spokeLineRadiusMax`, { min: 0 });
  if (patch.arcLineRadiusScale !== undefined)
    next.arcLineRadiusScale = validateFinite(patch.arcLineRadiusScale, `${label}.arcLineRadiusScale`, { min: 0 });
  if (patch.arcLineRadiusMin !== undefined)
    next.arcLineRadiusMin = validateFinite(patch.arcLineRadiusMin, `${label}.arcLineRadiusMin`, { min: 0 });
  if (patch.arcLineRadiusMax !== undefined)
    next.arcLineRadiusMax = validateFinite(patch.arcLineRadiusMax, `${label}.arcLineRadiusMax`, { min: 0 });
  if (patch.axisDotRadiusScale !== undefined)
    next.axisDotRadiusScale = validateFinite(patch.axisDotRadiusScale, `${label}.axisDotRadiusScale`, { min: 0 });
  if (patch.axisDotRadiusMin !== undefined)
    next.axisDotRadiusMin = validateFinite(patch.axisDotRadiusMin, `${label}.axisDotRadiusMin`, { min: 0 });
  if (patch.axisArrowRadiusScale !== undefined)
    next.axisArrowRadiusScale = validateFinite(patch.axisArrowRadiusScale, `${label}.axisArrowRadiusScale`, { min: 0 });
  if (patch.axisArrowRadiusMin !== undefined)
    next.axisArrowRadiusMin = validateFinite(patch.axisArrowRadiusMin, `${label}.axisArrowRadiusMin`, { min: 0 });
  if (patch.axisArrowLengthScale !== undefined)
    next.axisArrowLengthScale = validateFinite(patch.axisArrowLengthScale, `${label}.axisArrowLengthScale`, { min: 0 });
  if (patch.axisArrowLengthMin !== undefined)
    next.axisArrowLengthMin = validateFinite(patch.axisArrowLengthMin, `${label}.axisArrowLengthMin`, { min: 0 });
  if (patch.axisArrowOffsetFactor !== undefined)
    next.axisArrowOffsetFactor = validateFinite(patch.axisArrowOffsetFactor, `${label}.axisArrowOffsetFactor`, { min: 0 });
  if (patch.arcRadiusScale !== undefined) next.arcRadiusScale = validateFinite(patch.arcRadiusScale, `${label}.arcRadiusScale`, { min: 0 });
  if (patch.arcRadiusMin !== undefined) next.arcRadiusMin = validateFinite(patch.arcRadiusMin, `${label}.arcRadiusMin`, { min: 0 });
  if (patch.arcDotRadiusScale !== undefined)
    next.arcDotRadiusScale = validateFinite(patch.arcDotRadiusScale, `${label}.arcDotRadiusScale`, { min: 0 });
  if (patch.arcDotRadiusMin !== undefined)
    next.arcDotRadiusMin = validateFinite(patch.arcDotRadiusMin, `${label}.arcDotRadiusMin`, { min: 0 });
  if (patch.arcArrowRadiusScale !== undefined)
    next.arcArrowRadiusScale = validateFinite(patch.arcArrowRadiusScale, `${label}.arcArrowRadiusScale`, { min: 0 });
  if (patch.arcArrowRadiusMin !== undefined)
    next.arcArrowRadiusMin = validateFinite(patch.arcArrowRadiusMin, `${label}.arcArrowRadiusMin`, { min: 0 });
  if (patch.arcArrowLengthScale !== undefined)
    next.arcArrowLengthScale = validateFinite(patch.arcArrowLengthScale, `${label}.arcArrowLengthScale`, { min: 0 });
  if (patch.arcArrowLengthMin !== undefined)
    next.arcArrowLengthMin = validateFinite(patch.arcArrowLengthMin, `${label}.arcArrowLengthMin`, { min: 0 });
  if (patch.arcArrowOffsetFactor !== undefined)
    next.arcArrowOffsetFactor = validateFinite(patch.arcArrowOffsetFactor, `${label}.arcArrowOffsetFactor`, { min: 0 });
  if (patch.arcStepDeg !== undefined) next.arcStepDeg = validateFinite(patch.arcStepDeg, `${label}.arcStepDeg`, { min: 0.05 });
  if (patch.arcMinSteps !== undefined)
    next.arcMinSteps = validateFinite(patch.arcMinSteps, `${label}.arcMinSteps`, { min: 1, integer: true });
  if (patch.arcTubeSegmentsMin !== undefined)
    next.arcTubeSegmentsMin = validateFinite(patch.arcTubeSegmentsMin, `${label}.arcTubeSegmentsMin`, { min: 3, integer: true });
  if (patch.arcTubeSegmentsFactor !== undefined)
    next.arcTubeSegmentsFactor = validateFinite(patch.arcTubeSegmentsFactor, `${label}.arcTubeSegmentsFactor`, { min: 0.1 });
  if (patch.arcTubeRadialSegments !== undefined)
    next.arcTubeRadialSegments = validateFinite(patch.arcTubeRadialSegments, `${label}.arcTubeRadialSegments`, { min: 3, integer: true });

  validateRadiusRange(next, label);
  return next;
};

export const DEFAULT_JOINT_OVERLAY_VIEW_CONFIG: JointOverlayViewConfig = {
  enabled: true,
  axisColor: '#18dcff',
  axisCoreColor: '#f0fdff',
  arcColor: '#ff7a1a',
  zeroColor: '#ffe26a',
  arcVisualLimitDeg: 360,
  axisLengthScale: 0.16,
  axisLengthMin: 24,
  axisLineRadiusScale: 0.024,
  axisLineRadiusMin: 0.7,
  axisLineRadiusMax: 2.2,
  spokeLineRadiusScale: 0.016,
  spokeLineRadiusMin: 0.5,
  spokeLineRadiusMax: 1.5,
  arcLineRadiusScale: 0.018,
  arcLineRadiusMin: 0.52,
  arcLineRadiusMax: 1.7,
  axisDotRadiusScale: 0.02,
  axisDotRadiusMin: 0.75,
  axisArrowRadiusScale: 0.046,
  axisArrowRadiusMin: 1,
  axisArrowLengthScale: 0.14,
  axisArrowLengthMin: 3.8,
  axisArrowOffsetFactor: 0.4,
  arcRadiusScale: 0.34,
  arcRadiusMin: 4.2,
  arcDotRadiusScale: 0.016,
  arcDotRadiusMin: 0.6,
  arcArrowRadiusScale: 0.032,
  arcArrowRadiusMin: 0.8,
  arcArrowLengthScale: 0.1,
  arcArrowLengthMin: 2.8,
  arcArrowOffsetFactor: 0.38,
  arcStepDeg: 4,
  arcMinSteps: 24,
  arcTubeSegmentsMin: 32,
  arcTubeSegmentsFactor: 2,
  arcTubeRadialSegments: 12,
};

export const DEFAULT_VIEW_CONFIG: ViewConfig = {
  jointOverlay: cloneJointOverlay(DEFAULT_JOINT_OVERLAY_VIEW_CONFIG),
};

let _collected: ViewConfig | null = null;

export function resetViewConfig(): void {
  _collected = null;
}

export function getCollectedViewConfig(): ViewConfig | null {
  return _collected ? cloneViewConfig(_collected) : null;
}

/**
 * Configure runtime viewport visuals for the current script execution.
 * Multiple calls merge; later values override earlier ones.
 */
export function viewConfig(options: ViewConfigOptions = {}): void {
  if (!options || typeof options !== 'object') {
    throw new Error('viewConfig(options) expects an options object');
  }

  const next: ViewConfig = _collected ? cloneViewConfig(_collected) : cloneViewConfig(DEFAULT_VIEW_CONFIG);

  if (options.jointOverlay !== undefined) {
    if (!options.jointOverlay || typeof options.jointOverlay !== 'object') {
      throw new Error('viewConfig.jointOverlay must be an object');
    }
    next.jointOverlay = patchJointOverlay(next.jointOverlay, options.jointOverlay, 'viewConfig.jointOverlay');
  }

  _collected = next;
}

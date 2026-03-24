/**
 * ForgeCAD — Scene Configuration API
 *
 * Lets .forge.js scripts control camera, lighting, background, fog,
 * and post-processing for generative art and presentation renders.
 *
 * Follows the collect-during-execution pattern used by viewConfig, cutPlane, etc.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SceneCameraConfig {
  position?: [number, number, number];
  target?: [number, number, number];
  up?: [number, number, number];
  fov?: number;
  type?: 'perspective' | 'orthographic';
}

export type SceneLightType = 'ambient' | 'directional' | 'point' | 'spot' | 'hemisphere';

export interface SceneLightConfig {
  type: SceneLightType;
  color?: string;
  intensity?: number;
  position?: [number, number, number];
  /** Target for directional/spot lights */
  target?: [number, number, number];
  /** Ground color for hemisphere lights */
  groundColor?: string;
  /** Sky color alias for hemisphere lights (same as color) */
  skyColor?: string;
  /** Spot light cone angle in radians */
  angle?: number;
  /** Spot light penumbra (0–1) */
  penumbra?: number;
  /** Point/spot light decay */
  decay?: number;
  /** Point/spot light distance (0 = infinite) */
  distance?: number;
  /** Whether this light casts shadows */
  castShadow?: boolean;
}

export interface SceneEnvironmentConfig {
  /** Built-in preset name or 'none' to disable */
  preset?: 'studio' | 'sunset' | 'dawn' | 'warehouse' | 'forest' | 'apartment' | 'lobby' | 'city' | 'park' | 'night' | 'none';
  /** Environment map intensity */
  intensity?: number;
  /** Use environment map as scene background */
  background?: boolean;
}

export interface SceneBackgroundGradient {
  top: string;
  bottom: string;
}

export interface SceneFogConfig {
  color?: string;
  /** Linear fog near distance */
  near?: number;
  /** Linear fog far distance */
  far?: number;
  /** Exponential fog density (if set, uses FogExp2 instead of linear Fog) */
  density?: number;
}

export interface SceneBloomConfig {
  intensity?: number;
  threshold?: number;
  radius?: number;
}

export interface SceneVignetteConfig {
  darkness?: number;
  offset?: number;
}

export interface SceneGrainConfig {
  intensity?: number;
}

export interface ScenePostProcessingConfig {
  bloom?: SceneBloomConfig;
  vignette?: SceneVignetteConfig;
  grain?: SceneGrainConfig;
  toneMappingExposure?: number;
}

export interface SceneGroundConfig {
  /** Show a ground plane */
  visible?: boolean;
  /** Ground color */
  color?: string;
  /** Ground Y offset from origin */
  height?: number;
  /** Receive shadows on the ground */
  receiveShadow?: boolean;
}

export interface SceneCaptureConfig {
  /** Frames for one full orbit rotation (default: 72) */
  framesPerTurn?: number;
  /** Frozen frames before motion starts (default: 6) */
  holdFrames?: number;
  /** Orbit pitch angle in degrees (default: auto from camera) */
  pitchDeg?: number;
  /** Output frame rate (default: 24) */
  fps?: number;
  /** Output frame size in pixels (default: 960) */
  size?: number;
  /** Canvas background color for capture (default: '#252526') */
  background?: string;
}

export interface SceneConfig {
  background: string | SceneBackgroundGradient | null;
  camera: SceneCameraConfig | null;
  lights: SceneLightConfig[] | null;
  environment: SceneEnvironmentConfig | null;
  fog: SceneFogConfig | null;
  postProcessing: ScenePostProcessingConfig | null;
  ground: SceneGroundConfig | null;
  capture: SceneCaptureConfig | null;
}

export interface SceneOptions {
  background?: string | SceneBackgroundGradient;
  camera?: SceneCameraConfig;
  lights?: SceneLightConfig[];
  environment?: SceneEnvironmentConfig;
  fog?: SceneFogConfig;
  postProcessing?: ScenePostProcessingConfig;
  ground?: SceneGroundConfig;
  /** Default capture parameters for `forgecad capture` — CLI flags override these. */
  capture?: SceneCaptureConfig;
}

// ---------------------------------------------------------------------------
// Validation Helpers
// ---------------------------------------------------------------------------

function requireFinite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

function requireVec3(value: unknown, label: string): [number, number, number] {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must be [x, y, z]`);
  }
  return [requireFinite(value[0], `${label}[0]`), requireFinite(value[1], `${label}[1]`), requireFinite(value[2], `${label}[2]`)];
}

function requireColor(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${label} must be a non-empty color string`);
  }
  return value.trim();
}

const VALID_LIGHT_TYPES = new Set<SceneLightType>(['ambient', 'directional', 'point', 'spot', 'hemisphere']);

const VALID_ENVIRONMENT_PRESETS = new Set([
  'studio',
  'sunset',
  'dawn',
  'warehouse',
  'forest',
  'apartment',
  'lobby',
  'city',
  'park',
  'night',
  'none',
]);

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateCamera(cam: SceneCameraConfig, label: string): SceneCameraConfig {
  const out: SceneCameraConfig = {};
  if (cam.position !== undefined) out.position = requireVec3(cam.position, `${label}.position`);
  if (cam.target !== undefined) out.target = requireVec3(cam.target, `${label}.target`);
  if (cam.up !== undefined) out.up = requireVec3(cam.up, `${label}.up`);
  if (cam.fov !== undefined) {
    out.fov = requireFinite(cam.fov, `${label}.fov`);
    if (out.fov <= 0 || out.fov >= 180) throw new Error(`${label}.fov must be between 0 and 180`);
  }
  if (cam.type !== undefined) {
    if (cam.type !== 'perspective' && cam.type !== 'orthographic') {
      throw new Error(`${label}.type must be 'perspective' or 'orthographic'`);
    }
    out.type = cam.type;
  }
  return out;
}

function validateLight(light: SceneLightConfig, label: string): SceneLightConfig {
  if (!light || typeof light !== 'object') throw new Error(`${label} must be an object`);
  if (!VALID_LIGHT_TYPES.has(light.type)) {
    throw new Error(`${label}.type must be one of: ${Array.from(VALID_LIGHT_TYPES).join(', ')}`);
  }
  const out: SceneLightConfig = { type: light.type };
  if (light.color !== undefined) out.color = requireColor(light.color, `${label}.color`);
  if (light.intensity !== undefined) out.intensity = requireFinite(light.intensity, `${label}.intensity`);
  if (light.position !== undefined) out.position = requireVec3(light.position, `${label}.position`);
  if (light.target !== undefined) out.target = requireVec3(light.target, `${label}.target`);
  if (light.groundColor !== undefined) out.groundColor = requireColor(light.groundColor, `${label}.groundColor`);
  if (light.skyColor !== undefined) out.skyColor = requireColor(light.skyColor, `${label}.skyColor`);
  if (light.angle !== undefined) out.angle = requireFinite(light.angle, `${label}.angle`);
  if (light.penumbra !== undefined) out.penumbra = requireFinite(light.penumbra, `${label}.penumbra`);
  if (light.decay !== undefined) out.decay = requireFinite(light.decay, `${label}.decay`);
  if (light.distance !== undefined) out.distance = requireFinite(light.distance, `${label}.distance`);
  if (light.castShadow !== undefined) {
    if (typeof light.castShadow !== 'boolean') throw new Error(`${label}.castShadow must be a boolean`);
    out.castShadow = light.castShadow;
  }
  return out;
}

function validateEnvironment(env: SceneEnvironmentConfig, label: string): SceneEnvironmentConfig {
  const out: SceneEnvironmentConfig = {};
  if (env.preset !== undefined) {
    if (!VALID_ENVIRONMENT_PRESETS.has(env.preset)) {
      throw new Error(`${label}.preset must be one of: ${Array.from(VALID_ENVIRONMENT_PRESETS).join(', ')}`);
    }
    out.preset = env.preset;
  }
  if (env.intensity !== undefined) out.intensity = requireFinite(env.intensity, `${label}.intensity`);
  if (env.background !== undefined) {
    if (typeof env.background !== 'boolean') throw new Error(`${label}.background must be a boolean`);
    out.background = env.background;
  }
  return out;
}

function validateFog(fog: SceneFogConfig, label: string): SceneFogConfig {
  const out: SceneFogConfig = {};
  if (fog.color !== undefined) out.color = requireColor(fog.color, `${label}.color`);
  if (fog.near !== undefined) out.near = requireFinite(fog.near, `${label}.near`);
  if (fog.far !== undefined) out.far = requireFinite(fog.far, `${label}.far`);
  if (fog.density !== undefined) out.density = requireFinite(fog.density, `${label}.density`);
  return out;
}

function validatePostProcessing(pp: ScenePostProcessingConfig, label: string): ScenePostProcessingConfig {
  const out: ScenePostProcessingConfig = {};
  if (pp.bloom !== undefined) {
    if (!pp.bloom || typeof pp.bloom !== 'object') throw new Error(`${label}.bloom must be an object`);
    out.bloom = {};
    if (pp.bloom.intensity !== undefined) out.bloom.intensity = requireFinite(pp.bloom.intensity, `${label}.bloom.intensity`);
    if (pp.bloom.threshold !== undefined) out.bloom.threshold = requireFinite(pp.bloom.threshold, `${label}.bloom.threshold`);
    if (pp.bloom.radius !== undefined) out.bloom.radius = requireFinite(pp.bloom.radius, `${label}.bloom.radius`);
  }
  if (pp.vignette !== undefined) {
    if (!pp.vignette || typeof pp.vignette !== 'object') throw new Error(`${label}.vignette must be an object`);
    out.vignette = {};
    if (pp.vignette.darkness !== undefined) out.vignette.darkness = requireFinite(pp.vignette.darkness, `${label}.vignette.darkness`);
    if (pp.vignette.offset !== undefined) out.vignette.offset = requireFinite(pp.vignette.offset, `${label}.vignette.offset`);
  }
  if (pp.grain !== undefined) {
    if (!pp.grain || typeof pp.grain !== 'object') throw new Error(`${label}.grain must be an object`);
    out.grain = {};
    if (pp.grain.intensity !== undefined) out.grain.intensity = requireFinite(pp.grain.intensity, `${label}.grain.intensity`);
  }
  if (pp.toneMappingExposure !== undefined) {
    out.toneMappingExposure = requireFinite(pp.toneMappingExposure, `${label}.toneMappingExposure`);
  }
  return out;
}

function validateGround(ground: SceneGroundConfig, label: string): SceneGroundConfig {
  const out: SceneGroundConfig = {};
  if (ground.visible !== undefined) {
    if (typeof ground.visible !== 'boolean') throw new Error(`${label}.visible must be a boolean`);
    out.visible = ground.visible;
  }
  if (ground.color !== undefined) out.color = requireColor(ground.color, `${label}.color`);
  if (ground.height !== undefined) out.height = requireFinite(ground.height, `${label}.height`);
  if (ground.receiveShadow !== undefined) {
    if (typeof ground.receiveShadow !== 'boolean') throw new Error(`${label}.receiveShadow must be a boolean`);
    out.receiveShadow = ground.receiveShadow;
  }
  return out;
}

function validateCapture(cap: SceneCaptureConfig, label: string): SceneCaptureConfig {
  const out: SceneCaptureConfig = {};
  if (cap.framesPerTurn !== undefined) {
    out.framesPerTurn = requireFinite(cap.framesPerTurn, `${label}.framesPerTurn`);
    if (out.framesPerTurn < 12 || out.framesPerTurn > 720) {
      throw new Error(`${label}.framesPerTurn must be between 12 and 720`);
    }
  }
  if (cap.holdFrames !== undefined) {
    out.holdFrames = requireFinite(cap.holdFrames, `${label}.holdFrames`);
    if (out.holdFrames < 0 || out.holdFrames > 300) {
      throw new Error(`${label}.holdFrames must be between 0 and 300`);
    }
  }
  if (cap.pitchDeg !== undefined) {
    out.pitchDeg = requireFinite(cap.pitchDeg, `${label}.pitchDeg`);
    if (out.pitchDeg < -80 || out.pitchDeg > 80) {
      throw new Error(`${label}.pitchDeg must be between -80 and 80`);
    }
  }
  if (cap.fps !== undefined) {
    out.fps = requireFinite(cap.fps, `${label}.fps`);
    if (out.fps < 1 || out.fps > 60) {
      throw new Error(`${label}.fps must be between 1 and 60`);
    }
  }
  if (cap.size !== undefined) {
    out.size = requireFinite(cap.size, `${label}.size`);
    if (out.size < 1) {
      throw new Error(`${label}.size must be positive`);
    }
  }
  if (cap.background !== undefined) {
    out.background = requireColor(cap.background, `${label}.background`);
  }
  return out;
}

function validateBackground(bg: unknown, label: string): string | SceneBackgroundGradient {
  if (typeof bg === 'string') return requireColor(bg, label);
  if (bg && typeof bg === 'object' && 'top' in bg && 'bottom' in bg) {
    const grad = bg as SceneBackgroundGradient;
    return {
      top: requireColor(grad.top, `${label}.top`),
      bottom: requireColor(grad.bottom, `${label}.bottom`),
    };
  }
  throw new Error(`${label} must be a color string or { top, bottom } gradient`);
}

// ---------------------------------------------------------------------------
// Collect-during-execution state
// ---------------------------------------------------------------------------

let _collected: SceneConfig | null = null;

export function resetScene(): void {
  _collected = null;
}

export function getCollectedScene(): SceneConfig | null {
  return _collected ? { ..._collected } : null;
}

/**
 * Configure the scene environment for the current script execution.
 * Controls camera, lighting, background, fog, and post-processing.
 * Multiple calls merge; later values override earlier ones.
 *
 * @example
 * ```js
 * scene({
 *   background: '#0a0a0a',
 *   camera: { position: [200, 100, 150], target: [0, 0, 30], fov: 60 },
 *   lights: [
 *     { type: 'ambient', color: '#1a1a2e', intensity: 0.2 },
 *     { type: 'point', position: [0, 0, 100], color: '#ff6b35', intensity: 2 },
 *   ],
 *   fog: { color: '#0a0a0a', near: 100, far: 500 },
 *   postProcessing: {
 *     bloom: { intensity: 1.5, threshold: 0.8, radius: 0.4 },
 *   },
 * });
 * ```
 */
export function scene(options: SceneOptions): void {
  if (!options || typeof options !== 'object') {
    throw new Error('scene(options) expects an options object');
  }

  const current: SceneConfig = _collected
    ? { ..._collected }
    : { background: null, camera: null, lights: null, environment: null, fog: null, postProcessing: null, ground: null, capture: null };

  if (options.background !== undefined) {
    current.background = validateBackground(options.background, 'scene.background');
  }
  if (options.camera !== undefined) {
    if (!options.camera || typeof options.camera !== 'object') {
      throw new Error('scene.camera must be an object');
    }
    const validated = validateCamera(options.camera, 'scene.camera');
    // Merge with existing camera config
    current.camera = current.camera ? { ...current.camera, ...validated } : validated;
  }
  if (options.lights !== undefined) {
    if (!Array.isArray(options.lights)) {
      throw new Error('scene.lights must be an array');
    }
    current.lights = options.lights.map((l, i) => validateLight(l, `scene.lights[${i}]`));
  }
  if (options.environment !== undefined) {
    if (!options.environment || typeof options.environment !== 'object') {
      throw new Error('scene.environment must be an object');
    }
    current.environment = validateEnvironment(options.environment, 'scene.environment');
  }
  if (options.fog !== undefined) {
    if (!options.fog || typeof options.fog !== 'object') {
      throw new Error('scene.fog must be an object');
    }
    current.fog = validateFog(options.fog, 'scene.fog');
  }
  if (options.postProcessing !== undefined) {
    if (!options.postProcessing || typeof options.postProcessing !== 'object') {
      throw new Error('scene.postProcessing must be an object');
    }
    const validated = validatePostProcessing(options.postProcessing, 'scene.postProcessing');
    current.postProcessing = current.postProcessing ? { ...current.postProcessing, ...validated } : validated;
  }
  if (options.ground !== undefined) {
    if (!options.ground || typeof options.ground !== 'object') {
      throw new Error('scene.ground must be an object');
    }
    current.ground = validateGround(options.ground, 'scene.ground');
  }
  if (options.capture !== undefined) {
    if (!options.capture || typeof options.capture !== 'object') {
      throw new Error('scene.capture must be an object');
    }
    const validated = validateCapture(options.capture, 'scene.capture');
    current.capture = current.capture ? { ...current.capture, ...validated } : validated;
  }

  _collected = current;
}

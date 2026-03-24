export type CameraProjectionMode = 'perspective' | 'orthographic';

export interface ViewportCameraState {
  projectionMode: CameraProjectionMode;
  position: [number, number, number];
  target: [number, number, number];
  up: [number, number, number];
  orthoZoom?: number;
}

const VECTOR_KEYS = new Set(['pos', 'position', 'target', 'lookat', 'aim', 'up']);

const roundNumber = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const isFiniteTuple3 = (value: unknown): value is [number, number, number] =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));

export function parseViewportCameraState(value: unknown): ViewportCameraState | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ViewportCameraState>;
  if (candidate.projectionMode !== 'perspective' && candidate.projectionMode !== 'orthographic') return null;
  if (!isFiniteTuple3(candidate.position)) return null;
  if (!isFiniteTuple3(candidate.target)) return null;
  if (!isFiniteTuple3(candidate.up)) return null;
  if (candidate.orthoZoom !== undefined && (!Number.isFinite(candidate.orthoZoom) || candidate.orthoZoom <= 0)) {
    return null;
  }
  return {
    projectionMode: candidate.projectionMode,
    position: candidate.position,
    target: candidate.target,
    up: candidate.up,
    orthoZoom: candidate.orthoZoom,
  };
}

function parseVector(name: string, raw: string): [number, number, number] {
  const parts = raw.split(',').map((entry) => Number.parseFloat(entry.trim()));
  if (parts.length !== 3 || parts.some((entry) => !Number.isFinite(entry))) {
    throw new Error(`Camera ${name} must be three comma-separated numbers.`);
  }
  return [parts[0], parts[1], parts[2]];
}

export function parseCameraCliSpec(input: string): ViewportCameraState {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Camera spec cannot be empty.');
  }

  if (trimmed.startsWith('{')) {
    const parsed = parseViewportCameraState(JSON.parse(trimmed));
    if (!parsed) {
      throw new Error('Camera JSON does not match the expected shape.');
    }
    return parsed;
  }

  const parsed: Partial<ViewportCameraState> = {};
  const segments = trimmed
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length === 0) {
    throw new Error('Camera spec cannot be empty.');
  }

  for (const segment of segments) {
    const eqIndex = segment.indexOf('=');
    if (eqIndex === -1) {
      throw new Error(`Invalid camera segment "${segment}". Expected key=value.`);
    }
    const rawKey = segment.slice(0, eqIndex).trim().toLowerCase();
    const rawValue = segment.slice(eqIndex + 1).trim();
    if (!rawValue) {
      throw new Error(`Camera segment "${segment}" is missing a value.`);
    }

    if (rawKey === 'proj' || rawKey === 'projection' || rawKey === 'projectionmode') {
      if (rawValue !== 'perspective' && rawValue !== 'orthographic') {
        throw new Error(`Camera projection must be "perspective" or "orthographic" (got "${rawValue}").`);
      }
      parsed.projectionMode = rawValue;
      continue;
    }

    if (rawKey === 'zoom' || rawKey === 'orthozoom') {
      const zoom = Number.parseFloat(rawValue);
      if (!Number.isFinite(zoom) || zoom <= 0) {
        throw new Error(`Camera zoom must be a positive number (got "${rawValue}").`);
      }
      parsed.orthoZoom = zoom;
      continue;
    }

    if (VECTOR_KEYS.has(rawKey)) {
      const vector = parseVector(rawKey, rawValue);
      if (rawKey === 'pos' || rawKey === 'position') parsed.position = vector;
      if (rawKey === 'target' || rawKey === 'lookat' || rawKey === 'aim') parsed.target = vector;
      if (rawKey === 'up') parsed.up = vector;
      continue;
    }

    throw new Error(`Unknown camera key "${rawKey}".`);
  }

  const finalized = parseViewportCameraState({
    projectionMode: parsed.projectionMode ?? 'perspective',
    position: parsed.position,
    target: parsed.target,
    up: parsed.up ?? [0, 0, 1],
    orthoZoom: parsed.orthoZoom,
  });

  if (!finalized) {
    throw new Error('Camera spec must include position, target, and up vectors.');
  }

  return finalized;
}

export function formatCameraCliSpec(state: ViewportCameraState, digits = 3): string {
  const formatVector = (value: [number, number, number]): string => value.map((entry) => roundNumber(entry, digits)).join(',');

  const parts = [
    `proj=${state.projectionMode}`,
    `pos=${formatVector(state.position)}`,
    `target=${formatVector(state.target)}`,
    `up=${formatVector(state.up)}`,
  ];

  if (state.projectionMode === 'orthographic' && state.orthoZoom !== undefined) {
    parts.push(`zoom=${roundNumber(state.orthoZoom, digits)}`);
  }

  return parts.join(';');
}

export function getCameraForwardVector(state: ViewportCameraState, digits = 3): [number, number, number] {
  const dx = state.target[0] - state.position[0];
  const dy = state.target[1] - state.position[1];
  const dz = state.target[2] - state.position[2];
  const length = Math.hypot(dx, dy, dz) || 1;
  return [roundNumber(dx / length, digits), roundNumber(dy / length, digits), roundNumber(dz / length, digits)];
}

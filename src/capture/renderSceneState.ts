import { parseViewportCameraState, type ViewportCameraState } from './cameraState';

export interface ViewportRenderObjectState {
  visible?: boolean;
  opacity?: number;
  color?: string;
}

export interface ViewportRenderSceneState {
  camera?: ViewportCameraState;
  objects?: Record<string, ViewportRenderObjectState>;
}

const roundNumber = (value: number, digits: number): number => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

function parseViewportRenderObjectState(value: unknown): ViewportRenderObjectState | null {
  if (!isPlainObject(value)) return null;

  const parsed: ViewportRenderObjectState = {};
  if ('visible' in value) {
    if (typeof value.visible !== 'boolean') return null;
    parsed.visible = value.visible;
  }
  if ('opacity' in value) {
    if (typeof value.opacity !== 'number' || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1) {
      return null;
    }
    parsed.opacity = value.opacity;
  }
  if ('color' in value) {
    if (typeof value.color !== 'string' || value.color.trim().length === 0) return null;
    parsed.color = value.color.trim();
  }

  return parsed;
}

export function parseViewportRenderSceneState(value: unknown): ViewportRenderSceneState | null {
  if (!isPlainObject(value)) return null;

  let hasContent = false;
  let camera: ViewportCameraState | undefined;
  let objects: Record<string, ViewportRenderObjectState> | undefined;

  if ('camera' in value) {
    const parsedCamera = parseViewportCameraState(value.camera);
    if (!parsedCamera) return null;
    camera = parsedCamera;
    hasContent = true;
  }

  if ('objects' in value) {
    if (!isPlainObject(value.objects)) return null;
    const parsedObjects: Record<string, ViewportRenderObjectState> = {};
    for (const [id, rawState] of Object.entries(value.objects)) {
      if (id.trim().length === 0) return null;
      const parsedState = parseViewportRenderObjectState(rawState);
      if (!parsedState) return null;
      if (Object.keys(parsedState).length > 0) {
        parsedObjects[id] = parsedState;
      }
    }
    if (Object.keys(parsedObjects).length > 0) {
      objects = parsedObjects;
      hasContent = true;
    }
  }

  if (!hasContent) return null;

  return {
    ...(camera ? { camera } : {}),
    ...(objects ? { objects } : {}),
  };
}

export function parseRenderSceneCliSpec(input: string): ViewportRenderSceneState {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Scene spec cannot be empty.');
  }

  const parsed = parseViewportRenderSceneState(JSON.parse(trimmed));
  if (!parsed) {
    throw new Error('Scene JSON does not match the expected shape.');
  }
  return parsed;
}

export function mergeViewportRenderSceneStates(
  base: ViewportRenderSceneState | null | undefined,
  override: ViewportRenderSceneState | null | undefined,
): ViewportRenderSceneState | null {
  if (!base && !override) return null;

  const objectIds = new Set([
    ...Object.keys(base?.objects ?? {}),
    ...Object.keys(override?.objects ?? {}),
  ]);
  const objects: Record<string, ViewportRenderObjectState> = {};

  objectIds.forEach((id) => {
    const merged = {
      ...(base?.objects?.[id] ?? {}),
      ...(override?.objects?.[id] ?? {}),
    };
    if (Object.keys(merged).length > 0) {
      objects[id] = merged;
    }
  });

  const camera = override?.camera ?? base?.camera;
  if (!camera && Object.keys(objects).length === 0) {
    return null;
  }

  return {
    ...(camera ? { camera } : {}),
    ...(Object.keys(objects).length > 0 ? { objects } : {}),
  };
}

export function formatRenderSceneCliSpec(state: ViewportRenderSceneState, digits = 3): string {
  const parsed = parseViewportRenderSceneState(state);
  if (!parsed) {
    throw new Error('Render scene state does not match the expected shape.');
  }

  const formatted: ViewportRenderSceneState = {};

  if (parsed.camera) {
    formatted.camera = {
      projectionMode: parsed.camera.projectionMode,
      position: parsed.camera.position.map((entry) => roundNumber(entry, digits)) as [number, number, number],
      target: parsed.camera.target.map((entry) => roundNumber(entry, digits)) as [number, number, number],
      up: parsed.camera.up.map((entry) => roundNumber(entry, digits)) as [number, number, number],
      ...(parsed.camera.orthoZoom !== undefined ? { orthoZoom: roundNumber(parsed.camera.orthoZoom, digits) } : {}),
    };
  }

  if (parsed.objects) {
    const formattedObjects: Record<string, ViewportRenderObjectState> = {};
    Object.keys(parsed.objects).sort().forEach((id) => {
      const objectState = parsed.objects?.[id];
      if (!objectState) return;
      formattedObjects[id] = {
        ...(objectState.visible !== undefined ? { visible: objectState.visible } : {}),
        ...(objectState.opacity !== undefined ? { opacity: roundNumber(objectState.opacity, digits) } : {}),
        ...(objectState.color !== undefined ? { color: objectState.color } : {}),
      };
    });
    if (Object.keys(formattedObjects).length > 0) {
      formatted.objects = formattedObjects;
    }
  }

  return JSON.stringify(formatted);
}

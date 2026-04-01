import { parseViewportCameraState, type ViewportCameraState } from '../../capture/cameraState';
import { VIEWPORT_CAMERA_STORAGE_KEY } from './types';

export const readPersistedViewportCameraState = (): ViewportCameraState | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(VIEWPORT_CAMERA_STORAGE_KEY);
    if (!raw) return null;
    return parseViewportCameraState(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writePersistedViewportCameraState = (state: ViewportCameraState): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(VIEWPORT_CAMERA_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures (private mode, quota, etc.)
  }
};

export const resolveHoverObjectName = (name: string, knownFileNames: Set<string>): string | null => {
  const trimmed = name.trim();
  if (!trimmed) return null;
  // Unnamed returns fall back to source filenames; skip those in hover tooltips.
  if (knownFileNames.has(trimmed)) return null;
  return trimmed;
};

import * as THREE from 'three';

/**
 * Centralized mouse/touch mapping for OrbitControls.
 * Edit these objects to change viewport interaction bindings.
 */

export const MOUSE_BUTTONS_3D = {
  LEFT: THREE.MOUSE.ROTATE,
  MIDDLE: THREE.MOUSE.PAN,
  RIGHT: THREE.MOUSE.DOLLY,
} as const;

export const MOUSE_BUTTONS_SKETCH = {
  LEFT: THREE.MOUSE.PAN,
  MIDDLE: THREE.MOUSE.DOLLY,
  RIGHT: THREE.MOUSE.PAN,
} as const;

export const TOUCH_GESTURES_3D = {
  ONE: THREE.TOUCH.ROTATE,
  TWO: THREE.TOUCH.DOLLY_PAN,
} as const;

export const TOUCH_GESTURES_SKETCH = {
  ONE: THREE.TOUCH.PAN,
  TWO: THREE.TOUCH.DOLLY_PAN,
} as const;

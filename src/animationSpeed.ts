export const ANIMATION_SPEED_MIN = 0.01;
export const ANIMATION_SPEED_MAX = 4;

const ANIMATION_SPEED_LOG_SPAN = Math.log(ANIMATION_SPEED_MAX / ANIMATION_SPEED_MIN);

export const clampAnimationSpeed = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  return Math.max(ANIMATION_SPEED_MIN, Math.min(ANIMATION_SPEED_MAX, value));
};

export const animationSpeedToSlider = (speed: number): number => {
  const safeSpeed = clampAnimationSpeed(speed);
  return Math.log(safeSpeed / ANIMATION_SPEED_MIN) / ANIMATION_SPEED_LOG_SPAN;
};

export const sliderToAnimationSpeed = (value: number): number => {
  if (!Number.isFinite(value)) return 1;
  const clamped = Math.max(0, Math.min(1, value));
  return ANIMATION_SPEED_MIN * Math.exp(ANIMATION_SPEED_LOG_SPAN * clamped);
};

export const formatAnimationSpeed = (speed: number): string => {
  const safeSpeed = clampAnimationSpeed(speed);
  return safeSpeed < 0.1 ? safeSpeed.toFixed(3) : safeSpeed.toFixed(2);
};

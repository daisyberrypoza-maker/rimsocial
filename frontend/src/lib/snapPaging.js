// Snap_Next_Page and Target_Video_Index (blueprint, Spotlight section), used by the Rimlight feed
export function snapTarget(current, deltaY, velocityY, screenHeight) {
  const next = Math.abs(deltaY) > screenHeight * 0.25 || Math.abs(velocityY) > 600;
  return next ? current + Math.sign(-deltaY) : current;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Camera zoom (blueprint camera formula): dragging up zooms in, 150px of drag = 1x more.
// Same formula as backend/src/services/formulas.js (cameraZoom).
export function cameraZoom(dragDelta, maxHardwareZoom = 1) {
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  return clamp(1 + Math.max(0, dragDelta) / 150, 1, Math.max(1, maxHardwareZoom));
}

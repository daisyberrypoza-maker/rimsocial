// Profile header collapse (blueprint profile formula): the avatar shrinks and lifts as the page scrolls.
// Same formula as backend/src/services/formulas.js (profileCollapse).
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (start, end, t) => start + (end - start) * t;

export function profileCollapse(scrollY) {
  const t = clamp(scrollY / 140, 0, 1);
  return {
    progress: t,
    avatarScale: lerp(1, 0.45, t),
    avatarY: lerp(0, -45, t),
  };
}

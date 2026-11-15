// Tile <-> fullscreen story motion. Geometry helpers used by StoryViewer.

export const OPEN_MS = 320;
export const EASE = 'cubic-bezier(0.2, 0, 0, 1)';            // fast-out, slow-in
export const SNAP_MS = 380;
export const SNAP_EASE = 'cubic-bezier(0.3, 1.25, 0.4, 1)';  // spring-like settle
const DRAG_THRESHOLD_PX = 250;
const DEFAULT_TILE_RADIUS = 16;

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

// Position and corner radius of a tapped tile, in viewport pixels
export function boxOf(el) {
  const r = el.getBoundingClientRect();
  const raw = getComputedStyle(el).borderRadius || '';
  let radius = parseFloat(raw);
  if (raw.includes('%')) radius = Math.min(r.width, r.height) / 2;   // circles (rail avatars)
  if (!Number.isFinite(radius)) radius = DEFAULT_TILE_RADIUS;
  return { left: r.left, top: r.top, width: r.width, height: r.height, radius };
}

export function fullBox() {
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, radius: 0 };
}

// Drag progress for a finger that moved (dx, dy) px from where it went down
export function dragState(dx, dy) {
  const dist = Math.hypot(dx, dy);
  const raw = clamp(dist / DRAG_THRESHOLD_PX, 0, 1);
  const d = 1 - Math.pow(1 - raw, 1.5);   // rubber-band resistance
  return {
    dist,
    raw,
    tx: dx * 0.85,
    ty: dy * 0.85,
    scale: lerp(1, 0.75, d),
    radius: lerp(0, 24, d),
    backdrop: lerp(0.85, 0, d),
    hud: clamp(1 - d * 3, 0, 1),
  };
}

// Where the viewer visually sits mid-drag, as a box (lets a close continue from the finger)
export function visualBox(ds) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const w = W * ds.scale;
  const h = H * ds.scale;
  const cx = W / 2 + ds.tx;
  const cy = H / 2 + ds.ty;
  return { left: cx - w / 2, top: cy - h / 2, width: w, height: h, radius: ds.radius };
}

// Sets the viewer's box; animate=false snaps, animate=true eases over OPEN_MS
export function applyBox(el, box, animate) {
  el.style.transition = animate
    ? `left ${OPEN_MS}ms ${EASE}, top ${OPEN_MS}ms ${EASE}, width ${OPEN_MS}ms ${EASE}, height ${OPEN_MS}ms ${EASE}, border-radius ${OPEN_MS}ms ${EASE}`
    : 'none';
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = '';
  el.style.borderRadius = `${box.radius}px`;
}

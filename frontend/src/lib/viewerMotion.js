import { flushSync } from 'react-dom';
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

export const CLOSE_AFTER_MS = OPEN_MS + 20;

// Opening: the viewer starts at the tile box and eases to fullscreen. Returns a cleanup.
export function openMotion(el, bd, origin) {
  if (!el || !origin) return () => {};
  applyBox(el, origin, false);
  el.style.setProperty('--hud', '0');
  if (bd) { bd.style.transition = 'none'; bd.style.opacity = '0'; }
  void el.offsetWidth;   // commit the tile position before animating
  applyBox(el, fullBox(), true);
  if (bd) { bd.style.transition = `opacity ${OPEN_MS}ms ${EASE}`; bd.style.opacity = '0.85'; }
  const hud = setTimeout(() => el.style.setProperty('--hud', '1'), Math.round(OPEN_MS * 0.5));
  return () => clearTimeout(hud);
}

// Closing: eases back into the tile. liveBox continues from where a drag left the viewer.
export function closeMotion(el, bd, origin, liveBox = null) {
  if (liveBox) applyBox(el, liveBox, false);
  void el.offsetWidth;
  delete el.dataset.drag;
  applyBox(el, origin, true);
  el.style.setProperty('--hud', '0');
  if (bd) { bd.style.transition = `opacity ${OPEN_MS}ms ${EASE}`; bd.style.opacity = '0'; }
}

// Live drag: moves the viewer with the finger. Returns the drag state.
export function dragMotion(el, bd, dx, dy) {
  const ds = dragState(dx, dy);
  el.dataset.drag = '1';
  el.style.transition = 'none';
  el.style.transform = `translate(${ds.tx}px, ${ds.ty}px) scale(${ds.scale})`;
  el.style.borderRadius = `${ds.radius}px`;
  el.style.setProperty('--hud', String(ds.hud));
  if (bd) { bd.style.transition = 'none'; bd.style.opacity = String(ds.backdrop); }
  return ds;
}

// A drag that did not pass the threshold springs back to fullscreen
export function snapMotion(el, bd) {
  delete el.dataset.drag;
  el.style.transition = `transform ${SNAP_MS}ms ${SNAP_EASE}, border-radius ${SNAP_MS}ms ${SNAP_EASE}`;
  el.style.transform = '';
  el.style.borderRadius = '0px';
  el.style.setProperty('--hud', '1');
  if (bd) { bd.style.transition = `opacity ${SNAP_MS}ms ease`; bd.style.opacity = '0.85'; }
}

// Release decision: past 35% of the threshold, or a flick above 800px/s, closes
export function shouldClose(ds, seconds) {
  return ds.raw > 0.35 || ds.dist / Math.max(seconds, 0.016) > 800;
}

// Whether a pointer that moved (dx, dy) from its start counts as a dismiss drag
export function isDismissDrag(dx, dy) {
  const down = dy > 8 && dy > Math.abs(dx) * 0.5;
  const sideways = Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy) * 1.5;
  return down || sideways;
}

// Opening a post from a tile: the tile's media grows into the post page (View Transitions API)
export function goToPost(navigate, url, tile) {
  const media = tile?.querySelector?.('img, video');
  if (!document.startViewTransition || !media) { navigate(url); return; }
  media.style.viewTransitionName = 'post-media';
  const transition = document.startViewTransition(() => flushSync(() => navigate(url)));
  transition.finished.finally(() => { media.style.viewTransitionName = ''; });
}

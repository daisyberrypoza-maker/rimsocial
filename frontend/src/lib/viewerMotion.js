import { flushSync } from 'react-dom';
// Tile <-> fullscreen story and media motion. Geometry follows the blueprint; the box and
// the drag snap run on Spring_Damping, not CSS easing.

export const OPEN_MS = 320;                 // hud fade timing reference
export const SPRING_OPEN = { stiffness: 300, damping: 28 };   // open and close
export const SPRING_SNAP = { stiffness: 350, damping: 30 };   // drag released below threshold
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
    audio: lerp(1, 0, d),   // Audio_Volume: the story's sound fades as it is dragged away
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

// Spring_Damping(pos, target, vel, stiffness, damping, dt): vel += (-k*(pos-target) - c*vel)*dt; pos += vel*dt
const runs = new WeakMap();

function stopRun(el) {
  const run = runs.get(el);
  if (run) { cancelAnimationFrame(run.raf); runs.delete(el); }
}

// Runs a spring for every key in `to`; apply() receives each frame's values, done() runs at rest
function springRun(el, from, to, spring, apply, done = null, velocity = {}) {
  stopRun(el);
  const state = {};
  for (const key of Object.keys(to)) state[key] = { pos: from[key], vel: velocity[key] || 0 };
  const run = { raf: 0 };
  runs.set(el, run);
  let last = null;
  const frame = (now) => {
    const dt = last === null ? 1 / 60 : Math.min(1 / 30, (now - last) / 1000);
    last = now;
    const current = {};
    let settled = true;
    for (const key of Object.keys(to)) {
      const s = state[key];
      s.vel += (-spring.stiffness * (s.pos - to[key]) - spring.damping * s.vel) * dt;
      s.pos += s.vel * dt;
      const tolerance = key === 'scale' ? 0.001 : 0.5;
      if (Math.abs(s.pos - to[key]) > tolerance || Math.abs(s.vel) > tolerance) settled = false;
      current[key] = s.pos;
    }
    if (settled) {
      runs.delete(el);
      apply(to);
      if (done) done();
      return;
    }
    apply(current);
    run.raf = requestAnimationFrame(frame);
  };
  run.raf = requestAnimationFrame(frame);
}

// Sets the viewer box at once (no motion); used before a spring run and for the final frame
export function applyBox(el, box) {
  el.style.transition = 'none';
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.right = 'auto';
  el.style.bottom = 'auto';
  el.style.transform = '';
  el.style.borderRadius = `${box.radius}px`;
}

function setBoxFrame(el, box) {
  el.style.left = `${box.left}px`;
  el.style.top = `${box.top}px`;
  el.style.width = `${box.width}px`;
  el.style.height = `${box.height}px`;
  el.style.borderRadius = `${box.radius}px`;
}

function setDragFrame(el, d) {
  el.style.transform = `translate(${d.tx}px, ${d.ty}px) scale(${d.scale})`;
  el.style.borderRadius = `${d.radius}px`;
}

// Opening: the viewer starts at the tile box and springs to fullscreen; the chrome fades in halfway.
export function openMotion(el, bd, origin) {
  if (!el || !origin) return () => {};
  applyBox(el, origin);
  el.style.setProperty('--hud', '0');
  if (bd) { bd.style.transition = 'none'; bd.style.opacity = '0'; }
  void el.offsetWidth;   // commit the tile position before animating
  springRun(el, origin, fullBox(), SPRING_OPEN, (box) => setBoxFrame(el, box));
  if (bd) { bd.style.transition = `opacity ${OPEN_MS}ms ease`; bd.style.opacity = '0.85'; }
  const hud = setTimeout(() => el.style.setProperty('--hud', '1'), Math.round(OPEN_MS * 0.5));
  return () => { clearTimeout(hud); stopRun(el); };
}

// Closing: springs back into the tile. liveBox continues from where a drag left the viewer,
// velocity is the release velocity in px/s, done runs once the viewer is back in the tile.
export function closeMotion(el, bd, origin, liveBox = null, velocity = {}, done = null) {
  delete el.dataset.drag;
  const from = liveBox || boxOf(el);
  applyBox(el, from);
  void el.offsetWidth;
  el.style.setProperty('--hud', '0');
  if (bd) { bd.style.transition = `opacity ${OPEN_MS}ms ease`; bd.style.opacity = '0'; }
  springRun(el, from, origin, SPRING_OPEN, (box) => setBoxFrame(el, box), done, velocity);
}

// Live drag: moves the viewer with the finger. Returns the drag state.
export function dragMotion(el, bd, dx, dy) {
  stopRun(el);
  const ds = dragState(dx, dy);
  el.dataset.drag = '1';
  el.style.transition = 'none';
  setDragFrame(el, ds);
  el._drag = ds;
  el.style.setProperty('--hud', String(ds.hud));
  if (bd) { bd.style.transition = 'none'; bd.style.opacity = String(ds.backdrop); }
  return ds;
}

// A drag released below the threshold springs back to fullscreen from where the finger left it
export function snapMotion(el, bd) {
  delete el.dataset.drag;
  const from = el._drag || { tx: 0, ty: 0, scale: 1, radius: 0 };
  setDragFrame(el, from);
  el._drag = null;
  springRun(el, { tx: from.tx, ty: from.ty, scale: from.scale, radius: from.radius },
    { tx: 0, ty: 0, scale: 1, radius: 0 }, SPRING_SNAP,
    (d) => setDragFrame(el, d), () => { el.style.transform = ''; el.style.borderRadius = '0px'; });
  el.style.setProperty('--hud', '1');
  if (bd) { bd.style.transition = 'opacity 380ms ease'; bd.style.opacity = '0.85'; }
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

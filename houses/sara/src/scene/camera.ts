/**
 * Camera maths shared by the motion loop and the chip layout. The DOM mirrors these numbers:
 *   .hm-persp  perspective: P px, origin at the stage centre
 *   .hm-tilt   rotateX(pitch) rotateY(yaw)            (pivot = stage centre)
 *   .hm-world  scale(k) translate3d(−centre · u0)    (u0 = the committed px-per-metre in --u)
 * so a scene point p (metres) lands at screen = centre + R · (s · (p − c)) · P / (P − z).
 */

export interface Cam {
  /** Degrees. Yaw already includes the sway. */
  yaw: number;
  pitch: number;
  /** Effective px per metre. */
  s: number;
  cx: number;
  cy: number;
  cz: number;
}

export interface Viewport {
  w: number;
  h: number;
  /** Perspective distance (px). */
  p: number;
}

const D2R = Math.PI / 180;

/** Project a scene point to stage pixels. Returns [sx, sy, depth toward the viewer]. */
export function project(cam: Cam, vp: Viewport, x: number, y: number, z: number): [number, number, number] {
  const X = cam.s * (x - cam.cx);
  const Y = -cam.s * (y - cam.cy);
  const Z = cam.s * (z - cam.cz);
  const a = cam.yaw * D2R;
  const b = cam.pitch * D2R;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const x1 = X * ca + Z * sa;
  const z1 = -X * sa + Z * ca;
  const cb = Math.cos(b);
  const sb = Math.sin(b);
  const y2 = Y * cb - z1 * sb;
  const z2 = Y * sb + z1 * cb;
  const f = vp.p / Math.max(1, vp.p - z2);
  return [vp.w / 2 + x1 * f, vp.h / 2 + y2 * f, z2];
}

/** CSS cubic-bezier(0.2, 0.7, 0.2, 1) — the page's --ease — evaluated at t ∈ [0, 1]. */
export function ease(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const x1 = 0.2, y1 = 0.7, x2 = 0.2, y2 = 1;
  const bx = (u: number) => 3 * x1 * u * (1 - u) * (1 - u) + 3 * x2 * u * u * (1 - u) + u * u * u;
  const by = (u: number) => 3 * y1 * u * (1 - u) * (1 - u) + 3 * y2 * u * u * (1 - u) + u * u * u;
  let lo = 0, hi = 1, u = t;
  for (let i = 0; i < 18; i++) {
    u = (lo + hi) / 2;
    if (bx(u) < t) lo = u;
    else hi = u;
  }
  return by(u);
}

/** Shortest signed angular difference b − a in degrees. */
export function angleDelta(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

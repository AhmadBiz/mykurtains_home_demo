/**
 * Screen-space layout of the label chips: each chip sits outside the projected model on the outward
 * side of its anchor, chips never overlap each other, the model or the corner controls, and they
 * stay inside the stage. Pure maths, a few microseconds per frame.
 */

export type Pt = [number, number];

export interface ChipIn {
  anchor: Pt;
  /** Preferred unit direction from the anchor (screen). */
  dir: Pt;
  hw: number;
  hh: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Monotone-chain convex hull, counter-clockwise in screen space. */
export function convexHull(points: Pt[]): Pt[] {
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Pt[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

interface Axis {
  n: Pt;
  min: number;
  max: number;
}

function hullAxes(hull: Pt[]): Axis[] {
  const axes: Axis[] = [];
  const add = (n: Pt) => {
    let min = Infinity;
    let max = -Infinity;
    for (const q of hull) {
      const d = q[0] * n[0] + q[1] * n[1];
      if (d < min) min = d;
      if (d > max) max = d;
    }
    axes.push({ n, min, max });
  };
  add([1, 0]);
  add([0, 1]);
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i];
    const b = hull[(i + 1) % hull.length];
    const ex = b[0] - a[0];
    const ey = b[1] - a[1];
    const l = Math.hypot(ex, ey);
    if (l > 1e-6) add([-ey / l, ex / l]);
  }
  return axes;
}

/**
 * Smallest t ≥ 0 such that the rect (centre c, half sizes hw/hh, grown by m) moved by t·d no longer
 * overlaps the convex hull (separating-axis test). 0 when already clear.
 */
function pushOut(axes: Axis[], c: Pt, hw: number, hh: number, m: number, d: Pt): number {
  let best = Infinity;
  for (const { n, min, max } of axes) {
    const pc = c[0] * n[0] + c[1] * n[1];
    const r = (hw + m) * Math.abs(n[0]) + (hh + m) * Math.abs(n[1]);
    const lo = pc - r;
    const hi = pc + r;
    if (lo >= max || hi <= min) return 0;
    const dn = d[0] * n[0] + d[1] * n[1];
    if (dn > 1e-4) best = Math.min(best, (max - lo) / dn);
    else if (dn < -1e-4) best = Math.min(best, (hi - min) / -dn);
  }
  return Number.isFinite(best) ? best : 0;
}

const norm = (v: Pt): Pt => {
  const l = Math.hypot(v[0], v[1]);
  return l > 1e-6 ? [v[0] / l, v[1] / l] : [0, -1];
};

export function layoutChips(chips: ChipIn[], hull: Pt[], stage: Rect, obstacles: Rect[], gap: number, margin: number): Pt[] {
  const axes = hullAxes(hull);
  let hx = 0;
  let hy = 0;
  for (const q of hull) {
    hx += q[0];
    hy += q[1];
  }
  hx /= Math.max(1, hull.length);
  hy /= Math.max(1, hull.length);

  const pos: Pt[] = chips.map((c) => {
    const d = c.dir;
    const reach = c.hw * Math.abs(d[0]) + c.hh * Math.abs(d[1]) + 18;
    const p: Pt = [c.anchor[0] + d[0] * reach, c.anchor[1] + d[1] * reach];
    const t = pushOut(axes, p, c.hw, c.hh, margin, d);
    return [p[0] + d[0] * t, p[1] + d[1] * t];
  });

  const clampIn = (i: number) => {
    const c = chips[i];
    const p = pos[i];
    p[0] = Math.min(stage.x1 - c.hw, Math.max(stage.x0 + c.hw, p[0]));
    p[1] = Math.min(stage.y1 - c.hh, Math.max(stage.y0 + c.hh, p[1]));
  };

  for (let iter = 0; iter < 48; iter++) {
    let moved = false;
    // chip ↔ chip
    for (let i = 0; i < chips.length; i++) {
      for (let j = i + 1; j < chips.length; j++) {
        const a = pos[i];
        const b = pos[j];
        const ox = chips[i].hw + chips[j].hw + gap - Math.abs(a[0] - b[0]);
        const oy = chips[i].hh + chips[j].hh + gap - Math.abs(a[1] - b[1]);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // separate along the cheaper axis (chips are wide, so usually vertically)
        if (oy * 1.6 < ox) {
          const s = (a[1] < b[1] || (a[1] === b[1] && i < j) ? -1 : 1) * (oy / 2 + 0.5);
          a[1] += s;
          b[1] -= s;
        } else {
          const s = (a[0] < b[0] ? -1 : 1) * (ox / 2 + 0.5);
          a[0] += s;
          b[0] -= s;
        }
      }
    }
    // fixed obstacles (the corner controls)
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      const p = pos[i];
      for (const o of obstacles) {
        const ox = Math.min(p[0] + c.hw, o.x1) - Math.max(p[0] - c.hw, o.x0) + gap;
        const oy = Math.min(p[1] + c.hh, o.y1) - Math.max(p[1] - c.hh, o.y0) + gap;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        if (oy < ox) p[1] -= oy;
        else p[0] -= ox;
      }
    }
    // model hull and stage bounds
    for (let i = 0; i < chips.length; i++) {
      const c = chips[i];
      clampIn(i);
      const p = pos[i];
      const radial = norm([p[0] - hx, p[1] - hy]);
      const d = norm([radial[0] + c.dir[0], radial[1] + c.dir[1]]);
      const t = pushOut(axes, p, c.hw, c.hh, margin, d);
      if (t > 0) {
        moved = true;
        p[0] += d[0] * Math.min(t, 12);
        p[1] += d[1] * Math.min(t, 12);
        clampIn(i);
      }
    }
    if (!moved) break;
  }
  return pos;
}

/** Point where the segment from the rect centre toward `to` leaves the rect. */
export function rectExit(c: Pt, hw: number, hh: number, to: Pt): Pt {
  const dx = to[0] - c[0];
  const dy = to[1] - c[1];
  const tx = Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity;
  const ty = Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Infinity;
  const t = Math.min(1, tx, ty);
  return [c[0] + dx * t, c[1] + dy * t];
}

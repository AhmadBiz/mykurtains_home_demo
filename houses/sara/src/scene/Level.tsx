import { memo } from 'react';
import type { CSSProperties } from 'react';
import { colorOption } from '../data/coverings';
import { WALL_GEOMS } from '../data/geometry';
import type { WindowInstance } from '../data/geometry';
import { paneStyle } from '../illustrations/pane';
import { useCovering, useStore } from '../store/useStore';
import { drapeBox, drapeStyle, hasDrape } from './drape';
import { ALL_GAP, isTallWindow } from './model';
import type { GlassWall, RoomLabel, SceneLevel } from './model';

/**
 * A wall plane's front face points along the wall's normal, so its CSS left is the room's left only when the room
 * lies on the normal side. Otherwise the pane is seen from behind from inside the room and the preview is mirrored
 * (vertical blinds stack on the left as seen from inside, like the front-view drawing).
 */
function paneMirrored(w: WindowInstance): boolean {
  const g = WALL_GEOMS.get(w.wall.id);
  return !!g && g.normal[0] * w.inward[0] + g.normal[1] * w.inward[1] < 0;
}

type Vars = CSSProperties & Record<`--${string}`, string | number>;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// -------------------------------------------------------------------------------------------
// Window: a real button on its glass wall, with the covering preview inside
// -------------------------------------------------------------------------------------------
const Win = memo(function Win({ w, wall }: { w: WindowInstance; wall: GlassWall }) {
  const state = useCovering(w.id);
  const hovered = useStore((s) => s.hoveredWindowId === w.id);
  const selected = useStore((s) => s.selectedWindowId === w.id);
  const fr = useStore((s) => s.lang === 'fr');
  const bottom = w.center.y - w.height / 2 - wall.wall.baseY;
  const style: Vars = {
    '--wl': r3(w.opening.at - w.width / 2),
    '--wb': r3(bottom),
    '--ww': r3(w.width),
    '--wh': r3(w.height + (isTallWindow(w) ? ALL_GAP : 0)),
  };
  const leave = () => {
    if (useStore.getState().hoveredWindowId === w.id) useStore.getState().setHovered(null);
  };
  const color = colorOption(state);
  // Curtains and sheers hang from the ceiling track beside the opening (the drape); the pane is then bare glass.
  const drape = hasDrape(state);
  const box = drape ? drapeBox(w) : null;
  return (
    <>
      {box && (
        <span
          className="hm-drape"
          data-on={hovered || selected ? '' : undefined}
          style={{ ...drapeStyle(state, color, w), '--wl': box.left, '--wb': box.bottom, '--ww': box.width, '--wh': box.height } as Vars}
        />
      )}
      <button
        type="button"
        className="hm-win"
        data-wide={w.width > 1.15 ? '' : undefined}
        data-frost={w.frosted ? '' : undefined}
        data-hov={hovered ? '' : undefined}
        data-sel={selected ? '' : undefined}
        tabIndex={-1}
        aria-label={fr ? w.nameFr : w.name}
        aria-pressed={selected}
        style={style}
        onPointerEnter={() => useStore.getState().setHovered(w.id)}
        onPointerLeave={leave}
        onClick={() => useStore.getState().selectWindow(w.id)}
      >
        <span className="hm-pane" style={paneStyle(drape ? { ...state, type: 'none' } : state, color, paneMirrored(w))} />
        <span className="hm-hit" />
      </button>
    </>
  );
});

// -------------------------------------------------------------------------------------------
// Glass wall
// -------------------------------------------------------------------------------------------
function Wall({ g }: { g: GlassWall }) {
  const style: Vars = {
    '--x': r3(g.x),
    '--y': r3(g.y),
    '--z': r3(g.z),
    '--len': r3(g.length),
    '--ht': r3(g.height),
    '--ry': g.ry,
  };
  return (
    <div className="hm-wall" data-n={`${r3(g.out[0])},${r3(g.out[1])}`} style={style}>
      {g.doors.map((d) => (
        <span
          key={d.id}
          className="hm-door"
          data-kind={d.kind}
          style={{ '--wl': r3(d.left), '--wb': r3(d.bottom), '--ww': r3(d.width), '--wh': r3(d.height) } as Vars}
        />
      ))}
      {g.windows.map((w) => (
        <Win key={w.id} w={w} wall={g} />
      ))}
    </div>
  );
}

// -------------------------------------------------------------------------------------------
// Floor slab with the plan drawn on it
// -------------------------------------------------------------------------------------------
const CHAR_W = 0.56;

/** Place a room name so it reads left → right for the default view and fits its room. */
function labelGeom(l: RoomLabel, textAngle: number, fr: boolean) {
  const text = fr ? l.nameFr : l.name;
  const [a, b, c, d] = l.room;
  const along = (ang: number) => ((((ang % 180) + 180) % 180) === 0 ? c - a : d - b) * 0.84;
  const alt = textAngle + 90;
  const est = text.length * CHAR_W;
  const fitMain = along(textAngle) / est;
  const fitAlt = along(alt) / est;
  const useAlt = fitMain < l.size && fitAlt > fitMain * 1.25;
  const ang = useAlt ? alt : textAngle;
  const size = Math.max(0.32, Math.min(l.size, useAlt ? fitAlt : fitMain));
  return { text, ang, size };
}

/** The slab SVG is authored in centimetres: Chrome rasterises tiny SVG font sizes poorly. */
const CM = 100;
const cm = (v: number) => Math.round(v * CM * 10) / 10;

/**
 * `room` is the plan name of the hovered / selected window's room: only that room is named on the floor (the chips
 * already carry every room name), so the floors otherwise show the plan lines alone.
 */
export const Slab = memo(function Slab({ level, room, pool, fr, textAngle }: { level: SceneLevel; room: string | null; pool: [number, number] | null; fr: boolean; textAngle: number }) {
  const s = level.slab;
  const label = room ? s.labels.find((l) => l.key === room) : undefined;
  const [x0, z0, w, d] = s.box;
  const style: Vars = { '--x': r3(x0), '--y': r3(s.y), '--z': r3(z0), '--len': r3(w), '--dep': r3(d) };
  return (
    <div className="hm-slab" style={style}>
      <svg viewBox={`${cm(x0)} ${cm(z0)} ${cm(w)} ${cm(d)}`} preserveAspectRatio="none" aria-hidden="true">
        <g transform={`scale(${CM})`}>
          <path className="hm-slab-fill" d={s.fill} fillRule="evenodd" />
          {pool && <circle className="hm-pool" cx={r3(pool[0])} cy={r3(pool[1])} r={2.4} />}
          <path className="hm-plan" d={s.inner} />
          {s.rails && <path className="hm-plan hm-rail" d={s.rails} />}
          <path className="hm-outline" d={s.outline} />
        </g>
        {label && (
          <g className="hm-rooms">
            {(() => {
              const g = labelGeom(label, textAngle, fr);
              return (
                <text key={label.id + g.ang} x={cm(label.x)} y={cm(label.z)} fontSize={cm(g.size)} transform={`rotate(${g.ang} ${cm(label.x)} ${cm(label.z)})`}>
                  {g.text}
                </text>
              );
            })()}
          </g>
        )}
      </svg>
    </div>
  );
});

// -------------------------------------------------------------------------------------------
// One storey's glass walls (sorted in 3D among themselves only)
// -------------------------------------------------------------------------------------------
export const Walls = memo(function Walls({ level }: { level: SceneLevel }) {
  return (
    <>
      {level.walls.map((g) => (
        <Wall key={g.wall.id} g={g} />
      ))}
    </>
  );
});

import { memo } from 'react';
import type { CSSProperties } from 'react';
import { colorOption } from '../data/coverings';
import type { WindowInstance } from '../data/geometry';
import { paneStyle } from '../illustrations/pane';
import { useCovering, useStore } from '../store/useStore';
import type { GlassWall, RoomLabel, SceneLevel } from './model';

type Vars = CSSProperties & Record<`--${string}`, string | number>;
const r3 = (v: number) => Math.round(v * 1000) / 1000;

// -------------------------------------------------------------------------------------------
// Window: a real button on its glass wall, with the covering preview inside
// -------------------------------------------------------------------------------------------
const Win = memo(function Win({ w, wall, dim }: { w: WindowInstance; wall: GlassWall; dim: boolean }) {
  const state = useCovering(w.id);
  const hovered = useStore((s) => s.hoveredWindowId === w.id);
  const selected = useStore((s) => s.selectedWindowId === w.id);
  const fr = useStore((s) => s.lang === 'fr');
  const bottom = w.center.y - w.height / 2 - (wall.wall.baseY);
  const style: Vars = {
    '--wl': r3(w.opening.at - w.width / 2),
    '--wb': r3(bottom),
    '--ww': r3(w.width),
    '--wh': r3(w.height),
  };
  const leave = () => {
    if (useStore.getState().hoveredWindowId === w.id) useStore.getState().setHovered(null);
  };
  return (
    <button
      type="button"
      className="hm-win"
      data-wide={w.width > 1.15 ? '' : undefined}
      data-frost={w.frosted ? '' : undefined}
      data-hov={hovered ? '' : undefined}
      data-sel={selected ? '' : undefined}
      tabIndex={dim ? -1 : 0}
      aria-label={fr ? w.nameFr : w.name}
      aria-pressed={selected}
      style={style}
      onPointerEnter={() => useStore.getState().setHovered(w.id)}
      onPointerLeave={leave}
      onFocus={() => useStore.getState().setHovered(w.id)}
      onBlur={leave}
      onClick={() => useStore.getState().selectWindow(w.id)}
    >
      <span className="hm-pane" style={paneStyle(state, colorOption(state))} />
    </button>
  );
});

// -------------------------------------------------------------------------------------------
// Glass wall
// -------------------------------------------------------------------------------------------
function Wall({ g, dim }: { g: GlassWall; dim: boolean }) {
  const style: Vars = {
    '--x': r3(g.x),
    '--y': r3(g.y),
    '--z': r3(g.z),
    '--len': r3(g.length),
    '--ht': r3(g.height),
    '--ry': g.ry,
  };
  return (
    <div className="hm-wall" style={style}>
      {g.doors.map((d) => (
        <span
          key={d.id}
          className="hm-door"
          data-kind={d.kind}
          style={{ '--wl': r3(d.left), '--wb': r3(d.bottom), '--ww': r3(d.width), '--wh': r3(d.height) } as Vars}
        />
      ))}
      {g.windows.map((w) => (
        <Win key={w.id} w={w} wall={g} dim={dim} />
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
  const size = Math.max(0.2, Math.min(l.size, useAlt ? fitAlt : fitMain));
  return { text, ang, size };
}

function Slab({ level, showLabels, pool, fr, textAngle }: { level: SceneLevel; showLabels: boolean; pool: [number, number] | null; fr: boolean; textAngle: number }) {
  const s = level.slab;
  const [x0, z0, w, d] = s.box;
  const style: Vars = { '--x': r3(x0), '--y': r3(s.y), '--z': r3(z0), '--len': r3(w), '--dep': r3(d) };
  return (
    <div className="hm-slab" style={style}>
      <svg viewBox={`${r3(x0)} ${r3(z0)} ${r3(w)} ${r3(d)}`} preserveAspectRatio="none" aria-hidden="true">
        <path className="hm-slab-fill" d={s.fill} fillRule="evenodd" />
        {pool && <circle className="hm-pool" cx={r3(pool[0])} cy={r3(pool[1])} r={2.4} />}
        <path className="hm-plan" d={s.inner} />
        {s.rails && <path className="hm-plan hm-rail" d={s.rails} />}
        <path className="hm-outline" d={s.outline} />
        {showLabels && (
          <g className="hm-rooms">
            {s.labels.map((l) => {
              const g = labelGeom(l, textAngle, fr);
              return (
                <text key={l.id} x={r3(l.x)} y={r3(l.z)} fontSize={r3(g.size)} transform={`rotate(${g.ang} ${r3(l.x)} ${r3(l.z)})`}>
                  {g.text}
                </text>
              );
            })}
          </g>
        )}
      </svg>
    </div>
  );
}

// -------------------------------------------------------------------------------------------
// One storey
// -------------------------------------------------------------------------------------------
export interface LevelProps {
  level: SceneLevel;
  dim: boolean;
  showLabels: boolean;
  /** Plan point (x, z) for the copper pool (selected or hovered window), or null. */
  pool: [number, number] | null;
  fr: boolean;
  textAngle: number;
}

export const Level = memo(function Level({ level, dim, showLabels, pool, fr, textAngle }: LevelProps) {
  return (
    <div className="hm-level" data-level={level.id} data-dim={dim ? '' : undefined}>
      <Slab level={level} showLabels={showLabels} pool={pool} fr={fr} textAngle={textAngle} />
      {level.walls.map((g) => (
        <Wall key={g.wall.id} g={g} dim={dim} />
      ))}
    </div>
  );
});

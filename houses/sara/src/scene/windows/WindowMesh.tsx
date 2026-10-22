import { useCallback, useEffect, useMemo } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { DEFAULT_COVERINGS, colorOption, defaultStateFor } from '../../data/coverings';
import type { WindowInstance } from '../../data/geometry';
import { Covering } from '../coverings';
import type { WindowMaterials } from './materials';
import {
  doorAluminium,
  doorGlass,
  doorHandle,
  doorTrim,
  highlightFrame,
  highlightZ,
  hitBox,
  windowGlass,
  windowLedge,
  windowWoodwork,
} from './geometry';
import type { Dims } from './geometry';
import { Highlight } from './Highlight';

/**
 * Transparent sort: the glass draws first (-1); the coverings group gets renderOrder 1, which
 * three.js uses as the *groupOrder* of every mesh inside it, so coverings — whatever renderOrder
 * their own meshes use — always draw after the glass and after other transparent scene objects.
 */
const GLASS_RENDER_ORDER = -1;
const COVERING_GROUP_ORDER = 1;

const NO_COVERING = defaultStateFor('none');

interface BodyProps {
  dims: Dims;
  mats: WindowMaterials;
}

/** Frame + stool/apron/casing (one mesh), exterior stone ledge, glass pane. */
function WindowBody({ dims, mats, frosted }: BodyProps & { frosted: boolean }) {
  const wood = useMemo(() => windowWoodwork(dims), [dims]);
  const ledge = useMemo(() => windowLedge(dims), [dims]);
  const glass = useMemo(() => windowGlass(dims), [dims]);
  return (
    <>
      <mesh geometry={wood} material={mats.wood} castShadow receiveShadow />
      <mesh geometry={ledge} material={mats.stone} castShadow receiveShadow />
      <mesh geometry={glass} material={frosted ? mats.frosted : mats.glass} renderOrder={GLASS_RENDER_ORDER} />
    </>
  );
}

/** Patio door: aluminium frame + track + two sliding panels, interior casing, handles, two panes. */
function DoorBody({ dims, mats }: BodyProps) {
  const alu = useMemo(() => doorAluminium(dims), [dims]);
  const trim = useMemo(() => doorTrim(dims), [dims]);
  const handle = useMemo(() => doorHandle(dims), [dims]);
  const glass = useMemo(() => doorGlass(dims), [dims]);
  return (
    <>
      <mesh geometry={alu} material={mats.alu} castShadow receiveShadow />
      <mesh geometry={trim} material={mats.wood} castShadow receiveShadow />
      <mesh geometry={handle} material={mats.metal} />
      <mesh geometry={glass} material={mats.glass} renderOrder={GLASS_RENDER_ORDER} />
    </>
  );
}

interface Props {
  win: WindowInstance;
  mats: WindowMaterials;
}

/**
 * One coverable opening. Local frame: +X along the wall, +Z into the room, origin at the centre of
 * the opening on the wall centre-line (see WindowInstance). Mounts the <Covering/> on the interior
 * face, an invisible hit box carrying `userData.windowId` for the Player's centre raycast, and the
 * hover / selection highlight.
 */
export function WindowMesh({ win, mats }: Props) {
  const { id, width, height, wallThickness, isDoor, frosted, opening, center, yaw } = win;

  const stored = useStore((s) => s.coverings[id]);
  const state = stored ?? DEFAULT_COVERINGS[id] ?? NO_COVERING;
  const color = colorOption(state);

  const dims = useMemo<Dims>(() => ({ width, height, wallThickness }), [width, height, wallThickness]);
  const position = useMemo<[number, number, number]>(() => [center.x, center.y, center.z], [center]);
  const userData = useMemo(() => ({ windowId: id }), [id]);
  const hit = useMemo(() => hitBox(dims), [dims]);
  const highlight = useMemo(() => highlightFrame(dims, isDoor), [dims, isDoor]);

  // Mouse picking for orbit mode and for mouse users before pointer lock. Under pointer lock the
  // pointer position is stale, so the Player's centre raycast is the only source of truth there.
  const onPointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      const s = useStore.getState();
      if (s.pointerLocked) return;
      e.stopPropagation();
      s.setHovered(id);
      document.body.style.cursor = 'pointer';
    },
    [id],
  );
  const onPointerOut = useCallback(() => {
    const s = useStore.getState();
    if (s.hoveredWindowId === id) s.setHovered(null);
    document.body.style.cursor = '';
  }, [id]);
  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      const s = useStore.getState();
      if (s.pointerLocked) return;
      e.stopPropagation();
      s.selectWindow(id);
    },
    [id],
  );
  // If this window disappears while hovered (orbit level change), leave no stale hover behind.
  useEffect(
    () => () => {
      const s = useStore.getState();
      if (s.hoveredWindowId === id) {
        s.setHovered(null);
        document.body.style.cursor = '';
      }
    },
    [id],
  );

  return (
    <group position={position} rotation={[0, yaw, 0]} name={`window:${id}`} userData={userData}>
      {isDoor ? <DoorBody dims={dims} mats={mats} /> : <WindowBody dims={dims} mats={mats} frosted={frosted} />}
      <group position={[0, 0, wallThickness / 2]} renderOrder={COVERING_GROUP_ORDER}>
        <Covering
          width={width}
          height={height}
          sill={opening.sill}
          reveal={wallThickness / 2}
          isDoor={isDoor}
          state={state}
          color={color}
        />
      </group>
      <mesh
        geometry={hit}
        material={mats.hit}
        userData={userData}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
      />
      <Highlight id={id} geometry={highlight} z={highlightZ(wallThickness)} mats={mats} />
    </group>
  );
}

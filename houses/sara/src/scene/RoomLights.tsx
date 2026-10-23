/**
 * Interior lighting. Walls do not occlude the HDRI's diffuse light in three.js, but the sky alone
 * leaves rooms grey, so every room gets a ceiling fixture with a warm (~3000 K) PointLight (no
 * shadows — 35 shadow casters would be far too expensive). Physical units (candela-ish, decay 2):
 * irradiance at d metres = intensity / d². The source sits 20–25 cm below the ceiling so each
 * fixture leaves a halo on the ceiling around it.
 *
 *  - ordinary rooms: a flush-mount disc (r 0.18 m) at the room centre, 2 cm below the ceiling;
 *  - the six big open rooms: two recessed spots (r 0.06 m) at 1/4 and 3/4 of the long axis;
 *  - the garage: one bare bulb on a short stem;
 *  - closets under 2 m² keep a fixture but no light (their neighbours light them).
 *
 * Fixtures are drawn with four InstancedMeshes (4 draw calls, ~5 k triangles) built once from HOUSE.
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { HOUSE } from '../data/house';
import type { LevelId } from '../data/types';
import { LEVEL_BY_ID, LEVEL_ORDER } from '../data/geometry';
import { useStore } from '../store/useStore';
import { INDOOR_ENV_INTENSITY, applyIndoorEnvironment, useIndoorEnvironment } from './Lighting';

const CEILING_GAP = 0.02;

type FixtureKind = 'flush' | 'spot' | 'bulb';
/** Rooms that get two recessed spots instead of one flush mount. */
const TWO_FIXTURES = new Set(['g-salon', 'g-sam', 'g-cuisine', 'b-jeux', 'b-familiale', 'u-ch1']);
/** Below this floor area (m²) a room gets a fixture but no PointLight. */
const NO_LIGHT_AREA = 2;
/**
 * Global multiplier for every PointLight (tuned against the screenshots with exposure 0.85, no
 * ambient and a 0.12 hemisphere fill). The fixtures are what lights the rooms: the sky IBL that leaks
 * through the walls is only a cool base, and at 0.5 the lamps were too weak to leave warm pools.
 */
const LIGHT_SCALE = 1.0;
/** ~3000 K warm white. */
const LIGHT_COLOR = '#ffe3c0';
/**
 * Point-light source height below the ceiling: low enough that each fixture leaves a soft halo on
 * the ceiling around it (a source flush with the ceiling cannot light it at all).
 */
const LIGHT_DROP: Record<FixtureKind, number> = { flush: 0.22, spot: 0.25, bulb: 0.2 };
/** PointLight range = room diagonal × this, so the smooth range cut-off never shows in a corner. */
const RANGE_FACTOR = 1.4;

interface Fixture {
  kind: FixtureKind;
  level: LevelId;
  x: number;
  z: number;
  /** Ceiling height (m) at this fixture. */
  ceiling: number;
  /** PointLight intensity (0 = no light). */
  intensity: number;
  distance: number;
}

/** Reference point on a wall: this far below the fixture (m). */
const WALL_DROP = 1.2;
/** Irradiance wanted at the nearest mid-wall point (intensity × cos / d²). */
const WALL_IRRADIANCE = 1.0;

/**
 * PointLight intensity that puts WALL_IRRADIANCE on the nearest wall, `nearest` metres away
 * horizontally and WALL_DROP below the source. The irradiance a wall receives is intensity / d², so
 * the former per-area tiers (4 / 7 / 12 cd) over-lit the small rooms: 4 cd 0.9 m from a bathroom
 * wall is brighter than 12 cd 2.5 m from a bedroom wall. Holding the wall irradiance constant puts
 * white paint around 170–185 sRGB in every room with a ~200 halo on the ceiling over the fixture
 * (bathroom 3.75 cd, bedroom 4.7, garage ~7, ~4 per spot in the double-fixture rooms).
 */
function intensityFor(nearest: number): number {
  const a = THREE.MathUtils.clamp(nearest, 0.9, 3.5);
  return (WALL_IRRADIANCE * Math.pow(a * a + WALL_DROP * WALL_DROP, 1.5)) / a;
}

function buildFixtures(): Fixture[] {
  const out: Fixture[] = [];
  for (const room of HOUSE.rooms) {
    if (room.noFloor) continue;
    const level = LEVEL_BY_ID[room.level];
    const ceiling = level.floorY + level.ceilingHeight;
    const [x1, z1, x2, z2] = room.bounds;
    const w = x2 - x1;
    const d = z2 - z1;
    const area = w * d;
    const diag = Math.hypot(w, d);
    const cx = (x1 + x2) / 2;
    const cz = (z1 + z2) / 2;
    if (TWO_FIXTURES.has(room.id)) {
      const alongX = w >= d;
      // each spot sits at 1/4 of the long axis: its nearest wall is the closer of a side and an end
      const each = intensityFor(Math.min(Math.min(w, d) / 2, Math.max(w, d) / 4)) * LIGHT_SCALE;
      for (const f of [0.25, 0.75]) {
        out.push({
          kind: 'spot',
          level: room.level,
          x: alongX ? x1 + w * f : cx,
          z: alongX ? cz : z1 + d * f,
          ceiling,
          intensity: each,
          distance: diag * RANGE_FACTOR,
        });
      }
      continue;
    }
    const intensity = area < NO_LIGHT_AREA ? 0 : intensityFor(Math.min(w, d) / 2) * LIGHT_SCALE;
    out.push({ kind: room.id === 'g-garage' ? 'bulb' : 'flush', level: room.level, x: cx, z: cz, ceiling, intensity, distance: diag * RANGE_FACTOR });
  }
  return out;
}

const FIXTURES: Fixture[] = buildFixtures();
const LIGHTS: Fixture[] = FIXTURES.filter((f) => f.intensity > 0);

// ---------------------------------------------------------------------------------------------
// Fixture geometry / materials (shared, created once)
// ---------------------------------------------------------------------------------------------
const FLUSH_HOUSING = new THREE.CylinderGeometry(0.19, 0.17, 0.06, 36);
const FLUSH_LENS = new THREE.CylinderGeometry(0.15, 0.15, 0.016, 36);
const SPOT_TRIM = new THREE.CylinderGeometry(0.075, 0.075, 0.012, 24);
const SPOT_LENS = new THREE.CylinderGeometry(0.055, 0.055, 0.008, 24);
const BULB_BASE = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 24);
const BULB_STEM = new THREE.CylinderGeometry(0.014, 0.014, 0.09, 12);
const BULB = new THREE.SphereGeometry(0.038, 20, 14);

const WHITE = new THREE.MeshStandardMaterial({ color: '#f6f5f2', roughness: 0.45, metalness: 0.05, envMapIntensity: INDOOR_ENV_INTENSITY });
const LENS = new THREE.MeshStandardMaterial({ color: '#fff7e8', emissive: '#fff2d6', emissiveIntensity: 2, roughness: 0.5 });
const BULB_GLASS = new THREE.MeshStandardMaterial({ color: '#fff3dd', emissive: '#fff2d6', emissiveIntensity: 3, roughness: 0.3 });
const SOCKET = new THREE.MeshStandardMaterial({ color: '#d9d6d0', roughness: 0.6, metalness: 0.1, envMapIntensity: INDOOR_ENV_INTENSITY });

interface InstanceSpec {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Vertical offset of the instance centre relative to the ceiling (negative = below). */
  dy: number;
  kind: FixtureKind;
}

const INSTANCES: InstanceSpec[] = [
  { geometry: FLUSH_HOUSING, material: WHITE, dy: -(CEILING_GAP + 0.03), kind: 'flush' },
  { geometry: FLUSH_LENS, material: LENS, dy: -(CEILING_GAP + 0.06 + 0.008), kind: 'flush' },
  { geometry: SPOT_TRIM, material: WHITE, dy: -0.006, kind: 'spot' },
  { geometry: SPOT_LENS, material: LENS, dy: -0.016, kind: 'spot' },
];

function Instanced({ spec, level }: { spec: InstanceSpec; level: LevelId }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const items = useMemo(() => FIXTURES.filter((f) => f.kind === spec.kind && f.level === level), [spec.kind, level]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new THREE.Matrix4();
    items.forEach((f, i) => {
      m.makeTranslation(f.x, f.ceiling + spec.dy, f.z);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
  }, [items, spec.dy]);
  if (items.length === 0) return null;
  return <instancedMesh ref={ref} args={[spec.geometry, spec.material, items.length]} frustumCulled={false} />;
}

function BareBulb({ f }: { f: Fixture }) {
  const y = f.ceiling - CEILING_GAP;
  return (
    <group position={[f.x, y, f.z]}>
      <mesh geometry={BULB_BASE} material={SOCKET} position={[0, -0.015, 0]} />
      <mesh geometry={BULB_STEM} material={SOCKET} position={[0, -0.075, 0]} />
      <mesh geometry={BULB} material={BULB_GLASS} position={[0, -0.15, 0]} />
    </group>
  );
}

/**
 * Ceiling fixtures + their PointLights for every room (35 lights). In orbit (dollhouse) mode the
 * fixtures of the storeys that <House/> hides are hidden too, and their lights are dimmed to 0
 * rather than unmounted so the light count (and therefore every shader program) stays the same.
 */
export function RoomLights() {
  const mode = useStore((s) => s.mode);
  const orbitLevel = useStore((s) => s.orbitLevel);
  // The fixture housings reflect the room, not the sky (their envMapIntensity is already the indoor level).
  const indoor = useIndoorEnvironment();
  useLayoutEffect(() => {
    applyIndoorEnvironment(WHITE, indoor, 1);
    applyIndoorEnvironment(SOCKET, indoor, 1);
  }, [indoor]);
  const orbitIdx = LEVEL_ORDER.indexOf(orbitLevel);
  const bulbs = useMemo(() => FIXTURES.filter((f) => f.kind === 'bulb'), []);
  const levelVisible = (level: LevelId) => mode !== 'orbit' || LEVEL_ORDER.indexOf(level) <= orbitIdx;
  return (
    <group name="room-lights">
      {LEVEL_ORDER.map((level) => (
        <group key={level} visible={levelVisible(level)}>
          {INSTANCES.map((spec, i) => (
            <Instanced key={i} spec={spec} level={level} />
          ))}
          {bulbs
            .filter((f) => f.level === level)
            .map((f, i) => (
              <BareBulb key={i} f={f} />
            ))}
        </group>
      ))}
      {LIGHTS.map((f, i) => (
        <pointLight
          key={i}
          position={[f.x, f.ceiling - LIGHT_DROP[f.kind], f.z]}
          color={LIGHT_COLOR}
          intensity={levelVisible(f.level) ? f.intensity : 0}
          distance={f.distance}
          decay={2}
          castShadow={false}
        />
      ))}
    </group>
  );
}

/** For the integrator's budget report. */
export const ROOM_LIGHT_COUNT = LIGHTS.length;
